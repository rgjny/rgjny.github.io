/**
 * Shared halftone-dither helpers (client-side).
 * Turns a loaded <img> into a grid of ink dots sized by luminance, with an
 * optional progressive "materialize" animation used by the post banner.
 */

export interface Dot { x: number; y: number; r: number; d: number } // d = seeded reveal delay 0..1

function coverRect(img: HTMLImageElement, W: number, H: number) {
  const ir = img.naturalWidth / img.naturalHeight
  const tr = W / H
  let sw: number, sh: number, sx: number, sy: number
  if (ir > tr) { sh = img.naturalHeight; sw = sh * tr; sx = (img.naturalWidth - sw) / 2; sy = 0 }
  else { sw = img.naturalWidth; sh = sw / tr; sx = 0; sy = (img.naturalHeight - sh) / 2 }
  return { sx, sy, sw, sh }
}

/** Sample the image into a dot list. Returns null if the image can't be read. */
export function buildDots(img: HTMLImageElement, W: number, H: number, step: number): Dot[] | null {
  const off = document.createElement('canvas')
  off.width = W; off.height = H
  const octx = off.getContext('2d', { willReadFrequently: true })
  if (!octx || !img.naturalWidth) return null
  const { sx, sy, sw, sh } = coverRect(img, W, H)
  try { octx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H) } catch { return null }
  let data: Uint8ClampedArray
  try { data = octx.getImageData(0, 0, W, H).data } catch { return null }
  const dots: Dot[] = []
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255
      const r = (1 - lum) * (step * 0.62)
      if (r < 0.35) continue
      // reveal delay biased by position + a little jitter → scattered pop-in
      const d = Math.min(1, Math.max(0, (x / W) * 0.5 + (y / H) * 0.3 + Math.random() * 0.35))
      dots.push({ x: x + step / 2, y: y + step / 2, r, d })
    }
  }
  return dots
}

function paint(ctx: CanvasRenderingContext2D, W: number, H: number, dots: Dot[], color: string, t: number) {
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
export function staticDither(canvas: HTMLCanvasElement, img: HTMLImageElement, color: string, cell = 5) {
  const box = canvas.getBoundingClientRect()
  const scale = Math.min(2, window.devicePixelRatio || 1)
  const W = Math.max(1, Math.round((box.width || canvas.clientWidth || 300) * scale))
  const H = Math.max(1, Math.round((box.height || canvas.clientHeight || 200) * scale))
  const step = Math.max(3, Math.round(cell * scale))
  const dots = buildDots(img, W, H, step)
  if (!dots) return false
  canvas.width = W; canvas.height = H
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
  opts: { cell?: number; duration?: number; reverse?: boolean; onProgress?: (t: number) => void; onDone?: () => void } = {},
) {
  const { cell = 5, duration = 900, reverse = false, onProgress, onDone } = opts
  const box = canvas.getBoundingClientRect()
  const scale = Math.min(2, window.devicePixelRatio || 1)
  const W = Math.max(1, Math.round((box.width || 300) * scale))
  const H = Math.max(1, Math.round((box.height || 200) * scale))
  const step = Math.max(3, Math.round(cell * scale))
  const dots = buildDots(img, W, H, step)
  const ctx = canvas.getContext('2d')
  if (!dots || !ctx) { onProgress?.(reverse ? 0 : 1); onDone?.(); return }
  canvas.width = W; canvas.height = H
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
