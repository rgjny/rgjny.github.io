/**
 * Shared halftone-dither helpers (client-side).
 * Turns a loaded <img> into a grid of ink dots sized by luminance, with an
 * optional progressive "materialize" animation used by the post banner.
 */

export interface Dot {
  x: number
  y: number
  r: number
  d: number
} // d = seeded reveal delay 0..1

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
) {
  const ir = (img.naturalWidth || 1) / (img.naturalHeight || 1)
  const tr = W / H
  let dw = W
  let dh = H
  let dx = 0
  let dy = 0
  if (ir > tr) {
    dw = Math.round(H * ir)
    dx = Math.round((W - dw) / 2)
  } else {
    dh = Math.round(W / ir)
    dy = Math.round((H - dh) / 2)
  }
  ctx.drawImage(img, dx, dy, dw, dh)
}

/** Sample the image into a dot list. Returns null if the image can't be read.
 *  `invert` sizes dots by brightness instead of darkness — use for light
 *  line-art on a transparent/dark ground (renders the strokes as dots).
 *  `floor` subtracts light paper/parchment background noise so only line art is dithered. */
export function buildDots(
  img: HTMLImageElement,
  W: number,
  H: number,
  step: number,
  invert = false,
  floor = 0.08,
): Dot[] | null {
  const off = document.createElement('canvas')
  off.width = W
  off.height = H
  const octx = off.getContext('2d', { willReadFrequently: true })
  if (!octx || !img.naturalWidth) return null
  try {
    drawCover(octx, img, W, H)
  } catch {
    return null
  }
  let data: Uint8ClampedArray
  try {
    data = octx.getImageData(0, 0, W, H).data
  } catch {
    return null
  }
  const dots: Dot[] = []
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255
      const a = data[i + 3] / 255
      // filter out light parchment / cream background noise if present
      const rawDarkness = invert ? lum : 1 - lum
      const darkness = Math.max(0, rawDarkness - floor) / (1 - floor)
      const v = Math.min(darkness * a, 0.88)
      const r = v * (step * 0.62)
      if (r < 0.28) continue
      // reveal delay biased by position + a little jitter → scattered pop-in
      const d = Math.min(
        1,
        Math.max(0, (x / W) * 0.5 + (y / H) * 0.3 + Math.random() * 0.35),
      )
      dots.push({ x: x + step / 2, y: y + step / 2, r, d })
    }
  }
  return dots
}

function paint(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dots: Dot[],
  color: string,
  t: number,
) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = color
  const easeOut = (v: number) => 1 - Math.pow(1 - v, 3)
  for (const dot of dots) {
    // each dot animates within a window starting at its delay
    const span = 0.35
    const local = t >= 1 ? 1 : Math.min(1, Math.max(0, (t - dot.d * (1 - span)) / span))
    if (local <= 0) continue
    const r = dot.r * easeOut(local)
    if (r < 0.2) continue
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Fully paint the dithered image immediately (t = 1). */
export function staticDither(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  color: string,
  cell = 5,
  invert = false,
  floor = 0.08,
) {
  const box = canvas.getBoundingClientRect()
  const scale = Math.min(2, window.devicePixelRatio || 1)
  const W = Math.max(1, Math.round((box.width || canvas.clientWidth || 300) * scale))
  const H = Math.max(1, Math.round((box.height || canvas.clientHeight || 200) * scale))
  const step = Math.max(3, Math.round(cell * (scale > 1.4 ? 1.5 : scale)))
  const dots = buildDots(img, W, H, step, invert, floor)
  if (!dots) return false
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  paint(ctx, W, H, dots, color, 1)
  return true
}

/**
 * Animate the dither building up (t: 0→1) or dissolving (1→0).
 * `onProgress(t)` lets the caller fade the underlying photo in counterpoint.
 */
export function animateDither(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  color: string,
  opts: {
    cell?: number
    duration?: number
    reverse?: boolean
    invert?: boolean
    floor?: number
    onProgress?: (t: number) => void
    onDone?: () => void
  } = {},
) {
  const {
    cell = 5,
    duration = 900,
    reverse = false,
    invert = false,
    floor = 0.08,
    onProgress,
    onDone,
  } = opts
  const box = canvas.getBoundingClientRect()
  const scale = Math.min(2, window.devicePixelRatio || 1)
  const W = Math.max(1, Math.round((box.width || 300) * scale))
  const H = Math.max(1, Math.round((box.height || 200) * scale))
  const step = Math.max(3, Math.round(cell * (scale > 1.4 ? 1.5 : scale)))
  const dots = buildDots(img, W, H, step, invert, floor)
  const ctx = canvas.getContext('2d')
  if (!dots || !ctx) {
    onProgress?.(reverse ? 0 : 1)
    onDone?.()
    return
  }
  canvas.width = W
  canvas.height = H
  const start = performance.now()
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration)
    const t = reverse ? 1 - p : p
    paint(ctx, W, H, dots, color, t)
    onProgress?.(t)
    if (p < 1) requestAnimationFrame(tick)
    else onDone?.()
  }
  requestAnimationFrame(tick)
}
