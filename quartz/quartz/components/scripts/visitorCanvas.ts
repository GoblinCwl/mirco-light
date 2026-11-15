export type VisitorMeteor = { id: string; arrivedOn: string; region?: string | null }
export type VisitorSkyData = { meteors: VisitorMeteor[]; meteorId?: string }
export type CometBody = {
  id: string; label: string; own: boolean; color: string; radius: number; phase: number; period: number
  rx: number; ry: number; cosTilt: number; sinTilt: number; offsetX: number; offsetY: number
  x: number; y: number; scale: number; trail: Float64Array
}
const colors = ['#75aabd', '#a58abc', '#80ad9c', '#bea06b', '#839fbe']
export function visitorCanvasBodies(data: VisitorSkyData, width: number, height: number, ownId?: string) {
  const times = data.meteors.map(m => Date.parse(m.arrivedOn)).filter(Number.isFinite)
  const earliest = Math.min(...times), latest = Math.max(...times)
  const count = Math.min(500, data.meteors.length), sparse = Math.max(0, 1 - (count - 1) / 15)
  const bodies: CometBody[] = []
  for (const meteor of data.meteors.slice(0, 500)) {
    if (!/^[a-f\d]{24}$/.test(meteor.id) || !/^\d{4}-\d{2}-\d{2}$/.test(meteor.arrivedOn)) continue
    let seed = parseInt(meteor.id.slice(0, 8), 16) || 1
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 }
    const arrival = Date.parse(meteor.arrivedOn)
    const recency = latest > earliest ? Math.max(0, Math.min(1, (arrival - earliest) / (latest - earliest))) : 1
    const own = (data.meteorId ?? ownId) === meteor.id
    const radius = own ? (0.9 + 3.8 + 1.1) * 1.55 + 0.5 : 0.9 + recency ** 1.8 * 3.8 + sparse * 1.1
    const color = own ? '#83d9ff' : colors[Math.floor(random() * colors.length)]
    const family = Math.floor(random() * 4)
    const rx = width * (.27 + family * .045 + random() * .025) * (1 - sparse * .32)
    const ry = height * (.12 + family * .045 + random() * .025) * (1 - sparse * .15)
    const tilt = (-26 + family * 14) * Math.PI / 180
    const randomPhase = random() * Math.PI * 2
    const phase = sparse > 0 ? bodies.length / Math.max(1, count) * Math.PI * 2 + randomPhase * .18 : randomPhase
    bodies.push({ id: meteor.id, label: `${own ? '你的彗星 · ' : ''}${meteor.region || '未知区域'} · ${meteor.arrivedOn}`,
      own, color, radius, phase, period: 35 + random() * 90, rx, ry, cosTilt: Math.cos(tilt), sinTilt: Math.sin(tilt),
      offsetX: (random() - .5) * width * .08, offsetY: (random() - .5) * height * .12,
      x: 0, y: 0, scale: 1, trail: new Float64Array(((own ? 14 : 7) + 1) * 2) })
  }
  // Preserve SVG painting and hit-test priority: the owner's comet is on top.
  return { sparse, bodies: [...bodies.filter(body => !body.own), ...bodies.filter(body => body.own)] }
}
export function updateVisitorComet(body: CometBody, elapsed: number, sparse: number, width: number, height: number) {
  const angle = body.phase + elapsed / body.period * Math.PI * 2, front = (Math.sin(angle) + 1) / 2
  body.scale = .38 + sparse * .24 + front * (.62 - sparse * .24)
  const arc = (.12 + front * .2) * (1 + sparse * .55) * (body.own ? 2.1 : 1)
  for (let i = 0; i < body.trail.length / 2; i++) {
    const at = angle - arc * i / 7, x = Math.cos(at) * body.rx, y = Math.sin(at) * body.ry
    body.trail[i * 2] = width / 2 + body.offsetX + x * body.cosTilt - y * body.sinTilt
    body.trail[i * 2 + 1] = height / 2 + body.offsetY + x * body.sinTilt + y * body.cosTilt
  }
  body.x = body.trail[0]; body.y = body.trail[1]
  return front
}
export function hitVisitorComet(bodies: CometBody[], x: number, y: number) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i], radius = (body.own ? 44 : 20) * body.scale
    if ((body.x - x) ** 2 + (body.y - y) ** 2 <= radius ** 2) return body
  }
}

