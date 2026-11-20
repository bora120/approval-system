/**
 * 크리스마스 효과 (canvas 2D) — 빙글빙글 도는 3D 빛 트리 + 눈 결정
 *
 * 트리: 원뿔 위에 빛 알갱이 약 1,700개를 3D 좌표로 배치하고, 천천히 회전시키며 원근(앞은 크고 밝게, 뒤는 작고 어둡게)으로 그린다.
 *   - 6단으로 층진 가지 실루엣, 앞쪽이 밝은 입체 음영
 *   - 금색·은색 두 줄의 빛 리본이 나선으로 감기고, 리본을 따라 빛이 위로 흐름
 *   - 빨강·금·파랑·분홍 장식 구슬이 제각각 반짝임
 *   - 꼭대기에서 함께 도는 입체 별 + 빛 번짐, 바닥에는 도는 빛 고리, 위로 떠오르는 반짝이
 *   처음에는 별이 먼저 뜨고 빛이 나선을 그리며 위에서 아래로 감기며 완성된다 (약 2초).
 * 눈: 육각 눈 결정 3종을 크기별로(먼 눈·중간·가까운 눈) 내린다.
 *
 * startChristmasTree(canvas, getAnchor) → 정지 함수
 *   getAnchor(): 트리 가운데 x, 트리 맨 아래(빛 고리) y, 트리 전체 높이(px). null 이면 트리는 안 그림
 *   treeAspect(): 트리 폭 ÷ 높이 (자리 계산용)
 */

