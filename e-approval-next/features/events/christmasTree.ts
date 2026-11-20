/**
 * 크리스마스 효과 (canvas 2D) — 모자이크 트리 + 눈 결정
 *
 * 트리: 작은 칸(LED 전광판처럼) 약 4,000개를 촘촘히 박아 만든 입체 트리
 *   - 6단으로 풍성하게 부푼 가지 (좌우 대칭) + 원뿔 음영 + 양쪽 가장자리 테두리 빛 + 가지 끝에 쌓인 눈
 *   - 나선으로 감는 금색 장식 줄 + 빨강·흰색 구슬 줄 (뒤로 돌아가는 부분은 가려짐), 줄을 따라 흐르는 빛
 *   - 큰 방울 장식, 전구 140개 (색·속도 제각각), 반짝 섬광, 꼭대기 큰 오각 별 + 빛 번짐
 *   - 무늬·리본·나비매듭이 있는 선물 상자 6개, 눈 더미
 *   처음 한 번 바닥에서부터 조립되고, 그 뒤로는 그대로 서서 불빛만 반짝인다.
 * 눈: 육각 눈 결정 3종(가지형·판형·별형)을 크기별로(먼 눈·중간·가까운 눈) 내린다.
 *
 * startChristmasTree(canvas, getAnchor) → 정지 함수
 *   getAnchor(): 트리 가운데 x, 트리 맨 아래(눈 더미 바닥) y, 트리 전체 높이(px). null 이면 트리는 안 그림
 *   treeAspect(): 트리 폭 ÷ 높이 (자리 계산용)
 */

export interface TreeAnchor {
  x: number
  bottom: number
  height: number
}

type RGB = [number, number, number]

interface Cell {
  gx: number // 칸 좌표 (밑동 가운데 = 0, 위로 갈수록 음수)
  gy: number
  color: string
  layer: number // 그리는 순서 (0 눈 더미, 1 줄기, 2 잎, 3 장식, 4 선물, 5 별)
  sx: number // 조립 전 흩어진 자리
  sy: number
  delay: number // 0~1, 조립 출발 순서
}

interface Bulb {
  gx: number
  gy: number
  color: string
  speed: number
  phase: number
}

interface GarlandPoint {
  gx: number
  gy: number
  t: number // 줄 위 위치 0~1
  depth: number
}

/* ------------------------------------------------------------------ 도구 */

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const css = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const scale = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]

/** 여러 색 사이를 0~1 로 이어 주는 팔레트 */
function ramp(stops: string[]) {
  const cs = stops.map(hex)
  return (v: number) => {
    const x = clamp(v) * (cs.length - 1)
    const i = Math.min(cs.length - 2, Math.floor(x))
    return mix(cs[i], cs[i + 1], x - i)
  }
}

/** 색을 몇 단계로 묶어서 같은 그림(스프라이트)을 다시 쓰게 함 */
const quant = (c: RGB): RGB => [Math.round(c[0] / 6) * 6, Math.round(c[1] / 6) * 6, Math.round(c[2] / 6) * 6]

const LEAF = ramp(['#04281a', '#0a4229', '#12643a', '#1d8a4f', '#30b46a', '#62d993', '#b4f5cc'])
const GOLD = ramp(['#8a5a0c', '#cf8f1d', '#f5c04a', '#ffe9a6', '#fffbe8'])
const TRUNK = ramp(['#3b2414', '#5c3a22', '#7d5232'])
const SNOW = ramp(['#55678f', '#9cb0d6', '#e4ecfb'])
const BULB_COLORS = ['#ff4d5e', '#4da3ff', '#ffd24d', '#ff7ad9', '#ff4d5e', '#ffb347', '#9ad8ff', '#c792ff']
const BAUBLE_COLORS = ['#e23b4e', '#f2c14e', '#d6dde8', '#3f7cf0', '#e23b4e', '#b55ce0']