export function createVisitorCanvas(options: {
  data: VisitorSkyData; width: number; height: number; epoch: number; ownId?: string
  reducedMotion: boolean; visible: () => boolean
}) {
  const { width, height, epoch, reducedMotion } = options
  const canvas = document.createElement('canvas'), tooltip = document.createElement('div')
  canvas.className = 'visitor-canvas'
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', '每颗彗星代表一个独立浏览器的来访')
  tooltip.className = 'home-visitor-tooltip'; tooltip.hidden = true; tooltip.setAttribute('role', 'status')
  const ratio = Math.min(window.devicePixelRatio || 1, 3)
  canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio)
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw Error('Canvas unavailable')
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  const { bodies, sparse } = visitorCanvasBodies(options.data, width, height, options.ownId)
  const sprites = new Map<string, { image: HTMLCanvasElement; extent: number }>()
  const heads = bodies.map(body => {
    const key = `${body.radius}:${body.color}:${body.own}`
    let sprite = sprites.get(key)
    if (sprite) return sprite
    const extent = body.radius * (body.own ? 2.35 : 4) + 2, image = document.createElement('canvas')
    image.width = image.height = Math.ceil(extent * 2 * ratio)
    const paint = image.getContext('2d')!
    paint.setTransform(ratio, 0, 0, ratio, image.width / 2, image.height / 2)
    const halo = paint.createRadialGradient(0, 0, 0, 0, 0, body.radius * (body.own ? 2.35 : 4))
    const rgb = body.color.slice(1).match(/../g)!.map(value => parseInt(value, 16)).join(',')
    halo.addColorStop(0, `rgba(245,253,255,${body.own ? .72 : .6})`)
    halo.addColorStop(.3, `rgba(${rgb},${body.own ? .28 : .35})`)
    halo.addColorStop(.7, `rgba(${rgb},${body.own ? .06 : .1})`)
    halo.addColorStop(1, `rgba(${rgb},0)`)
    paint.fillStyle = halo; paint.beginPath(); paint.arc(0, 0, body.radius * (body.own ? 2.35 : 4), 0, Math.PI * 2); paint.fill()
    paint.fillStyle = body.color; paint.beginPath(); paint.arc(0, 0, body.radius, 0, Math.PI * 2); paint.fill()
    paint.globalAlpha = .98; paint.fillStyle = '#f4faff'; paint.beginPath(); paint.arc(0, 0, body.radius * (body.own ? .5 : .43), 0, Math.PI * 2); paint.fill()
    sprite = { image, extent: image.width / ratio / 2 }; sprites.set(key, sprite); return sprite
  })
  let frame = 0, disposed = false, painted = false, lastPaint = -Infinity
  const born = performance.now()
  let pointer: { x: number; y: number } | undefined
  const refreshTooltip = () => {
    const body = pointer && hitVisitorComet(bodies, pointer.x, pointer.y)
    if (!body) { tooltip.hidden = true; return }
    if (tooltip.textContent !== body.label) tooltip.textContent = body.label
    tooltip.dataset.own = String(body.own); tooltip.hidden = false
  }
  const move = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect()
    pointer = { x: (event.clientX - box.left) * width / box.width, y: (event.clientY - box.top) * height / box.height }
    tooltip.style.left = `${Math.max(8, Math.min(width - 8, pointer.x))}px`
    tooltip.style.top = `${Math.max(8, Math.min(height - 8, pointer.y))}px`
    tooltip.dataset.side = pointer.x > width * .62 ? 'left' : 'right'
    refreshTooltip()
  }
  const leave = () => { pointer = undefined; tooltip.hidden = true }
  canvas.addEventListener('pointerenter', move); canvas.addEventListener('pointerdown', move)
  canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerleave', leave)
  const paint = (now: number) => {
    if (disposed) return
    if (painted && !canvas.isConnected) { dispose(); return }
    if (!painted || (options.visible() && !document.hidden && now - lastPaint >= 32)) {
      lastPaint = now; painted = true
      const elapsed = reducedMotion ? 0 : (now - epoch) / 1000
      context.clearRect(0, 0, width, height)
      context.lineCap = 'round'
      for (let index = 0; index < bodies.length; index++) {
        const body = bodies[index], front = updateVisitorComet(body, elapsed, sparse, width, height)
        // Match the actual SVG stylesheet: ordinary comets .8, owner's comet 1.
        const opacity = body.own ? 1 : .8
        context.shadowColor = body.own ? '#83d9ff' : 'transparent'; context.shadowBlur = body.own ? 6 * ratio : 0
        for (let i = 0; i < body.trail.length / 2 - 1; i++) {
          const length = body.own ? 15 : 8
          context.globalAlpha = opacity * (sparse * .2 + front ** 3 * (.65 - sparse * .2)) * (1 - i / length) ** 1.4
          context.strokeStyle = body.own && i % 2 ? '#e5c274' : body.color
          context.lineWidth = Math.max(.35, body.radius * body.scale * .55 * (1 - i / length))
          context.beginPath(); context.moveTo(body.trail[(i + 1) * 2], body.trail[(i + 1) * 2 + 1]); context.lineTo(body.trail[i * 2], body.trail[i * 2 + 1]); context.stroke()
        }
        context.globalAlpha = opacity
        const head = heads[index], extent = head.extent * body.scale
        context.drawImage(head.image, body.x - extent, body.y - extent, extent * 2, extent * 2)
        if (body.own) {
          context.save(); context.translate(body.x, body.y); context.scale(body.scale, body.scale)
          context.rotate(reducedMotion ? 0 : (now - born) / 9000 * Math.PI * 2)
          context.strokeStyle = '#e5c274'; context.lineWidth = .9
          for (const [angle, alpha] of [[35, 1], [-35, .72]]) {
            context.globalAlpha = alpha; context.beginPath(); context.ellipse(0, 0, body.radius * 2.35, body.radius * .58, angle * Math.PI / 180, 0, Math.PI * 2); context.stroke()
          }
          context.restore()
        }
      }
      context.globalAlpha = 1; context.shadowBlur = 0
      refreshTooltip()
    }
    if (!reducedMotion) frame = requestAnimationFrame(paint)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true; cancelAnimationFrame(frame)
    canvas.removeEventListener('pointerenter', move); canvas.removeEventListener('pointerdown', move)
    canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerleave', leave)
    sprites.clear()
  }
  // Paint after the caller has attached the canvas and tooltip.
  frame = requestAnimationFrame(paint)
  return { canvas, tooltip, dispose }
}