export interface TreeAnchor {
  x: number
  bottom: number
  height: number
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
const TAU = Math.PI * 2

/* ------------------------------------------------------------------ 모양 (높이 1 기준 비율) */

const STAR_Y = 0.07 // 별 가운데
const CONE_TOP = 0.12 // 원뿔 꼭대기
const CONE_BOTTOM = 0.9 // 원뿔 바닥
const BASE_R = 0.37 // 바닥 반지름 (높이 대비)
const RING_R = 0.45 // 바닥 빛 고리 반지름
const TILT = 0.2 // 위에서 살짝 내려다보는 각도 (원이 납작한 타원으로 보임)
const TIERS = 6

/** 층진 가지 실루엣: 각 층 위쪽은 좁고 아래로 갈수록 퍼짐 */
function coneRadius(u: number): number {
  const frac = (u * TIERS) % 1
  return BASE_R * u * (0.74 + 0.26 * Math.pow(frac, 0.8))
}

export function treeAspect(): number {
  return RING_R * 2 + 0.04
}

/* ------------------------------------------------------------------ 알갱이 */

interface Particle {
  u: number // 0 꼭대기 ~ 1 바닥
  angle: number
  radius: number // 높이 1 기준
  size: number
  color: number // 팔레트 번호
  kind: 0 | 1 | 2 // 0 잎, 1 장식 구슬, 2 리본
  phase: number
  speed: number
  ribbon: number // 리본 번호 (kind 2)
}

const LEAF = ['#0b4d33', '#11663f', '#17804d', '#1f9a5c', '#2db06c', '#5fcf8e', '#a6ecc0']
const ORNAMENT = ['#ff4d5e', '#ffcf5a', '#e9f1ff', '#5aa8ff', '#ff8fc8', '#ffb347']
const RIBBON = ['#ffd77a', '#dfe9ff']

function buildParticles(): Particle[] {
  const rand = rng(2512)
  const list: Particle[] = []

  // 잎: 바닥으로 갈수록 넓어서 더 많이 (면적에 비례)
  for (let i = 0; i < 1800; i++) {
    const u = Math.sqrt(0.02 + rand() * 0.98)
    const surface = rand() < 0.82
    const radius = coneRadius(u) * (surface ? 0.9 + rand() * 0.14 : 0.35 + rand() * 0.5)
    const frac = (u * TIERS) % 1
    // 가지 끝(층 아래쪽)일수록 밝은 연두, 안쪽은 짙은 초록
    const shade = clamp((surface ? 0.35 : 0) + frac * 0.45 + rand() * 0.35)
    list.push({
      u,
      angle: rand() * TAU,
      radius,
      size: 0.0068 + rand() * 0.005,
      color: Math.min(LEAF.length - 1, Math.floor(shade * LEAF.length)),
      kind: 0,
      phase: rand() * TAU,
      speed: 0,
      ribbon: 0,
    })
  }

  // 장식 구슬
  for (let i = 0; i < 150; i++) {
    const u = Math.sqrt(0.04 + rand() * 0.96)
    list.push({
      u,
      angle: rand() * TAU,
      radius: coneRadius(u) * (1.0 + rand() * 0.05),
      size: 0.012 + rand() * 0.008,
      color: Math.floor(rand() * ORNAMENT.length),
      kind: 1,
      phase: rand() * TAU,
      speed: 1.2 + rand() * 2.6,
      ribbon: 0,
    })
  }

  // 빛 리본 2줄 (나선)
  for (let r = 0; r < 2; r++) {
    const n = 260
    for (let i = 0; i < n; i++) {
      const u = 0.03 + (i / n) * 0.97
      list.push({
        u,
        angle: u * 4.2 * TAU + r * Math.PI,
        radius: coneRadius(u) * 1.06 + 0.004,
        size: 0.0075,
        color: r,
        kind: 2,
        phase: rand() * TAU,
        speed: 0,
        ribbon: r,
      })
    }
  }
  return list
}

/* ------------------------------------------------------------------ 그림 조각 (스프라이트) */

/** 빛 알갱이: 또렷한 가운데 + 살짝 번지는 가장자리 */
function dotSprite(color: string, px: number, core: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = Math.max(4, Math.round(px))
  const g = c.getContext('2d')!
  const s = c.width / 2
  const grad = g.createRadialGradient(s, s, 0, s, s, s)
  grad.addColorStop(0, core ? '#ffffff' : color)
  grad.addColorStop(core ? 0.22 : 0.4, color)
  grad.addColorStop(0.6, color + '66')
  grad.addColorStop(1, color + '00')
  g.fillStyle = grad
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** 빛 번짐 (가운데 밝고 바깥으로 사라짐) */
function glowSprite(color: string, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = Math.max(4, Math.round(px))
  const g = c.getContext('2d')!
  const s = c.width / 2
  const grad = g.createRadialGradient(s, s, 0, s, s, s)
  grad.addColorStop(0, color + 'ff')
  grad.addColorStop(0.25, color + '8c')
  grad.addColorStop(1, color + '00')
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

interface Spark {
  x: number // 트리 기준 (높이 1 비율)
  y: number
  life: number
  speed: number
  drift: number
}

export function startChristmasTree(canvas: HTMLCanvasElement, getAnchor: () => TreeAnchor | null): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const parts = buildParticles()
  const N = parts.length
  const order = Array.from({ length: N }, (_, i) => i)
  const sx = new Float32Array(N)
  const sy = new Float32Array(N)
  const sz = new Float32Array(N) // -1 뒤 ~ 1 앞
  const vis = new Float32Array(N) // 조립 진행 (0~1)
  const rand = rng(1225)

  let width = 0
  let height = 0
  let dpr = 1
  let flakes: Flake[] = []
  const flakeSprites: HTMLCanvasElement[][] = []
  const FLAKE_SIZES = [9, 14, 22, 32]
  const sparks: Spark[] = []

  const SPRITE_PX = 24
  let leafSprites: HTMLCanvasElement[] = []
  let ornSprites: HTMLCanvasElement[] = []
  let ribbonSprites: HTMLCanvasElement[] = []
  const glowCache = new Map<string, HTMLCanvasElement>()
  const glow = (color: string) => {
    let g = glowCache.get(color)
    if (!g) glowCache.set(color, (g = glowSprite(color, 96 * dpr)))
    return g
  }

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, 1.25)
    width = rect.width
    height = rect.height
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const px = SPRITE_PX * dpr
    leafSprites = LEAF.map((c) => dotSprite(c, px, false))
    ornSprites = ORNAMENT.map((c) => dotSprite(c, px, true))
    ribbonSprites = RIBBON.map((c) => dotSprite(c, px, true))
    glowCache.clear()

    flakeSprites.length = 0
    for (const s of FLAKE_SIZES) flakeSprites.push([0, 1, 2].map((k) => flakeSprite(s * dpr, k)))
    const count = Math.round(clamp((width * height) / 12000, 30, 110))
    flakes = Array.from({ length: count }, () => {
      const depth = rand()
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
    anchor = getAnchor() // 자리 계산은 크기가 바뀔 때만
  }

  /* ---------- 그리기 ---------- */

  const drawStar = (cx: number, cy: number, R: number, t: number, alpha: number) => {
    // 별 빛 번짐
    const pulse = 0.88 + Math.sin(t * 1.7) * 0.12
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.75 * alpha
    const halo = R * 7 * pulse
    ctx.drawImage(glow('#ffc861'), cx - halo / 2, cy - halo / 2, halo, halo)
    // 빛줄기 (천천히 회전)
    ctx.translate(cx, cy)
    ctx.rotate(t * 0.12)
    const len = R * 3.4
    const ray = ctx.createLinearGradient(0, -len, 0, len)
    ray.addColorStop(0, 'rgba(255,230,160,0)')
    ray.addColorStop(0.5, 'rgba(255,236,180,0.85)')
    ray.addColorStop(1, 'rgba(255,230,160,0)')
    ctx.fillStyle = ray
    ctx.globalAlpha = 0.28 * alpha * pulse
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 6)
      ctx.fillRect(-R * 0.05, -len, R * 0.1, len * 2)
    }
    ctx.restore()

    // 트리와 함께 도는 입체 별 (가로로 눌렸다 펴짐)
    const spin = Math.cos(t * 0.55)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(cx, cy)
    ctx.scale(Math.max(0.18, Math.abs(spin)), 1)
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.45 : R
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    const fill = ctx.createLinearGradient(0, -R, 0, R)
    fill.addColorStop(0, '#fff6d2')
    fill.addColorStop(0.45, spin > 0 ? '#ffd45e' : '#f0b542')
    fill.addColorStop(1, '#d9902a')
    ctx.fillStyle = fill
    ctx.shadowColor = 'rgba(255,200,90,0.9)'
    ctx.shadowBlur = R * 0.9
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = Math.max(1, R * 0.06)
    ctx.strokeStyle = 'rgba(255,248,220,0.9)'
    ctx.stroke()
    ctx.restore()
  }