/* ------------------------------------------------------------------ 트리 설계 (칸 단위) */

const FOLIAGE = 64 // 잎 높이 (칸)
const TRUNK_ROWS = 4
const STAR_R = 9
const BASE = -TRUNK_ROWS // 잎 맨 아래 행의 gy
const TOP = BASE - (FOLIAGE - 1) // 잎 맨 위 행의 gy
const STAR_CY = TOP - STAR_R + 1

// 위에서부터 6단. top/bottom: 잎 영역 안 행 번호(0 = 꼭대기), w0/w1: 그 단의 위·아래 반폭
const TIERS = [
  { top: 0, bottom: 12, w0: 0.8, w1: 9.5 },
  { top: 9, bottom: 22, w0: 4.5, w1: 15.5 },
  { top: 19, bottom: 33, w0: 7.5, w1: 21 },
  { top: 30, bottom: 44, w0: 10.5, w1: 26.5 },
  { top: 41, bottom: 54, w0: 13.5, w1: 31.5 },
  { top: 51, bottom: FOLIAGE - 1, w0: 16, w1: 36 },
]

function tierHalf(t: (typeof TIERS)[number], k: number) {
  // 아래로 갈수록 넓어지되, 가운데가 볼록하게 부풀어 통통한 가지
  return t.w0 + (t.w1 - t.w0) * Math.pow(k, 1.1) + Math.sin(k * Math.PI) * 1.6
}

/** 행 r(0=꼭대기)에서 칸 c 가 속한 단 (위쪽 단이 아래 단을 덮음). 좌우 대칭 */
function tierAt(r: number, c: number) {
  const ac = Math.abs(c)
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i]
    if (r < t.top || r > t.bottom) continue
    const k = (r - t.top) / (t.bottom - t.top)
    let half = tierHalf(t, k)
    // 단 아래 가장자리: 가지 끝이 둥글게 늘어짐 (좌우 똑같이)
    if (r > t.bottom - 3) {
      const wave = (1 - Math.cos(ac * 0.72)) * 0.5
      half -= wave * (r - (t.bottom - 3)) * 1.15
    }
    if (ac <= half) return { i, k, half }
  }
  return null
}

function halfWidth(r: number): number {
  let h = 0
  for (const t of TIERS) {
    if (r < t.top || r > t.bottom) continue
    h = Math.max(h, tierHalf(t, (r - t.top) / (t.bottom - t.top)))
  }
  return h
}

function insideStar(x: number, y: number, R: number, r: number): boolean {
  // 꼭짓점이 위를 향한 오각 별 (짝수-홀수 규칙)
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 === 0 ? R : r
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad])
  }
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

