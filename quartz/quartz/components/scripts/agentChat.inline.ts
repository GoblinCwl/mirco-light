import { lockPageScroll } from "./pageScrollLock"
import { closeSiteDialog, showSiteDialog } from "./siteDialog"
import { setupStarbudConversation } from "./agentChatConversation"

const idleMoves: ((direction: number) => Keyframe[])[] = [
  (direction) => [
    { transform: "translateY(1px) scaleY(.94)", offset: .15 },
    { transform: `translateY(-5px) rotate(${11 * direction}deg)`, offset: .41 },
    { transform: "translateY(1px) scaleY(.96)", offset: .68 },
    { transform: "none" },
  ],
  (direction) => [
    { transform: `rotate(${-15 * direction}deg)`, offset: .28 },
    { transform: `rotate(${12 * direction}deg)`, offset: .55 },
    { transform: `rotate(${-5 * direction}deg)`, offset: .77 },
    { transform: "none" },
  ],
  (direction) => [
    { transform: `translate(${3 * direction}px, -1px) rotate(${8 * direction}deg)`, offset: .32 },
    { transform: `translate(${3 * direction}px, -1px) rotate(${8 * direction}deg)`, offset: .55 },
    { transform: `translateX(${-direction}px)`, offset: .8 },
    { transform: "none" },
  ],
  (direction) => [
    { transform: `perspective(65px) rotateY(${90 * direction}deg)`, offset: .25 },
    { transform: `perspective(65px) rotateY(${180 * direction}deg)`, offset: .5 },
    { transform: `perspective(65px) rotateY(${270 * direction}deg)`, offset: .75 },
    { transform: `perspective(65px) rotateY(${360 * direction}deg)` },
  ],
]

const idleGlowRest = "drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent)"
const idleGlowPeak = "drop-shadow(0 0 3px var(--tertiary)) drop-shadow(0 0 6px color-mix(in srgb, var(--tertiary) 68%, transparent))"

document.addEventListener("nav", () => {
  const trigger = document.querySelector<HTMLButtonElement>(".agent-chat-trigger")
  const dialog = document.querySelector<HTMLDialogElement>("#agent-chat-dialog")
  const icon = trigger?.querySelector("svg")
  const figure = icon?.querySelector("g")
  const spark = figure?.querySelector(".agent-chat-spark")
  if (!trigger || !dialog || !icon || !figure || !spark) return
  const lifecycle = new AbortController()
  const { signal } = lifecycle
  const renderConversation = setupStarbudConversation(dialog, signal)
  let unlock: (() => void) | undefined
  const close = dialog.querySelector<HTMLButtonElement>("[data-agent-chat-close]")
  const motion = matchMedia("(prefers-reduced-motion: reduce)")
  let motionTimer: number | undefined
  let movements: Animation[] = []
  let previousMove = -1
  const canMove = () => !signal.aborted && !motion.matches && !document.hidden && !dialog.open
  const scheduleMovement = () => {
    clearTimeout(motionTimer)
    if (!canMove()) return
    motionTimer = window.setTimeout(() => {
      if (!canMove()) return
      const choices = idleMoves.length - (previousMove >= 0 ? 1 : 0)
      let move = Math.floor(Math.random() * choices)
      if (previousMove >= 0 && move >= previousMove) move++
      previousMove = move
      const direction = Math.random() < .5 ? -1 : 1
      const duration = 900 + Math.random() * 150
      movements = [
        icon.animate([
          { transform: "none" },
          ...idleMoves[move](direction),
        ], { duration, easing: "ease-in-out" }),
        figure.animate([
          { filter: idleGlowRest },
          { filter: idleGlowPeak, offset: .45 },
          { filter: idleGlowRest },
        ], { duration, easing: "ease-in-out" }),
        spark.animate([
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(.7)", opacity: .65, offset: .22 },
          { transform: "scale(1.45)", opacity: 1, offset: .47 },
          { transform: "scale(1)", opacity: 1 },
        ], { duration, easing: "ease-in-out" }),
      ]
      scheduleMovement()
    }, 2100 + Math.random() * 1900)
  }
  const resetMovement = () => {
    movements.forEach(animation => animation.cancel())
    movements = []
    scheduleMovement()
  }
  motion.addEventListener("change", resetMovement, { signal })
  document.addEventListener("visibilitychange", resetMovement, { signal })
  scheduleMovement()

  trigger.addEventListener("click", () => {
    if (dialog.open) return
    unlock ??= lockPageScroll({ preserveLayout: true, signal })
    showSiteDialog(dialog)
    void renderConversation()
    trigger.setAttribute("aria-expanded", "true")
    resetMovement()
  }, { signal })
  close?.addEventListener("click", () => void closeSiteDialog(dialog), { signal })
  dialog.addEventListener("close", () => {
    if (dialog.open) return
    unlock?.()
    unlock = undefined
    trigger.setAttribute("aria-expanded", "false")
    scheduleMovement()
  }, { signal })
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return
    const box = dialog.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
      void closeSiteDialog(dialog)
    }
  }, { signal })
  window.addCleanup(() => {
    lifecycle.abort()
    resetMovement()
    if (dialog.open) dialog.close()
  })
})
