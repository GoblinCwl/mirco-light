let toastTimeout: number | undefined

function showCopyToast(message: string) {
  let toast = document.querySelector(".copy-link-toast") as HTMLElement | null
  if (!toast) {
    toast = document.createElement("div")
    toast.className = "copy-link-toast"
    toast.setAttribute("role", "status")
    toast.setAttribute("aria-live", "polite")
    document.body.appendChild(toast)
  }

  toast.textContent = message
  toast.classList.add("visible")
  if (toastTimeout) window.clearTimeout(toastTimeout)
  toastTimeout = window.setTimeout(() => toast?.classList.remove("visible"), 1500)
}

function copyTitleLink() {
  // 检查是否为纯净模式
  const isPureMode = new URLSearchParams(window.location.search).get("pure") === "true"

  // URL 会保留规范的百分号编码，便于聊天软件等外部应用识别完整链接。
  const url = new URL(window.location.href)
  url.hash = ""

  if (isPureMode) {
    url.searchParams.set("pure", "true")
  } else {
    url.searchParams.delete("pure")
  }

  navigator.clipboard
    .writeText(url.toString())
    .then(() => showCopyToast("✓ 链接已复制"))
    .catch((err) => {
      console.error("Failed to copy link: ", err)
      showCopyToast("复制失败，请手动复制")
    })
}

document.addEventListener("click", (event) => {
  const title = (event.target as HTMLElement).closest(".article-title-copy") as HTMLElement | null
  if (title) copyTitleLink()
})

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return
  const title = (event.target as HTMLElement).closest(".article-title-copy") as HTMLElement | null
  if (!title) return
  event.preventDefault()
  copyTitleLink()
})