interface Tree {
  cells: Cell[]
  bulbs: Bulb[]
  garland: GarlandPoint[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function buildTree(): Tree {
  const rand = rng(20261225)
  const cells: Cell[] = []
  const bulbs: Bulb[] = []
  const garland: GarlandPoint[] = []
  const occupied = new Map<string, number>() // 좌표 → cells 의 위치
  const put = (gx: number, gy: number, color: RGB, layer: number) => {
    const key = `${gx},${gy}`
    const idx = occupied.get(key)
    if (idx !== undefined && cells[idx].layer > layer) return
    const cell: Cell = { gx, gy, color: css(quant(color)), layer, sx: 0, sy: 0, delay: 0 }
    if (idx !== undefined) cells[idx] = cell
    else {
      occupied.set(key, cells.length)
      cells.push(cell)
    }
  }
  const layerAt = (gx: number, gy: number) => {
    const idx = occupied.get(`${gx},${gy}`)
    return idx === undefined ? -1 : cells[idx].layer
  }

  // 1) 눈 더미 (트리 밑 넓은 타원)
  for (let y = -2; y <= 4; y++) {
    for (let x = -46; x <= 46; x++) {
      const d = (x / 46) ** 2 + ((y - 1) / 3.6) ** 2
      if (d > 1 || rand() < d * 0.5) continue
      put(x, y, SNOW(0.3 + (1 - d) * 0.65 + (rand() - 0.5) * 0.14), 0)
    }
  }

  // 2) 줄기
  for (let r = 0; r < TRUNK_ROWS + 2; r++) {
    for (let c = -2; c <= 2; c++) put(c, -r, TRUNK(0.35 + (c + 2) * 0.12 + rand() * 0.15), 1)
  }

  // 3) 잎: 원뿔 음영 + 단별 음영 + 가지 끝 눈 + 테두리 빛
  for (let r = 0; r < FOLIAGE; r++) {
    const gy = TOP + r
    const H = Math.ceil(halfWidth(r) + 1)
    for (let c = -H; c <= H; c++) {
      const tier = tierAt(r, c)
      if (!tier) continue
      const u = c / Math.max(1, tier.half)
      const front = Math.sqrt(Math.max(0, 1 - u * u)) // 원뿔 앞면일수록 밝음
      const light = 0.36 + 0.48 * front - 0.07 * u // 빛은 왼쪽 위에서 (오른쪽도 너무 어둡지 않게)
      const shadow = tier.i > 0 && tier.k < 0.38 ? 0.55 + tier.k * 1.2 : 1 // 윗단 밑자락 그늘
      const tierShade = (0.7 + 0.42 * Math.pow(tier.k, 1.4)) * shadow
      const needle = (rand() - 0.5) * 0.12 + ((c + r) % 2 ? 0.025 : -0.025)
      const rim = Math.abs(u) > 0.84 ? 0.1 : 0 // 양쪽 가장자리 테두리 빛 → 실루엣이 또렷
      const tip = tier.k > 0.88 ? 0.1 : 0
      // 가지 끝 바로 위에 쌓인 눈
      if (tier.k > 0.74 && tier.k < 0.86 && rand() < 0.3 + Math.abs(u) * 0.25) {
        put(c, gy, SNOW(0.75 + rand() * 0.25), 2)
        continue
      }
      put(c, gy, LEAF(light * tierShade + needle + rim + tip), 2)
    }
  }

  const onLeaf = (gx: number, gy: number) => layerAt(gx, gy) === 2
  const rowOf = (gy: number) => gy - TOP

  // 4) 장식 줄: 금색 줄 + 빨강·흰색 구슬 줄. 원뿔을 나선으로 감고, 앞쪽만 보임
  const spiral = (turns: number, phase: number, each: (gx: number, gy: number, t: number, depth: number) => void) => {
    for (let t = 0; t <= 1; t += 0.0004) {
      const r = 5 + t * (FOLIAGE - 9)
      const theta = t * turns * Math.PI * 2 + phase
      const depth = Math.cos(theta)
      if (depth < 0.05) continue
      const sag = Math.sin(theta * 2) * 0.7
      const gx = Math.round(Math.sin(theta) * halfWidth(r) * 0.92)
      const gy = Math.round(TOP + r + sag)
      if (!tierAt(rowOf(gy), gx)) continue
      each(gx, gy, t, depth)
    }
  }
  spiral(4.4, 0.6, (gx, gy, t, depth) => {
    put(gx, gy, GOLD(0.34 + depth * 0.45 + 0.15), 3)
    if (depth > 0.72 && tierAt(rowOf(gy + 1), gx)) put(gx, gy + 1, GOLD(0.25 + depth * 0.4), 3)
    garland.push({ gx, gy, t, depth })
  })
  let bead = 0
  let lastKey = ''
  spiral(4.4, 0.6 + Math.PI * 0.9, (gx, gy, _t, depth) => {
    const key = `${gx},${gy}`
    if (key === lastKey) return
    lastKey = key
    if (layerAt(gx, gy) === 3) return
    bead++
    if (bead % 2) return // 한 칸 건너 하나씩 → 구슬처럼
    const red = Math.floor(bead / 2) % 2 === 0
    put(gx, gy, red ? scale(hex('#e23b4e'), 0.7 + depth * 0.4) : scale(hex('#f3f6fb'), 0.7 + depth * 0.3), 3)
  })

  // 5) 큰 방울 장식 (2×2 칸, 왼쪽 위 반짝)
  const baubles: [number, number][] = []
  let guard = 0
  while (baubles.length < 22 && guard++ < 4000) {
    const r = 8 + Math.floor(rand() * (FOLIAGE - 12))
    const h = halfWidth(r)
    const gx = Math.round((rand() * 2 - 1) * (h - 2.5))
    const gy = TOP + r
    if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => onLeaf(gx + dx, gy + dy))) continue
    if (baubles.some(([bx, by]) => Math.abs(bx - gx) + Math.abs(by - gy) < 8)) continue
    baubles.push([gx, gy])
    const base = hex(BAUBLE_COLORS[baubles.length % BAUBLE_COLORS.length])
    put(gx, gy, mix(base, [255, 255, 255], 0.55), 3) // 반짝이는 쪽
    put(gx + 1, gy, scale(base, 1.05), 3)
    put(gx, gy + 1, scale(base, 0.95), 3)
    put(gx + 1, gy + 1, scale(base, 0.7), 3)
  }

