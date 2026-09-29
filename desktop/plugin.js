// Hermes-Living-Desktop · 桌面半 v3（磁盘插件）
// v3：主题五套 + 面板内切换 + 设置 + 模块系统（排序/删除/添加 md/编辑）+ ctx.storage 持久化
// 仅可 import：@hermes/plugin-sdk / react / react/jsx-runtime
import { PANES_AREA, THEMES_AREA, requestTheme, useQuery, useValue, host } from '@hermes/plugin-sdk'
import { useState, useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

/* ── ctx.storage 持久化的 useState 封装 ── */
function usePersisted(ctx, key, initial) {
  const [v, setV] = useState(() => ctx.storage.get(key, initial))
  useEffect(() => {
    ctx.storage.set(key, v)
  }, [key, v])
  return [v, setV]
}

/* ── 主题定义（light + dark 双变体）
   accent = 选中行底色，与背景同族的柔和变体（nous 式）；
   亮品牌色只给 primary / ring / midground。 ── */
const THEME_DEFS = {
  starSky: {
    label: 'StarSky', desc: 'Deep navy · starlit',
    light: { bg: '#f5f7fc', bg2: '#e8edf8', text: '#1c2740', muted: '#7e8ca8', accent: '#4a6fd4', accent2: '#7b5fd4', soft: '#dfe8f9' },
    dark:  { bg: '#04060d', bg2: '#0a1226', text: '#dce4f5', muted: '#7e8ca8', accent: '#7ba7ff', accent2: '#a06bff', soft: '#101b38' },
  },
  moon: {
    label: 'Moon', desc: 'Pale moonlight',
    light: { bg: '#f6f6f8', bg2: '#ebebf0', text: '#26282f', muted: '#767b88', accent: '#5a6272', accent2: '#7d6f8f', soft: '#e6e6ec' },
    dark:  { bg: '#121317', bg2: '#1c1d23', text: '#e4e5ea', muted: '#767b88', accent: '#98a1b3', accent2: '#a89bb8', soft: '#22232a' },
  },
  tide: {
    label: 'Tide', desc: 'Deep teal',
    light: { bg: '#eef8f5', bg2: '#dcf0ea', text: '#12302b', muted: '#5f8a80', accent: '#2ba88f', accent2: '#2b7fa8', soft: '#d8ece8' },
    dark:  { bg: '#03100f', bg2: '#07201d', text: '#d8f0ea', muted: '#6f9a90', accent: '#4fd6c0', accent2: '#57a8d4', soft: '#0a2a26' },
  },
  dawn: {
    label: 'Dawn', desc: 'Warm ember',
    light: { bg: '#fdf6ee', bg2: '#f8e8d8', text: '#3a2418', muted: '#a89080', accent: '#c47030', accent2: '#c05030', soft: '#f6e8d8' },
    dark:  { bg: '#140c08', bg2: '#2a1a10', text: '#f7e8d8', muted: '#a89080', accent: '#f0a050', accent2: '#f07050', soft: '#2b1d12' },
  },
  ember: {
    label: 'Ember', desc: 'Crimson glow',
    light: { bg: '#fdf1f5', bg2: '#f9e0ea', text: '#3a1422', muted: '#a87e90', accent: '#d43a60', accent2: '#d45a2a', soft: '#f9e0e8' },
    dark:  { bg: '#0d0408', bg2: '#260a16', text: '#f5dce8', muted: '#a87e90', accent: '#ff6b8a', accent2: '#ff8a4a', soft: '#2a0f1e' },
  },
}

function makeColors(t, ink) {
  return {
    background: t.bg, foreground: t.text,
    card: t.bg2, cardForeground: t.text,
    muted: t.bg2, mutedForeground: t.muted,
    popover: t.bg2, popoverForeground: t.text,
    primary: t.accent, primaryForeground: ink,
    secondary: t.bg2, secondaryForeground: t.text,
    accent: t.soft, accentForeground: t.text,
    border: t.muted, input: t.bg2,
    ring: t.accent,
    midground: t.accent, midgroundForeground: ink,
    destructive: '#d43a60', destructiveForeground: '#ffffff',
  }
}

/* ── 货币 ─────────────────────────────── */
const CURRENCIES = {
  CNY: { symbol: '¥', name: 'CNY', rate: 1 },
  USD: { symbol: '$', name: 'USD', rate: 7.18 },
  EUR: { symbol: '€', name: 'EUR', rate: 7.85 },
  GBP: { symbol: '£', name: 'GBP', rate: 9.15 },
  JPY: { symbol: '¥', name: 'JPY', rate: 0.048 },
}
function fmtMoney(cny, cur) {
  const c = CURRENCIES[cur] || CURRENCIES.CNY
  return c.symbol + (cny / c.rate).toFixed(2)
}
function costOf(u, P) {
  return (u.input || 0) / 1e6 * P.in
    + ((u.output || 0) + (u.reasoning || 0)) / 1e6 * P.out
    + (u.cache_read || 0) / 1e6 * P.cache
}

/* ── 图标（SVG 细线，currentColor 着色） ── */
function GearIcon() {
  return jsx('svg', {
    width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    children: jsx('path', {
      d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    }),
  })
}
function DotsIcon() {
  return jsx('svg', {
    width: 13, height: 13, viewBox: '0 0 24 24', fill: 'currentColor',
    children: jsxs('g', { children: [
      jsx('circle', { cx: 5, cy: 12, r: 1.6 }),
      jsx('circle', { cx: 12, cy: 12, r: 1.6 }),
      jsx('circle', { cx: 19, cy: 12, r: 1.6 }),
    ] }),
  })
}
function ArrowIcon({ up }) {
  return jsx('svg', {
    width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: up ? {} : { transform: 'rotate(180deg)' },
    children: jsx('path', { d: 'm5 15 7-7 7 7' }),
  })
}

/* ── 行动色（demo 金色，固定不随主题） ── */
const GOLD = '#ffd54a'
const GOLD_INK = '#231800'

/* ── 用户上传图 → 主题取色 ── */
function rgbHex(r, g, b) {
  const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}
function lumOf(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b }
function pickColors(img) {
  const S = 48
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const x = c.getContext('2d')
  x.drawImage(img, 0, 0, S, S)
  const d = x.getImageData(0, 0, S, S).data
  const buckets = {}
  let satAcc = null
  let sr = 0, sg = 0, sb = 0, n = 0
  for (let i = 0; i < S * S; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]
    sr += r; sg += g; sb += b; n++
    const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4)
    buckets[key] = (buckets[key] || 0) + 1
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const sat = mx === 0 ? 0 : (mx - mn) / mx
    const lum = lumOf(r, g, b)
    if (sat > 0.4 && lum > 70 && (!satAcc || sat > satAcc.sat)) satAcc = { r, g, b, sat }
  }
  let topKey = null, topN = 0
  for (const k in buckets) { if (buckets[k] > topN) { topN = buckets[k]; topKey = k } }
  const [mr, mg, mb] = topKey.split(',').map(v => (v << 4) + 8)
  return {
    main: { r: mr, g: mg, b: mb },
    avg: { r: sr / n, g: sg / n, b: sb / n },
    accent: satAcc ? rgbHex(satAcc.r, satAcc.g, satAcc.b) : '#7ba7ff',
  }
}
function compressImage(img) {
  // 压缩到宽 ≤1920 的 JPEG，base64 后约 ≤700KB，可安全进 data URL / storage
  const MAXW = 1920
  const scale = Math.min(1, MAXW / (img.width || 1))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.width * scale))
  c.height = Math.max(1, Math.round(img.height * scale))
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

