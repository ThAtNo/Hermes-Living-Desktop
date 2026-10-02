"""Hermes-Living-Desktop 插件后端。

数据源：Hermes 本机 state.db（只读）+ 待办清单 md（只读）。
零网络、零写入。命中/未命中 = cache_read / input tokens。
"""
import os
import re
import sqlite3
from fastapi import APIRouter
from fastapi.responses import FileResponse
from fastapi import UploadFile

router = APIRouter()

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
MAX_WALLPAPER_BYTES = 50 * 1024 * 1024  # 50MB 红线


def _asset_path(name: str) -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "assets", name)


def _hermes_home() -> str:
    return os.environ.get("HERMES_HOME") or os.path.expanduser("~/.hermes")


def _db_path() -> str:
    return os.path.join(_hermes_home(), "state.db")


def _todo_path() -> str:
    """待办清单路径：插件目录下的 todo_path.txt 指向真实文件（一行一个路径）。
    不存在时返回 None，前端给空列表。"""
    here = os.path.dirname(os.path.abspath(__file__))
    marker = os.path.join(here, "todo_path.txt")
    if os.path.exists(marker):
        p = open(marker, encoding="utf-8").read().strip()
        if p and os.path.exists(p):
            return p
    default = os.path.join(_hermes_home(), "todo.md")
    return default if os.path.exists(default) else None


def _pick_cost(est: float, act: float, status: str, source: str):
    """Cost 优先级：actual（真账单）> estimated（价表估算）> included（订阅已含，0）> unknown。
    返回 (cost_usd, cost_status, cost_source)。全部 USD Base。"""
    if act and act > 0:
        return act, "actual", source or "provider"
    if est and est > 0:
        return est, status or "estimated", source or "official_docs_snapshot"
    if status == "included":
        return 0.0, "included", source or "subscription"
    return 0.0, "unknown", source or "none"


@router.get("/usage")
async def usage():
    """消耗总览三层：session / all_time（真全量汇总）/ by_model。
    全部使用 Hermes 原生 estimated/actual cost（USD Base），前端只做币种显示转换。"""
    db = _db_path()
    if not os.path.exists(db):
        return {"session": None, "all_time": None, "by_model": [], "error": "state.db not found"}
    conn = sqlite3.connect(db)
    cur = conn.cursor()

    def col(session_row, name):
        try:
            return session_row[name] or 0
        except Exception:
            return 0

    session = None
    try:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            "SELECT id, model, input_tokens, output_tokens, cache_read_tokens, "
            "cache_write_tokens, reasoning_tokens, estimated_cost_usd, actual_cost_usd, "
            "cost_status, cost_source FROM sessions WHERE id NOT LIKE 'cron_%' "
            "ORDER BY last_activity_at DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            cost_usd, cost_status, cost_source = _pick_cost(
                col(row, "estimated_cost_usd"), col(row, "actual_cost_usd"),
                row["cost_status"] or "", row["cost_source"] or "")
            session = {
                "id": (row["id"] or "")[:24],
                "model": row["model"] or "",
                "input": col(row, "input_tokens"),
                "output": col(row, "output_tokens"),
                "cache_read": col(row, "cache_read_tokens"),
                "cache_write": col(row, "cache_write_tokens"),
                "reasoning": col(row, "reasoning_tokens"),
                "cost_usd": cost_usd,
                "cost_status": cost_status,
                "cost_source": cost_source,
            }
    except sqlite3.OperationalError:
        pass

    all_time = None
    by_model = []
    try:
        # 真 All-time：session_model_usage 全量 SUM（含 cron/vision/一切 task）。
        cur.execute(
            "SELECT SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens), "
            "SUM(cache_write_tokens), SUM(reasoning_tokens), "
            "SUM(estimated_cost_usd), SUM(actual_cost_usd), COUNT(*) "
            "FROM session_model_usage"
        )
        r = cur.fetchone()
        if r and r[0] is not None:
            cost_usd, cost_status, cost_source = _pick_cost(
                r[5] or 0.0, r[6] or 0.0, "estimated", "aggregate")
            all_time = {
                "input": r[0] or 0, "output": r[1] or 0,
                "cache_read": r[2] or 0, "cache_write": r[3] or 0,
                "reasoning": r[4] or 0,
                "cost_usd": cost_usd, "cost_status": cost_status, "cost_source": cost_source,
                "rows": r[7] or 0,
            }
        # By Model：按 model 合并多 billing 行（token 全收，cost 加总）。
        cur.execute(
            "SELECT model, SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens), "
            "SUM(cache_write_tokens), SUM(reasoning_tokens), "
            "SUM(estimated_cost_usd), SUM(actual_cost_usd), "
            "MAX(cost_status), MAX(cost_source) "
            "FROM session_model_usage GROUP BY model "
            "ORDER BY SUM(input_tokens) DESC"
        )
        for r in cur.fetchall():
            cost_usd, cost_status, cost_source = _pick_cost(
                r[6] or 0.0, r[7] or 0.0, r[8] or "", r[9] or "")
            by_model.append({
                "model": r[0] or "?",
                "input": r[1] or 0, "output": r[2] or 0,
                "cache_read": r[3] or 0, "cache_write": r[4] or 0,
                "reasoning": r[5] or 0,
                "cost_usd": cost_usd, "cost_status": cost_status, "cost_source": cost_source,
            })
    except sqlite3.OperationalError:
        pass
    conn.close()
    return {"session": session, "all_time": all_time, "by_model": by_model}


def _parse_todo(text: str) -> list:
    """取「明日」/「本周」节的编号条目，前 8 条，返回 {tag, text}。"""
    lines = text.splitlines()
    items = []
    in_section = False
    for ln in lines:
        if re.match(r"^##\s", ln):
            in_section = "明日" in ln or "本周" in ln
            continue
        if not in_section:
            continue
        m = re.match(r"^\d+\.\s+(?:🔴|🟡|🟢)?\s*(?:简|守岸人|军师|选品专家|折枝)[\s：:]*(.*)$", ln)
        if m:
            text_part = m.group(1).strip()
            tag = "red" if "🔴" in ln else ("yellow" if "🟡" in ln else "green")
            items.append({"tag": tag, "text": text_part[:60]})
            if len(items) >= 8:
                break
    return items


@router.get("/wallpaper")
async def wallpaper():
    """壁纸图片：插件 assets 目录，本地 HTTP 提供（renderer 无法加载 file://）。"""
    p = _asset_path("wallpaper.png")
    if not os.path.exists(p):
        return {"error": "wallpaper.png not found"}
    return FileResponse(p, media_type="image/png")


@router.post("/upload")
async def upload(file: UploadFile):
    """用户主动上传壁纸图（明确授权的本地写入）。
    只收 png/jpg/webp，≤50MB，固定存 assets/wallpaper.png。"""
    name = file.filename or ""
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXT:
        return {"ok": False, "error": "only png / jpg / webp"}
    data = await file.read()
    if len(data) > MAX_WALLPAPER_BYTES:
        return {"ok": False, "error": "over 50MB"}
    if not data:
        return {"ok": False, "error": "empty file"}
    assets = os.path.dirname(_asset_path("wallpaper.png"))
    os.makedirs(assets, exist_ok=True)
    with open(os.path.join(assets, "wallpaper.png"), "wb") as f:
        f.write(data)
    return {"ok": True, "bytes": len(data)}


@router.get("/todo")
async def todo():
    path = _todo_path()
    if not path:
        return {"items": []}
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return {"items": []}
    return {"items": _parse_todo(text)}