  // 6) 전구 140개: 잎 위에 고르게
  const leaves = cells.filter((c) => c.layer === 2)
  guard = 0
  while (bulbs.length < 140 && guard++ < 8000) {
    const c = leaves[Math.floor(rand() * leaves.length)]
    if (!onLeaf(c.gx, c.gy)) continue
    if (bulbs.some((b) => Math.abs(b.gx - c.gx) + Math.abs(b.gy - c.gy) < 4)) continue
    bulbs.push({ gx: c.gx, gy: c.gy, color: BULB_COLORS[Math.floor(rand() * BULB_COLORS.length)], speed: 0.8 + rand() * 2.2, phase: rand() * Math.PI * 2 })
  }

  // 7) 선물 상자 6개 (트리 앞, 무늬·리본·나비매듭)
  const gifts = [
    { x: -41, w: 10, h: 8, color: '#1fa596', pattern: 'stripe' },
    { x: -30, w: 13, h: 11, color: '#8a55d6', pattern: 'dot' },
    { x: -15, w: 9, h: 7, color: '#f2c14e', pattern: 'plain' },
    { x: 7, w: 10, h: 8, color: '#dc3b4c', pattern: 'dot' },
    { x: 18, w: 13, h: 12, color: '#3a6ee0', pattern: 'stripe' },
    { x: 32, w: 9, h: 7, color: '#e86aa8', pattern: 'plain' },
  ]
  for (const g of gifts) {
    const body = hex(g.color)
    const ribbonColor = g.color === '#f2c14e' ? hex('#dc3b4c') : null
    const mid = g.x + Math.floor(g.w / 2)
    const band = Math.floor(g.h * 0.55)
    for (let yy = 0; yy < g.h; yy++) {
      for (let xx = g.x; xx < g.x + g.w; xx++) {
        const ribbon = xx === mid || xx === mid - 1 || yy === band
        const lid = yy >= g.h - 2
        const side = (xx - g.x) / (g.w - 1)
        let shade = 0.78 + 0.32 * (1 - side) + (lid ? 0.12 : 0) + (rand() - 0.5) * 0.05
        if (g.pattern === 'stripe' && (xx - g.x) % 3 === 0) shade *= 0.8
        if (g.pattern === 'dot' && (xx - g.x) % 3 === 1 && yy % 3 === 1) shade *= 1.35
        const color = ribbon
          ? ribbonColor
            ? scale(ribbonColor, 0.85 + (1 - side) * 0.25)
            : GOLD(0.5 + (1 - side) * 0.35)
          : scale(body, shade)
        put(xx, 2 - yy, color, 4)
      }
    }
    const top = 2 - g.h
    const bow = ribbonColor ?? GOLD(0.7)
    for (const [dx, dy] of [[-4, -2], [-3, -1], [-3, -2], [-3, -3], [-2, -1], [-2, -3], [-1, -1], [0, -1], [1, -1], [1, -3], [2, -1], [2, -2], [2, -3], [3, -2]]) {
      put(mid + dx, top + dy, dy === -1 ? scale(bow as RGB, 1.1) : (bow as RGB), 4)
    }
  }