  /** 바닥 빛 고리: front=false 면 트리 뒤쪽 절반, true 면 앞쪽 절반 */
  const drawRing = (cx: number, by: number, s: number, rot: number, t: number, alpha: number, front: boolean) => {
    const R = RING_R * s
    const n = 90
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - rot * 0.6
      const z = Math.cos(a)
      if (front !== z > 0) continue
      const x = cx + Math.sin(a) * R
      const y = by + z * R * TILT
      const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7)
      const d = s * (0.012 + 0.008 * (z + 1) * 0.5) * (0.8 + tw * 0.5)
      ctx.globalAlpha = alpha * (0.25 + 0.55 * (z + 1) * 0.5) * (0.5 + tw * 0.5)
      ctx.drawImage(ribbonSprites[i % 3 === 0 ? 1 : 0], x - d, y - d, d * 2, d * 2)
    }
    ctx.restore()
  }

  const drawTree = (a: TreeAnchor, t: number, progress: number, dt: number) => {
    const s = a.height
    const cx = a.x
    const top = a.bottom - s
    const rot = t * 0.38
    const yOf = (u: number) => top + (CONE_TOP + u * (CONE_BOTTOM - CONE_TOP)) * s
    const baseY = top + CONE_BOTTOM * s + BASE_R * s * TILT * 0.2

    // 1) 트리 뒤 은은한 빛
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.22 * progress
    const gh = s * 1.05
    ctx.drawImage(glow('#2f9a68'), cx - gh / 2, top + s * 0.55 - gh / 2, gh, gh)
    ctx.globalAlpha = 0.18 * progress
    const fw = s * 1.1
    ctx.drawImage(glow('#ffcf7a'), cx - fw / 2, baseY - fw * 0.12, fw, fw * 0.24)
    ctx.restore()

    // 2) 바닥 고리 뒤쪽
    drawRing(cx, baseY, s, rot, t, progress, false)

    // 3) 알갱이 위치 계산 (조립 중이면 축에서 나선을 그리며 퍼져 나옴)
    for (let i = 0; i < N; i++) {
      const p = parts[i]
      const local = clamp((progress - p.u * 0.6) / 0.4)
      const k = easeOutCubic(local)
      vis[i] = k
      const ang = p.angle + rot + (1 - k) * 2.6
      const r = p.radius * s * (0.25 + 0.75 * k)
      const z = Math.cos(ang)
      sx[i] = cx + Math.sin(ang) * r
      sy[i] = yOf(p.u) + z * r * TILT
      sz[i] = z * (p.radius / BASE_R)
    }
    order.sort((x, y) => sz[x] - sz[y])

    // 4) 뒤에서 앞으로 (앞쪽일수록 크고 밝게)
    for (const i of order) {
      const k = vis[i]
      if (k <= 0.01) continue
      const p = parts[i]
      const front = (sz[i] + 1) * 0.5
      let alpha = 0.28 + 0.72 * front
      let img: HTMLCanvasElement
      let size = p.size * s * (0.7 + 0.6 * front)
      if (p.kind === 0) {
        img = leafSprites[p.color]
      } else if (p.kind === 1) {
        const tw = 0.55 + 0.45 * Math.sin(t * p.speed + p.phase)
        alpha *= 0.6 + 0.4 * tw
        size *= 0.9 + 0.25 * tw
        img = ornSprites[p.color]
      } else {
        const flow = 0.5 + 0.5 * Math.sin(p.u * 26 - t * 3.2 + p.ribbon * 2)
        alpha *= 0.45 + 0.55 * flow
        img = ribbonSprites[p.color]
      }
      ctx.globalAlpha = alpha * k
      ctx.drawImage(img, sx[i] - size, sy[i] - size, size * 2, size * 2)
    }
    ctx.globalAlpha = 1

    // 5) 장식·리본 빛 번짐 (앞쪽 것만, 더하기 합성)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < N; i++) {
      const p = parts[i]
      if (p.kind === 0 || sz[i] < -0.1 || vis[i] < 0.5) continue
      const front = (sz[i] + 1) * 0.5
      let a2: number
      let col: string
      if (p.kind === 1) {
        const tw = 0.5 + 0.5 * Math.sin(t * p.speed + p.phase)
        a2 = 0.35 * tw * front
        col = ORNAMENT[p.color]
      } else {
        const flow = 0.5 + 0.5 * Math.sin(p.u * 26 - t * 3.2 + p.ribbon * 2)
        if (flow < 0.75) continue
        a2 = 0.3 * (flow - 0.75) * 4 * front
        col = RIBBON[p.color]
      }
      const g = p.size * s * 4.2
      ctx.globalAlpha = a2 * vis[i]
      ctx.drawImage(glow(col), sx[i] - g, sy[i] - g, g * 2, g * 2)
    }
    ctx.restore()

    // 6) 바닥 고리 앞쪽
    drawRing(cx, baseY, s, rot, t, progress, true)

    // 7) 위로 떠오르는 반짝이
    if (!reduced && progress >= 1 && sparks.length < 28 && rand() < dt * 9) {
      const u = 0.2 + rand() * 0.8
      sparks.push({ x: (rand() - 0.5) * 2 * BASE_R * u, y: CONE_TOP + u * (CONE_BOTTOM - CONE_TOP), life: 0, speed: 0.04 + rand() * 0.05, drift: (rand() - 0.5) * 0.03 })
    }
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i]
      sp.life += dt / 2.6
      sp.y -= sp.speed * dt
      sp.x += sp.drift * dt
      if (sp.life >= 1) {
        sparks.splice(i, 1)
        continue
      }
      const a3 = Math.sin(sp.life * Math.PI)
      const d = s * 0.011 * (0.6 + a3 * 0.6)
      ctx.globalAlpha = a3 * 0.85
      ctx.drawImage(ribbonSprites[0], cx + sp.x * s - d, top + sp.y * s - d, d * 2, d * 2)
    }
    ctx.restore()

    // 8) 별 (조립 처음에 먼저 떠오름)
    const starIn = easeOutCubic(clamp(progress / 0.25))
    drawStar(cx, top + STAR_Y * s, s * 0.055 * (0.4 + 0.6 * starIn), t, starIn)
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

  const BUILD_DELAY = 0.15
  const BUILD_TIME = 2.0
  let anchor: TreeAnchor | null = null
  let raf = 0
  let running = false
  let last = performance.now()
  const t0 = last

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = (now - t0) / 1000
    ctx.clearRect(0, 0, width, height)
    if (anchor) {
      const progress = reduced ? 1 : clamp((t - BUILD_DELAY) / BUILD_TIME)
      drawTree(anchor, reduced ? 0 : t, progress, dt)
    }
    drawSnow(dt, t)
    if (running && !reduced) raf = requestAnimationFrame(frame)
  }

  // 화면 밖으로 스크롤했거나 다른 탭이면 멈춘다
  let visible = true
  const update = () => {
    const should = visible && !document.hidden
    if (should && !running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    } else if (!should && running) {
      running = false
      cancelAnimationFrame(raf)
    }
  }

  resize()
  const ro = new ResizeObserver(() => {
    resize()
    if (reduced) requestAnimationFrame(frame)
  })
  ro.observe(canvas)
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    update()
  })
  io.observe(canvas)
  document.addEventListener('visibilitychange', update)
  document.fonts?.ready.then(() => {
    anchor = getAnchor()
    if (reduced) requestAnimationFrame(frame)
  })
  update()

  return () => {
    running = false
    cancelAnimationFrame(raf)
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', update)
  }
}
