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


@router.get("/usage")
async def usage():
    """消耗总览：最近活跃会话 + 按模型聚合（含缓存命中/未命中）。"""
    db = _db_path()
    if not os.path.exists(db):
        return {"session": None, "by_model": [], "error": "state.db not found"}
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    session = None
    try:
        cur.execute(
            "SELECT id, model, input_tokens, output_tokens, cache_read_tokens, "
            "cache_write_tokens, reasoning_tokens, estimated_cost_usd "
            "FROM sessions WHERE id NOT LIKE 'cron_%' "
            "ORDER BY last_activity_at DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            session = {
                "id": (row[0] or "")[:24],
                "model": row[1] or "",
                "input": row[2] or 0,
                "output": row[3] or 0,
                "cache_read": row[4] or 0,
                "cache_write": row[5] or 0,
                "reasoning": row[6] or 0,
            }
    except sqlite3.OperationalError:
        pass
    by_model = []
    try:
        cur.execute(
            "SELECT model, SUM(input_tokens), SUM(output_tokens), "
            "SUM(cache_read_tokens), SUM(cache_write_tokens), SUM(reasoning_tokens) "
            "FROM session_model_usage GROUP BY model "
            "ORDER BY SUM(input_tokens) DESC"
        )
        by_model = [
            {
                "model": r[0] or "?",
                "input": r[1] or 0,
                "output": r[2] or 0,
                "cache_read": r[3] or 0,
                "cache_write": r[4] or 0,
                "reasoning": r[5] or 0,
            }
            for r in cur.fetchall()
        ]
    except sqlite3.OperationalError:
        pass
    conn.close()
    return {"session": session, "by_model": by_model}


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