  // 8) 별
  for (let y = -STAR_R - 1; y <= STAR_R + 1; y++) {
    for (let x = -STAR_R - 1; x <= STAR_R + 1; x++) {
      if (!insideStar(x, y + 0.8, STAR_R + 0.5, STAR_R * 0.47)) continue
      const glow = 1 - Math.hypot(x, y) / (STAR_R + 1)
      put(x, STAR_CY + y, GOLD(0.5 + 0.28 * (-(x + y) / (STAR_R * 2)) + 0.35 * glow), 5)
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const c of cells) {
    minX = Math.min(minX, c.gx)
    maxX = Math.max(maxX, c.gx)
    minY = Math.min(minY, c.gy)
    maxY = Math.max(maxY, c.gy)
  }

  // 조립 전 자리: 바닥에 넓게 흩어져 있다가 아래 칸부터 올라감
  for (const c of cells) {
    c.sx = (rand() - 0.5) * 110
    c.sy = maxY - rand() * 4
    const height = (maxY - c.gy) / (maxY - minY) // 0(바닥) ~ 1(별)
    c.delay = c.layer === 5 ? 0.92 : clamp(height * 0.78 + rand() * 0.14)
  }
  cells.sort((a, b) => a.layer - b.layer)
  return { cells, bulbs, garland, minX, maxX, minY, maxY }
}

let cachedTree: Tree | null = null
const getTree = () => (cachedTree ??= buildTree())

/** 트리 폭 ÷ 높이 (가운데 정렬·크기 계산용) */
export function treeAspect(): number {
  const t = getTree()
  return (t.maxX - t.minX + 1) / (t.maxY - t.minY + 1)
}

/* ------------------------------------------------------------------ 그림 조각 (스프라이트) */

/** 칸 하나: 둥근 네모 + 위쪽 반사광 (LED 전광판 느낌) */
function cellSprite(color: string, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = Math.max(2, Math.round(px))
  const g = c.getContext('2d')!
  const s = c.width
  const pad = s * 0.07
  const r = s * 0.24
  g.beginPath()
  if (typeof g.roundRect === 'function') g.roundRect(pad, pad, s - pad * 2, s - pad * 2, r)
  else g.rect(pad, pad, s - pad * 2, s - pad * 2)
  g.fillStyle = color
  g.fill()
  const hl = g.createLinearGradient(0, 0, 0, s)
  hl.addColorStop(0, 'rgba(255,255,255,0.32)')
  hl.addColorStop(0.45, 'rgba(255,255,255,0.05)')
  hl.addColorStop(1, 'rgba(0,0,0,0.22)')
  g.fillStyle = hl
  g.fill()
  return c
}

/** 빛 번짐 (가운데 밝고 바깥으로 사라짐) */
function glowSprite(color: string, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = Math.max(4, Math.round(px))
  const g = c.getContext('2d')!
  const s = c.width / 2
  const grad = g.createRadialGradient(s, s, 0, s, s, s)
  grad.addColorStop(0, color)
  grad.addColorStop(0.25, color.replace('rgb(', 'rgba(').replace(')', ',0.55)'))
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** 눈 결정 (육각) — kind 0 가지형, 1 판형, 2 별형 */
function flakeSprite(px: number, kind: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  const size = Math.max(6, Math.round(px))
  c.width = c.height = size
  const g = c.getContext('2d')!
  const R = size * 0.42
  g.translate(size / 2, size / 2)
  g.strokeStyle = 'rgba(255,255,255,0.95)'
  g.lineCap = 'round'
  g.lineWidth = Math.max(1, size * 0.055)
  g.shadowColor = 'rgba(200,225,255,0.9)'
  g.shadowBlur = size * 0.12
  for (let i = 0; i < 6; i++) {
    g.save()
    g.rotate((i * Math.PI) / 3)
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(0, -R)
    if (kind === 0) {
      for (const [at, len] of [[0.42, 0.3], [0.68, 0.22]]) {
        g.moveTo(0, -R * at)
        g.lineTo(-R * len, -R * (at + len * 0.8))
        g.moveTo(0, -R * at)
        g.lineTo(R * len, -R * (at + len * 0.8))
      }
    } else if (kind === 1) {
      g.moveTo(0, -R * 0.78)
      g.lineTo(-R * 0.16, -R * 0.95)
      g.moveTo(0, -R * 0.78)
      g.lineTo(R * 0.16, -R * 0.95)
    } else {
      g.moveTo(0, -R * 0.3)
      g.lineTo(-R * 0.18, -R * 0.48)
      g.moveTo(0, -R * 0.3)
      g.lineTo(R * 0.18, -R * 0.48)
    }
    g.stroke()
    g.restore()
  }
  if (kind === 1) {
    g.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2
      g.lineTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3)
    }
    g.closePath()
    g.stroke()
  }
  return c
}

