// Touch events keep single-finger orbit navigation independent of Safari's
// pointer cancellation, while leaving taps and two-finger zoom available.
export function bindTagOrbitDrag(stage: HTMLElement, signal: AbortSignal, handlers: {
  start(id: number, x: number, y: number): void
  move(id: number, x: number, y: number, threshold: number): boolean
  end(id: number, inertia: boolean): void
}) {
  let touchID: number | undefined
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0) return
    handlers.start(event.pointerId, event.clientX, event.clientY)
  }, { signal })
  stage.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return
    if (handlers.move(event.pointerId, event.clientX, event.clientY, 5)) {
      if (!stage.hasPointerCapture(event.pointerId)) stage.setPointerCapture(event.pointerId)
      event.preventDefault()
    }
  }, { signal })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    stage.addEventListener(type, event => {
      if (event.pointerType === 'touch') return
      handlers.end(event.pointerId, type === 'pointerup')
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId)
    }, { signal })
  }
  stage.addEventListener('touchstart', event => {
    if (touchID !== undefined) handlers.end(touchID, false)
    touchID = undefined
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    touchID = touch.identifier
    handlers.start(touchID, touch.clientX, touch.clientY)
  }, { signal, passive: true })
  stage.addEventListener('touchmove', event => {
    if (touchID === undefined) return
    if (event.touches.length !== 1) {
      handlers.end(touchID, false); touchID = undefined; return
    }
    const touch = event.touches[0]
    if (handlers.move(touch.identifier, touch.clientX, touch.clientY, 4) && event.cancelable) event.preventDefault()
  }, { signal, passive: false })
  for (const type of ['touchend', 'touchcancel'] as const) {
    stage.addEventListener(type, event => {
      if (touchID === undefined || Array.from(event.touches).some(t => t.identifier === touchID)) return
      handlers.end(touchID, type === 'touchend'); touchID = undefined
    }, { signal, passive: true })
  }
}