function buildCustomTheme(img) {
  const { main, avg, accent } = pickColors(img)
  const accentLum = lumOf(...hexToRgb(accent))
  const avgLum = lumOf(avg.r, avg.g, avg.b)
  const inkLight = '#ffffff'
  const inkDark = '#0a0f1a'
  // 壁纸走 data URL：CSS url() 无法带鉴权 header，后端路由会 401
  const dataUrl = compressImage(img)

  // 背景遮罩按图的亮度自适应：
  // 暗图 → 轻提亮（图细节可见，浅字依然清晰）
  // 亮图 → 压暗（保文字对比）
  const overlay = avgLum < 80
    ? rgbaStr(255, 255, 255, 0.12)
    : avgLum < 140
      ? rgbaStr(main.r * 0.18, main.g * 0.18, main.b * 0.18, 0.35)
      : rgbaStr(main.r * 0.18, main.g * 0.18, main.b * 0.18, 0.5)

  // dark 主题背景保底亮度，避免暗图把界面压到不可用
  const bgFloor = (v) => Math.max(v, 26)
  const dark = {
    bg: rgbHex(bgFloor(main.r * 0.18), bgFloor(main.g * 0.18), bgFloor(main.b * 0.18)),
    bg2: rgbHex(bgFloor(main.r * 0.32), bgFloor(main.g * 0.32), bgFloor(main.b * 0.32)),
    text: rgbHex(avg.r * 1.5 + 30, avg.g * 1.5 + 30, avg.b * 1.5 + 30),
    muted: rgbHex(avg.r * 0.9 + 20, avg.g * 0.9 + 20, avg.b * 0.9 + 20),
    accent,
    accent2: rgbHex(main.r * 1.6 + 20, main.g * 1.6 + 20, main.b * 1.6 + 20),
    soft: rgbHex(main.r * 0.4 + 8, main.g * 0.4 + 8, main.b * 0.4 + 8),
  }
  const light = {
    bg: rgbHex(main.r * 0.72 + 74, main.g * 0.72 + 74, main.b * 0.72 + 74),
    bg2: rgbHex(main.r * 0.62 + 92, main.g * 0.62 + 92, main.b * 0.62 + 92),
    text: rgbHex(main.r * 0.5 + 6, main.g * 0.5 + 6, main.b * 0.5 + 6),
    muted: rgbHex(avg.r * 0.75 + 18, avg.g * 0.75 + 18, avg.b * 0.75 + 18),
    accent,
    accent2: rgbHex(main.r * 1.2 + 40, main.g * 1.2 + 40, main.b * 1.2 + 40),
    soft: rgbHex(main.r * 0.55 + 110, main.g * 0.55 + 110, main.b * 0.55 + 110),
  }
  return {
    label: 'Custom (from image)',
    light, dark,
    inkLight, inkDark,
    dataUrl, overlay,
  }
}
function rgbaStr(r, g, b, a) {
  return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + a + ')'
}
function hexToRgb(h) {
  const s = h.replace('#', '')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

/* ── 壁纸直设：诊断已证 body 层被 #root 盖死。
   用独立 style 标签 + !important 规则直打 chat-surface，
   绕开 React 重渲染对 inline style 的覆盖。 ── */
const WALL_STYLE_ID = 'hld-wall-style'
function wallOverlay(overlay, dim) {
  // dim: 0–100 绝对控制遮罩浓度（0 无遮罩，100 最暗），未传则用自适应 overlay
  if (dim === undefined || dim === null) return overlay
  const alpha = (dim / 100) * 0.85
  return 'rgba(4,6,13,' + alpha.toFixed(2) + ')'
}
function applyWall(dataUrl, overlay, dim) {
  let el = document.getElementById(WALL_STYLE_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = WALL_STYLE_ID
    el.dataset.hermesSkinCSS = 'true'
    document.head.appendChild(el)
  }
  const ov = wallOverlay(overlay, dim)
  el.textContent = '[data-chat-surface]{background-color:transparent !important;background-image:linear-gradient(' + ov + ',' + ov
    + '),url("' + dataUrl + '") !important;background-size:cover !important;'
    + 'background-position:center !important;background-repeat:no-repeat !important;}'
    + '[data-chat-surface] > *{background-color:transparent !important;}'
  return true
}
function clearWall() {
  const el = document.getElementById(WALL_STYLE_ID)
  if (el) el.remove()
}

/* ── 迷你 md 渲染（jsx 构建，零 innerHTML，天然防注入） ──
   链接白名单（灰显不可点）推迟到 2.0，当前正常渲染。 */
function mdInline(text) {
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]*\]\([^)]*\))/g
  let last = 0, m, k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(jsx('span', { key: 't' + k++, children: text.slice(last, m.index) }))
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push(jsx('strong', { key: 'b' + k++, style: { fontWeight: 600, color: 'var(--ui-text-secondary)' }, children: tok.slice(2, -2) }))
    } else if (tok.startsWith('`')) {
      out.push(jsx('code', { key: 'c' + k++, style: { fontSize: '0.92em', padding: '1px 5px', borderRadius: 4, background: 'var(--ui-accent)', color: 'var(--ui-text-secondary)' }, children: tok.slice(1, -1) }))
    } else {
      const lm = tok.match(/^\[([^\]]*)\]\(([^)]*)\)$/)
      const label = lm[1], href = lm[2]
      // 2.0 前正常渲染，链接白名单后续再加
      out.push(jsx('a', { key: 'a' + k++, href, style: { color: GOLD, textDecoration: 'underline' }, children: label }))
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(jsx('span', { key: 'e' + k++, children: text.slice(last) }))
  return out
}
function mdBlocks(md) {
  const lines = (md || '').split(/\r?\n/)
  const blocks = []
  let list = null
  const flush = () => { if (list) { blocks.push(list); list = null } }
  lines.forEach((raw, i) => {
    const ln = raw.trimEnd()
    const hm = ln.match(/^(#{1,3})\s+(.*)$/)
    if (hm) {
      flush()
      const size = hm[1].length === 1 ? 15 : hm[1].length === 2 ? 13 : 12
      blocks.push(jsx('div', {
        key: 'h' + i,
        style: { fontSize: size, fontWeight: 600, color: 'var(--ui-text-secondary)', margin: '2px 0' },
        children: mdInline(hm[2]),
      }))
      return
    }
    const lm = ln.match(/^\s*[-*]\s+(.*)$/)
    if (lm) {
      if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', key: 'u' + i, items: [] } }
      list.items.push(lm[1])
      return
    }
    const ol = ln.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ol) {
      if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', key: 'o' + i, items: [] } }
      list.items.push(ol[1])
      return
    }
    flush()
    if (ln.trim() === '') return
    blocks.push(jsx('div', { key: 'p' + i, style: { fontSize: 12, lineHeight: 1.6, color: 'var(--ui-text-secondary)' }, children: mdInline(ln) }))
  })
  flush()
  return blocks.map(b => {
    if (b && (b.type === 'ul' || b.type === 'ol')) {
      const Tag = b.type === 'ol' ? 'ol' : 'ul'
      return jsx(Tag, {
        key: b.key,
        style: { margin: '2px 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: 'var(--ui-text-secondary)' },
        children: b.items.map((it, j) => jsx('li', { key: j, children: mdInline(it) })),
      })
    }
    return b
  })
}

/* ── 模块默认配置 ── */
const DEFAULT_MODULES = [
  { id: 'usage', kind: 'usage', title: 'USAGE' },
  { id: 'todo', kind: 'todo', title: 'TODO' },
  { id: 'md-notes', kind: 'md', title: 'Notes', content: '# Notes\nPaste your own markdown.\n\n- first item\n- second item' },
]

export default {
  id: 'hermes-living-desktop',
  name: 'Live Desk',
  register(ctx) {
    const P = { in: 2, out: 8, cache: 0.5 }

    Object.entries(THEME_DEFS).forEach(([key, t]) => {
      ctx.register({
        id: 'theme-' + key,
        area: THEMES_AREA,
        data: {
          name: 'hld-' + key,
          label: t.label,
          description: t.desc,
          colors: makeColors(t.light, '#ffffff'),
          darkColors: makeColors(t.dark, '#0a0f1a'),
        },
      })
    })

    /* 壁纸能力实测主题：customCSS 引本地图 → body 背景 */
    ctx.register({
      id: 'theme-wallpaper-test',
      area: THEMES_AREA,
      data: {
        name: 'hld-wallpaper-test',
        label: 'Shorekeeper Wall (test)',
        description: 'Wallpaper test — local image via customCSS',
        colors: makeColors(THEME_DEFS.starSky.light, '#ffffff'),
        darkColors: makeColors(THEME_DEFS.starSky.dark, '#0a0f1a'),
        // 红色测试：验证动态注册主题的 customCSS 注入链路
        // 切到本主题若界面变红 = 链路通；不变 = 链路断
        customCSS: 'body{background:#ff0000 !important} img[src*="filler-bg0"]{display:none !important}',
      },
    })

    const row = (label, value) =>
      jsxs('div', {
        style: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 },
        children: [
          jsx('span', { style: { color: 'var(--ui-text-tertiary)' }, children: label }),
          jsx('span', { style: { color: 'var(--ui-text-secondary)', fontWeight: 500 }, children: value }),
        ],
      })

    const iconBtn = (onClick, title, children) =>
      jsx('button', {
        onClick, title,
        style: {
          width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid transparent',
          background: 'transparent', color: GOLD,
        },
        children,
      })

    function UsageCard({ session, sc, tc, currency }) {
      return jsxs('div', {
        style: {
          border: '1px solid var(--ui-stroke-secondary)', borderRadius: 12,
          padding: '10px 12px',
          background: 'color-mix(in oklab, ' + GOLD + ' 4%, transparent)',
        },
        children: [
          jsx('div', { style: { fontSize: 24, fontWeight: 300, color: 'var(--ui-text-secondary)' }, children: fmtMoney(sc, currency) }),
          row('session', session?.model || '—'),
          row('input · miss', session ? (session.input / 1e6).toFixed(2) + 'M' : '—'),
          row('cache · hit', session ? (session.cache_read / 1e6).toFixed(2) + 'M' : '—'),
          row('all-time (main)', fmtMoney(tc, currency)),
        ],
      })
    }

    function TodoList({ items }) {
      return jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children:
        (items || []).map((it, i) =>
          jsxs('div', {
            key: i,
            style: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 },
            children: [
              jsx('span', {
                style: {
                  width: 14, height: 14, borderRadius: 4, fontSize: 9, flex: 'none', marginTop: 1,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: it.tag === 'yellow' ? 'rgba(255,200,90,0.15)' : 'rgba(255,110,110,0.15)',
                  color: it.tag === 'yellow' ? '#ffcc66' : '#ff8a8a',
                },
                children: '●',
              }),
              jsx('span', { style: { color: 'var(--ui-text-secondary)', lineHeight: 1.5 }, children: it.text }),
            ],
          }),
        ),
      })
    }

    function LivePanel() {
      const { data } = useQuery({
        queryKey: ['hld', 'usage'],
        queryFn: () => ctx.rest('/usage'),
        refetchInterval: 20000,
      })
      const todos = useQuery({
        queryKey: ['hld', 'todo'],
        queryFn: () => ctx.rest('/todo'),
        refetchInterval: 60000,
      })
      const focused = useValue(host.state.focusedUsage)

      const [currency, setCurrency] = usePersisted(ctx, 'currency', 'CNY')
      const [theme, setTheme] = usePersisted(ctx, 'theme', 'hld-starSky')
      const [matOn, setMatOn] = usePersisted(ctx, 'matOn', true)
      const [opacity, setOpacity] = usePersisted(ctx, 'opacity', 100)
      const [showSet, setShowSet] = usePersisted(ctx, 'showSet', false)
      const [modules, setModules] = usePersisted(ctx, 'modules', DEFAULT_MODULES)
      const [menuId, setMenuId] = useState(null)
      const [editingId, setEditingId] = useState(null)
      const [wallState, setWallState] = useState('idle') // idle/loading/ok/error
      const [wallDim, setWallDim] = usePersisted(ctx, 'wallDim', 45)

      // 挂载恢复壁纸（storage 读回 → 重设 chat-surface，dim 用保存值）
      useEffect(() => {
        const wd = ctx.storage.get('wallData', null)
        if (wd && wd.dataUrl) {
          applyWall(wd.dataUrl, wd.overlay || 'rgba(4,6,13,0.35)', wallDim)
        }
      }, [])

      const session = data?.session
      const byModel = data?.by_model || []
      const sc = session ? costOf(session, P) : 0
      const main = byModel.find(m => !m.model.includes('flash') && !m.model.includes('vl') && !m.model.includes('vision'))
      const tc = main ? costOf(main, P) : 0

      const applyTheme = (key) => {
        const name = 'hld-' + key
        setTheme(name)
        requestTheme(name)
      }

      const moveModule = (id, dir) => {
        setModules(prev => {
          const arr = prev.slice()
          const i = arr.findIndex(m => m.id === id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= arr.length) return prev
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t
          return arr
        })
      }
      const removeModule = (id) => {
        setModules(prev => prev.filter(m => m.id !== id))
        setMenuId(null)
      }
      const addModule = () => {
        const id = 'md-' + Date.now().toString(36)
        setModules(prev => [...prev, { id, kind: 'md', title: 'New note', content: '# New note\nWrite something…' }])
        setEditingId(id)
      }
      const saveModule = (id, content) => {
        setModules(prev => prev.map(m => (m.id === id ? { ...m, content } : m)))
        setEditingId(null)
      }

      const onPickImage = (file) => {
        if (!file) return
        if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { setWallState('type'); return }
        if (file.size > 50 * 1024 * 1024) { setWallState('big'); return }
        setWallState('loading')
        const fr = new FileReader()
        fr.onload = () => {
          const img = new Image()
          img.onload = () => {
            try {
              const t = buildCustomTheme(img)
              // 壁纸直设 chat-surface（body 层被 #root 盖死，见诊断）
              applyWall(t.dataUrl, t.overlay, wallDim)
              // 存 storage：重启后重设
              ctx.storage.set('wallData', { dataUrl: t.dataUrl, overlay: t.overlay })
              // 动态注册/替换用户主题（同 id 重注册即替换），只做取色配色
              ctx.register({
                id: 'theme-custom',
                area: THEMES_AREA,
                data: {
                  name: 'hld-custom',
                  label: t.label,
                  description: 'Generated from your image',
                  colors: makeColors(t.light, t.inkLight),
                  darkColors: makeColors(t.dark, t.inkDark),
                },
              })
            } catch (e) { /* 取色失败不阻塞上传 */ }
            // SDK 的 upload 通道：自动带鉴权（原生 fetch 无 token 会被 401 拒绝）
            file.arrayBuffer().then(buf => ctx.rest('/upload', {
              method: 'POST',
              upload: { filename: file.name, contentType: file.type || 'image/png', bytes: buf },
            }))
              .then(j => {
                if (j.ok) {
                  setWallState('ok')
                  setTheme('hld-custom')
                  requestTheme('hld-custom')
                } else {
                  setWallState('error')
                }
              })
              .catch(() => setWallState('error'))
          }
          img.onerror = () => setWallState('error')
          img.src = fr.result
        }
        fr.onerror = () => setWallState('error')
        fr.readAsDataURL(file)
      }

      const renderModuleBody = (m) => {
        if (m.kind === 'usage') return jsx(UsageCard, { session, sc, tc, currency })
        if (m.kind === 'todo') return jsx(TodoList, { items: todos.data?.items })
        if (m.kind === 'md') {
          if (editingId === m.id) {
            let draft = m.content
            return jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: [
              jsx('textarea', {
                defaultValue: draft,
                onChange: (e) => { draft = e.target.value },
                style: {
                  width: '100%', minHeight: 120, resize: 'vertical',
                  background: 'transparent', border: '1px solid var(--ui-stroke-secondary)',
                  borderRadius: 8, padding: 8, fontSize: 12, color: 'var(--ui-text-secondary)',
                  fontFamily: 'inherit',
                },
              }),
              jsxs('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' }, children: [
                jsx('button', {
                  onClick: () => setEditingId(null),
                  style: { fontSize: 11, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--ui-stroke-secondary)', background: 'transparent', color: 'var(--ui-text-tertiary)' },
                  children: 'Cancel',
                }),
                jsx('button', {
                  onClick: () => saveModule(m.id, draft),
                  style: { fontSize: 11, padding: '3px 12px', borderRadius: 999, cursor: 'pointer', border: 'none', background: GOLD, color: GOLD_INK },
                  children: 'Save',
                }),
              ] }),
            ] })
          }
          return jsx('div', { style: { fontSize: 12 }, children: mdBlocks(m.content) })
        }
        return null
      }

      return jsxs('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
          height: '100%', overflowY: 'auto', fontSize: 13,
          // 大块背景 = Hermes 当前默认色（材质开只叠 3% 金色光泽）
          background: matOn
            ? 'color-mix(in oklab, ' + GOLD + ' 3%, transparent)'
            : 'transparent',
          backdropFilter: matOn ? 'blur(18px) saturate(160%)' : 'none',
          WebkitBackdropFilter: matOn ? 'blur(18px) saturate(160%)' : 'none',
          borderRadius: 16,
          border: '1px solid var(--ui-stroke-secondary)',
          transition: 'background 0.3s',
        },
        children: [
          /* 头部 */
          jsxs('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
            children: [
              jsx('div', {
                style: { fontSize: 11, letterSpacing: 2, color: 'var(--ui-text-tertiary)' },
                children: 'LIVE DESK',
              }),
              jsxs('div', { style: { display: 'flex', gap: 5, alignItems: 'center' }, children: [
                Object.keys(THEME_DEFS).map(key => {
                  const t = THEME_DEFS[key]
                  const active = theme === 'hld-' + key
                  // Moon 特殊：明显 45° 白灰分割线（月相明暗面）
                  // 其余圆点：原双色渐变
                  const bg = key === 'moon'
                    ? 'linear-gradient(225deg, #fbfbfc 0%, #fbfbfc 48.5%, #8a8f9c 50%, #8a8f9c 100%)'
                    : 'linear-gradient(135deg, ' + t.dark.bg + ', ' + t.dark.accent + ')'
                  return jsx('button', {
                    key: key,
                    title: t.label,
                    onClick: () => applyTheme(key),
                    style: {
                      width: 19, height: 19, borderRadius: '50%', cursor: 'pointer',
                      border: active ? '2px solid ' + GOLD : '1px solid var(--ui-stroke-secondary)',
                      background: bg,
                      boxShadow: active ? '0 0 6px ' + GOLD : 'none',
                    },
                  })
                }),
                jsx('button', {
                  onClick: () => setShowSet(!showSet),
                  title: 'Settings',
                  style: {
                    width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid ' + GOLD,
                    background: showSet ? GOLD : 'transparent',
                    color: showSet ? GOLD_INK : GOLD,
                  },
                  children: jsx(GearIcon, {}),
                }),
              ] }),
            ],
          }),

          /* 设置面板 */
          showSet ? jsxs('div', {
            style: {
              display: 'flex', flexDirection: 'column', gap: 8,
              borderTop: '1px solid var(--ui-stroke-secondary)', paddingTop: 8,
            },
            children: [
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
                children: [
                  jsx('span', { style: { fontSize: 11, color: 'var(--ui-text-tertiary)' }, children: 'Material' }),
                  jsx('button', {
                    onClick: () => setMatOn(!matOn),
                    style: {
                      width: 34, height: 19, borderRadius: 999, cursor: 'pointer', position: 'relative',
                      border: 'none', background: matOn ? GOLD : 'var(--ui-stroke-secondary)',
                    },
                    children: jsx('span', {
                      style: {
                        position: 'absolute', top: 2, left: matOn ? 17 : 2,
                        width: 15, height: 15, borderRadius: '50%', background: matOn ? GOLD_INK : '#fff',
                        transition: 'left 0.2s',
                      },
                    }),
                  }),
                ],
              }),
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 8 },
                children: [
                  jsx('span', { style: { fontSize: 11, color: 'var(--ui-text-tertiary)', minWidth: 48 }, children: 'Opacity' }),
                  jsx('input', {
                    type: 'range', min: 20, max: 100, value: opacity,
                    onChange: (e) => setOpacity(Number(e.target.value)),
                    style: { flex: 1, accentColor: GOLD },
                  }),
                  jsx('span', { style: { fontSize: 10, color: GOLD, minWidth: 34, textAlign: 'right' }, children: opacity + '%' }),
                ],
              }),
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 6 },
                children: [
                  jsx('span', { style: { fontSize: 11, color: 'var(--ui-text-tertiary)', minWidth: 48 }, children: 'Money' }),
                  Object.keys(CURRENCIES).map(c =>
                    jsx('button', {
                      key: c,
                      onClick: () => setCurrency(c),
                      style: {
                        fontSize: 10, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                        border: '1px solid ' + (currency === c ? GOLD : 'var(--ui-stroke-secondary)'),
                        background: currency === c ? GOLD : 'transparent',
                        color: currency === c ? GOLD_INK : 'var(--ui-text-secondary)',
                      },
                      children: c,
                    }),
                  ),
                ],
              }),
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 6 },
                children: [
                  jsx('span', { style: { fontSize: 11, color: 'var(--ui-text-tertiary)', minWidth: 48 }, children: 'Wallpaper' }),
                  jsx('label', {
                    style: {
                      fontSize: 10, padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                      border: '1px solid ' + GOLD, color: GOLD, background: 'transparent',
                    },
                    children: jsxs('span', { children: [
                      wallState === 'loading' ? 'Reading…' : 'Upload image',
                      jsx('input', {
                        type: 'file', accept: 'image/png,image/jpeg,image/webp',
                        style: { display: 'none' },
                        onChange: (e) => { onPickImage(e.target.files && e.target.files[0]); e.target.value = '' },
                      }),
                    ] }),
                  }),
                  jsx('span', {
                    style: { fontSize: 10, color: wallState === 'ok' ? GOLD : 'var(--ui-text-tertiary)' },
                    children: wallState === 'ok' ? 'Applied — theme + wallpaper' : wallState === 'error' ? 'Upload failed' : wallState === 'type' ? 'png / jpg / webp only' : wallState === 'big' ? 'Over 50MB' : 'auto theme from colors',
                  }),
                ],
              }),
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 8 },
                children: [
                  jsx('span', { style: { fontSize: 11, color: 'var(--ui-text-tertiary)', minWidth: 48 }, children: 'Dim' }),
                  jsx('input', {
                    type: 'range', min: 0, max: 100, value: wallDim,
                    onChange: (e) => {
                      const v = Number(e.target.value)
                      setWallDim(v)
                      const wd = ctx.storage.get('wallData', null)
                      if (wd && wd.dataUrl) applyWall(wd.dataUrl, wd.overlay || 'rgba(4,6,13,0.35)', v)
                    },
                    style: { flex: 1, accentColor: GOLD },
                  }),
                  jsx('span', { style: { fontSize: 10, color: GOLD, minWidth: 34, textAlign: 'right' }, children: wallDim + '%' }),
                ],
              }),
            ],
          }) : null,

          /* 模块列表 */
          modules.map((m, idx) =>
            jsxs('div', {
              key: m.id,
              style: {
                display: 'flex', flexDirection: 'column', gap: 6,
                border: '1px solid var(--ui-stroke-secondary)', borderRadius: 12, padding: '10px 12px',
              },
              children: [
                jsxs('div', {
                  style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
                  children: [
                    jsx('div', { style: { fontSize: 10, letterSpacing: 1.2, color: 'var(--ui-text-tertiary)' }, children: m.title }),
                    jsx('button', {
                      onClick: () => setMenuId(menuId === m.id ? null : m.id),
                      title: 'Options',
                      style: {
                        width: 22, height: 22, borderRadius: 6, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: 'none', background: 'transparent', color: GOLD,
                      },
                      children: jsx(DotsIcon, {}),
                    }),
                  ],
                }),
                renderModuleBody(m),
                menuId === m.id ? jsxs('div', {
                  style: {
                    display: 'flex', gap: 2, paddingTop: 6,
                    borderTop: '1px solid var(--ui-stroke-secondary)',
                  },
                  children: [
                    iconBtn(() => moveModule(m.id, -1), 'Move up', jsx(ArrowIcon, { up: true })),
                    iconBtn(() => moveModule(m.id, 1), 'Move down', jsx(ArrowIcon, { up: false })),
                    m.kind === 'md' ? iconBtn(() => setEditingId(m.id), 'Edit', jsx('span', { style: { fontSize: 11 }, children: '✎' })) : null,
                    iconBtn(() => removeModule(m.id), 'Delete', jsx('span', { style: { fontSize: 12 }, children: '×' })),
                    idx === 0 ? jsx('span', { style: { alignSelf: 'center', marginLeft: 'auto', fontSize: 10, color: 'var(--ui-text-tertiary)' }, children: 'first' }) : null,
                  ],
                }) : null,
              ],
            }),
          ),

          /* 添加模块 */
          jsx('button', {
            onClick: addModule,
            title: 'Add a markdown module',
            style: {
              width: '100%', padding: '7px 0', borderRadius: 10, cursor: 'pointer',
              border: '1px dashed ' + GOLD,
              background: 'transparent', color: GOLD, fontSize: 12,
            },
            children: '+ Add module',
          }),

          focused ? jsx('div', {
            style: { fontSize: 10, color: 'var(--ui-text-tertiary)' },
            children: 'live: ' + ((focused?.total_tokens || 0) / 1000).toFixed(0) + 'K tokens',
          }) : null,
        ],
      })
    }

    ctx.register({
      id: 'pane',
      area: PANES_AREA,
      title: 'Live Desk',
      data: {
        placement: 'main',
        dock: { pane: 'files', pos: 'center', enforce: true },
        width: '320px',
        minWidth: '280px',
        maxWidth: '420px',
        hideOnly: true,
      },
      render: () => jsx(LivePanel, {}),
    })
  },
}