/* ------------------------------------------------------------------ 실행 */

interface Flake {
  x: number
  y: number
  size: number
  tier: number
  speed: number
  sway: number
  phase: number
  spin: number
  angle: number
  alpha: number
  kind: number
}

export function startChristmasTree(canvas: HTMLCanvasElement, getAnchor: () => TreeAnchor | null): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const { cells, bulbs, garland, minY, maxY } = getTree()
  const leafCells = cells.filter((c) => c.layer === 2)
  const rand = rng(1225)

  let width = 0
  let height = 0
  let dpr = 1
  let flakes: Flake[] = []
  const flakeSprites: HTMLCanvasElement[][] = [] // [크기 단계][종류]
  const FLAKE_SIZES = [9, 14, 22, 32]

  let unit = 0 // 칸 크기 (css px)
  let cellCache = new Map<string, HTMLCanvasElement>()
  let glowCache = new Map<string, HTMLCanvasElement>()
  let staticLayer: HTMLCanvasElement | null = null // 조립 끝난 트리 (한 번만 그려 둠)
  let staticKey = ''

  const cellImg = (color: string) => {
    let s = cellCache.get(color)
    if (!s) cellCache.set(color, (s = cellSprite(color, unit * dpr)))
    return s
  }
  const glowImg = (color: string, size: number) => {
    const key = `${color}|${size}`
    let s = glowCache.get(key)
    if (!s) glowCache.set(key, (s = glowSprite(color, size * dpr)))
    return s
  }

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, 1.5) // 고해상도 화면에서도 가볍게
    width = rect.width
    height = rect.height
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    flakeSprites.length = 0
    for (const s of FLAKE_SIZES) flakeSprites.push([0, 1, 2].map((k) => flakeSprite(s * dpr, k)))
    const count = Math.round(clamp((width * height) / 11000, 30, 140))
    flakes = Array.from({ length: count }, () => {
      const depth = rand() // 0 먼 눈 ~ 1 가까운 눈
      const tier = depth < 0.55 ? 0 : depth < 0.85 ? 1 : depth < 0.97 ? 2 : 3
      return {
        x: rand() * width,
        y: rand() * height,
        size: FLAKE_SIZES[tier] * (0.75 + rand() * 0.4),
        tier,
        speed: 10 + tier * 14 + rand() * 12,
        sway: 6 + tier * 6 + rand() * 10,
        phase: rand() * Math.PI * 2,
        spin: (rand() - 0.5) * (0.3 + tier * 0.4),
        angle: rand() * Math.PI,
        alpha: [0.35, 0.6, 0.85, 0.95][tier] * (0.8 + rand() * 0.2),
        kind: Math.floor(rand() * 3),
      }
    })
    staticLayer = null
  }

  /** 칸 크기가 바뀌면 그림 조각을 새로 만든다 */
  const ensureUnit = (u: number) => {
    if (Math.abs(u - unit) < 0.05) return
    unit = u
    cellCache = new Map()
    glowCache = new Map()
    staticLayer = null
  }

  /** 칸 좌표 → 화면 좌표 */
  let ox = 0
  let oy = 0
  const px = (gx: number) => ox + gx * unit
  const py = (gy: number) => oy + gy * unit

  const drawCells = (g: CanvasRenderingContext2D, progress: number | null) => {
    for (const c of cells) {
      let gx = c.gx
      let gy = c.gy
      let alpha = 1
      if (progress !== null) {
        const local = clamp((progress - c.delay * 0.75) / 0.25)
        const k = easeOutCubic(local)
        gx = c.sx + (c.gx - c.sx) * k
        gy = c.sy + (c.gy - c.sy) * k - Math.sin(k * Math.PI) * 6 // 포물선으로 날아오름
        alpha = 0.25 + 0.75 * k
        if (c.layer === 5 && local <= 0) continue // 별은 마지막에
      }
      g.globalAlpha = alpha
      g.drawImage(cellImg(c.color), px(gx - 0.5), py(gy - 0.5), unit, unit)
    }
    g.globalAlpha = 1
  }

  const renderStatic = () => {
    const key = `${Math.round(ox)}|${Math.round(oy)}|${unit.toFixed(2)}|${width}|${height}`
    if (staticLayer && staticKey === key) return staticLayer
    const layer = document.createElement('canvas')
    layer.width = canvas.width
    layer.height = canvas.height
    const g = layer.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawCells(g, null)
    staticLayer = layer
    staticKey = key
    return layer
  }

  const drawLights = (t: number, built: number) => {
    if (built <= 0) return
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // 별 빛 번짐
    const pulse = 0.85 + Math.sin(t * 1.6) * 0.15
    const starX = px(0)
    const starY = py(STAR_CY)
    const halo = unit * STAR_R * 5 * pulse
    ctx.globalAlpha = 0.55 * built
    ctx.drawImage(glowImg('rgb(255,214,110)', 128), starX - halo / 2, starY - halo / 2, halo, halo)

    // 별 빛줄기: 짧고 끝으로 갈수록 사라짐, 천천히 회전
    ctx.translate(starX, starY)
    ctx.rotate(t * 0.15)
    const rayLen = unit * STAR_R * 2.2
    const ray = ctx.createLinearGradient(0, -rayLen, 0, rayLen)
    ray.addColorStop(0, 'rgba(255,236,170,0)')
    ray.addColorStop(0.5, 'rgba(255,236,170,0.9)')
    ray.addColorStop(1, 'rgba(255,236,170,0)')
    ctx.fillStyle = ray
    ctx.globalAlpha = 0.22 * built * pulse
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-unit * 0.18, -rayLen, unit * 0.36, rayLen * 2)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 트리 전체에 은은한 초록 빛 (따뜻한 분위기)
    const treeH = (maxY - minY) * unit
    ctx.globalAlpha = 0.16 * built
    ctx.drawImage(glowImg('rgb(70,200,130)', 128), px(0) - treeH * 0.55, py(TOP + FOLIAGE * 0.55) - treeH * 0.55, treeH * 1.1, treeH * 1.1)

    // 장식 줄을 따라 흐르는 빛
    const flow = (t * 0.09) % 1
    for (const p of garland) {
      const d = Math.abs(p.t - flow)
      const near = Math.min(d, 1 - d)
      if (near > 0.035) continue
      const s = unit * 3.4
      ctx.globalAlpha = (1 - near / 0.035) * 0.8 * p.depth * built
      ctx.drawImage(glowImg('rgb(255,226,140)', 32), px(p.gx) - s / 2, py(p.gy) - s / 2, s, s)
    }

    // 전구
    for (const b of bulbs) {
      const tw = 0.5 + 0.5 * Math.sin(t * b.speed + b.phase)
      const s = unit * (2.2 + tw * 1.8)
      const rgb = css(hex(b.color))
      ctx.globalAlpha = (0.25 + 0.5 * tw) * built
      ctx.drawImage(glowImg(rgb, 32), px(b.gx) - s / 2, py(b.gy) - s / 2, s, s)
      ctx.globalAlpha = (0.55 + 0.45 * tw) * built
      ctx.drawImage(cellImg(b.color), px(b.gx - 0.5), py(b.gy - 0.5), unit, unit)
      if (tw > 0.9) {
        ctx.globalAlpha = (tw - 0.9) * 5 * built
        ctx.fillStyle = '#fff'
        ctx.fillRect(px(b.gx - 0.18), py(b.gy - 0.18), unit * 0.36, unit * 0.36)
      }
    }

    // 반짝 섬광: 잎 몇 군데가 번갈아 십자 모양으로 반짝
    ctx.fillStyle = 'rgba(255,255,255,1)'
    for (let i = 0; i < 9; i++) {
      const slot = Math.floor(t * 0.7 + i * 0.37)
      const life = (t * 0.7 + i * 0.37) % 1
      const c = leafCells[(slot * 131 + i * 977) % leafCells.length]
      const a = Math.sin(life * Math.PI) * built
      if (a <= 0.02) continue
      const len = unit * 2.4 * a
      ctx.globalAlpha = a * 0.9
      ctx.fillRect(px(c.gx) - len, py(c.gy) - unit * 0.1, len * 2, unit * 0.2)
      ctx.fillRect(px(c.gx) - unit * 0.1, py(c.gy) - len, unit * 0.2, len * 2)
    }
    ctx.restore()
  }

  const drawSnow = (dt: number, t: number) => {
    for (const f of flakes) {
      if (!reduced) {
        f.y += f.speed * dt
        f.angle += f.spin * dt
        if (f.y > height + 30) {
          f.y = -30
          f.x = rand() * width
        }
      }
      const x = f.x + Math.sin(t * 0.5 + f.phase) * f.sway
      ctx.save()
      ctx.globalAlpha = f.alpha
      ctx.translate(x, f.y)
      ctx.rotate(f.angle)
      ctx.drawImage(flakeSprites[f.tier][f.kind], -f.size / 2, -f.size / 2, f.size, f.size)
      ctx.restore()
    }
  }

  const BUILD_DELAY = 0.6
  const BUILD_TIME = 4.8
  let raf = 0
  let last = performance.now()
  const t0 = last

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = (now - t0) / 1000
    ctx.clearRect(0, 0, width, height)

    const a = getAnchor()
    if (a) {
      ensureUnit(a.height / (maxY - minY + 1))
      ox = a.x
      oy = a.bottom - (maxY + 0.5) * unit
      const progress = reduced ? 1 : clamp((t - BUILD_DELAY) / BUILD_TIME)
      if (progress < 1) drawCells(ctx, progress)
      else ctx.drawImage(renderStatic(), 0, 0, width, height)
      drawLights(t, reduced ? 1 : clamp((progress - 0.92) / 0.08)) // 별이 자리 잡은 뒤부터 불빛
    }
    drawSnow(dt, t)
    if (!reduced) raf = requestAnimationFrame(frame)
  }

  resize()
  const ro = new ResizeObserver(() => {
    resize()
    if (reduced) requestAnimationFrame(frame)
  })
  ro.observe(canvas)
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
  }
}
