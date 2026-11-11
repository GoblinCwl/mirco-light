import { Element, Root as HRoot, Text } from "hast"
import { visit } from "unist-util-visit"
import { QuartzTransformerPlugin } from "../types"

const encryptedBlockPattern = /🔐([βγ])\s+([A-Za-z0-9+/_=-]+)\s*🔐/g
const excludedTags = new Set(["code", "pre", "script", "style", "textarea"])

export const MeldEncrypt: QuartzTransformerPlugin = () => {
  return {
    name: "MeldEncrypt",
    htmlPlugins() {
      return [() => (tree: HRoot) => {
        visit(tree, "text", (node: Text, index, parent) => {
          if (index === undefined || !parent) return

          const parentElement = parent as Element
          if (parentElement.type === "element" && excludedTags.has(parentElement.tagName)) return

          const matches = [...node.value.matchAll(encryptedBlockPattern)]
          if (matches.length === 0) return

          const replacement: Array<Text | Element> = []
          let offset = 0

          for (const match of matches) {
            const matchIndex = match.index ?? 0
            if (matchIndex > offset) {
              replacement.push({ type: "text", value: node.value.slice(offset, matchIndex) })
            }

            replacement.push({
              type: "element",
              tagName: "button",
              properties: {
                type: "button",
                className: ["meld-encrypted-block"],
                "data-ciphertext": match[2],
                "data-version": match[1],
                "aria-label": "解密内容",
                title: "解密内容",
              },
              children: [{
                type: "element",
                tagName: "svg",
                properties: {
                  viewBox: "0 0 24 24", width: "20", height: "20",
                  fill: "none", stroke: "currentColor", strokeWidth: 1.7,
                  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
                },
                children: [
                  { type: "element", tagName: "path", properties: { d: "M8 10V7a4 4 0 0 1 8 0v3", strokeWidth: 2 }, children: [] },
                  { type: "element", tagName: "path", properties: { d: "M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm5 4v4h2v-4h-2Z", fill: "currentColor", fillRule: "evenodd", stroke: "none" }, children: [] },
                ],
              }],
            })
            offset = matchIndex + match[0].length
          }

          if (offset < node.value.length) {
            replacement.push({ type: "text", value: node.value.slice(offset) })
          }

          parent.children.splice(index, 1, ...replacement)
        })
      }]
    },
    externalResources() {
      return {
        css: [
          {
            inline: true,
            content: `
.meld-encrypted-block {
  border: 0;
  border-radius: 0.3rem;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  font: inherit;
  padding: 0 0.15rem;
  vertical-align: -0.2em;
  line-height: 0;
}

.meld-encrypted-block > svg {
  width: 1.15em;
  height: 1.15em;
  display: block;
}

.meld-encrypted-block:hover,
.meld-encrypted-block:focus-visible {
  color: var(--tertiary);
}

.meld-encrypted-block:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.meld-decrypt-dialog h2 > svg {
  width: 1em;
  height: 1em;
  margin-left: 0.35em;
  vertical-align: -0.1em;
  color: var(--secondary);
}

.meld-decrypt-modal {
  position: fixed;
  inset: 0;
  z-index: 1001;
  align-items: center;
  background: rgb(0 0 0 / 40%);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  padding: 1.25rem;
}

.meld-decrypt-dialog {
  box-sizing: border-box;
  width: min(32rem, 100%);
  max-height: min(80dvh, 42rem);
  overflow: auto;
  border: 1px solid var(--lightgray);
  border-radius: 0.75rem;
  background: var(--light);
  box-shadow: 0 1rem 3rem rgb(0 0 0 / 20%);
  color: var(--dark);
  padding: 1rem;
  scrollbar-width: thin;
  scrollbar-color: var(--lightgray) transparent;
}

.meld-decrypt-dialog::-webkit-scrollbar,
.meld-decrypt-dialog textarea::-webkit-scrollbar {
  width: 5px;
}

.meld-decrypt-dialog::-webkit-scrollbar-track,
.meld-decrypt-dialog textarea::-webkit-scrollbar-track {
  background: transparent;
}

.meld-decrypt-dialog::-webkit-scrollbar-thumb,
.meld-decrypt-dialog textarea::-webkit-scrollbar-thumb {
  background: var(--lightgray);
  border-radius: 999px;
}

.meld-decrypt-dialog::-webkit-scrollbar-thumb:hover,
.meld-decrypt-dialog textarea::-webkit-scrollbar-thumb:hover {
  background: var(--gray);
}

.meld-decrypt-dialog h2 {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

.meld-decrypt-dialog label,
.meld-decrypt-dialog input,
.meld-decrypt-dialog textarea {
  box-sizing: border-box;
  display: block;
  width: 100%;
}

.meld-decrypt-dialog input,
.meld-decrypt-dialog textarea {
  border: 1px solid var(--lightgray);
  border-radius: 0.35rem;
  background: var(--moreLight);
  color: var(--dark);
  font: inherit;
  margin-top: 0.4rem;
  min-height: 2.35rem;
  padding: 0.45rem 0.6rem;
}

.meld-decrypt-dialog input:focus,
.meld-decrypt-dialog textarea:focus {
  border-color: var(--secondary);
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
  box-shadow: none;
}

.meld-decrypt-dialog textarea {
  min-height: 10rem;
  resize: vertical;
  scrollbar-width: thin;
  scrollbar-color: var(--lightgray) transparent;
}

.meld-password-row {
  align-items: center;
  display: flex !important;
  gap: 0.75rem;
}

.meld-password-row input {
  flex: 1;
  margin-top: 0 !important;
  min-width: 0;
}

.meld-password-field {
  flex: 1;
  min-width: 0;
  position: relative;
}

.meld-password-field input {
  padding-right: 2.75rem;
  -webkit-text-security: disc;
}

.meld-password-field input.show-plain {
  -webkit-text-security: none;
}

.meld-password-row button {
  flex: 0 0 auto;
  min-width: 2.35rem;
}

.meld-password-toggle {
  position: absolute;
  top: 50%;
  right: 0.4rem;
  width: 2rem !important;
  min-width: 2rem !important;
  height: 2rem;
  min-height: 2rem !important;
  padding: 0 !important;
  color: var(--darkgray) !important;
  background: transparent !important;
  border: 0 !important;
  transform: translateY(-50%);
}

.meld-password-toggle:hover {
  color: var(--secondary) !important;
  background: var(--highlight) !important;
}

.meld-decrypt-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.7rem;
}

.meld-decrypt-header h2 {
  margin: 0;
}

.meld-decrypt-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.meld-decrypt-actions button,
.meld-decrypt-header button,
.meld-password-row button {
  align-items: center;
  border: 1px solid var(--lightgray);
  border-radius: 0.5rem;
  background: var(--moreLight);
  color: var(--dark);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-weight: 650;
  justify-content: center;
  min-height: 2.35rem;
  padding: 0.4rem;
  transition: background-color 160ms ease, border-color 160ms ease, opacity 160ms ease;
}

.meld-decrypt-actions button:hover,
.meld-decrypt-header button:hover,
.meld-password-row button:hover:not(:disabled) {
  background: var(--highlight);
  border-color: var(--tertiary);
}

.meld-decrypt-actions button:focus-visible,
.meld-decrypt-header button:focus-visible,
.meld-password-row button:focus-visible {
  outline: 3px solid var(--highlight);
  outline-offset: 2px;
}

.meld-decrypt-actions button[type="submit"],
.meld-password-row button[type="submit"] {
  width: 2.8rem;
  min-height: 2.8rem;
  padding: 0;
  background: var(--secondary);
  border-color: var(--secondary);
  border-radius: 5px;
  color: var(--light);
}

.meld-decrypt-submit {
  background: var(--secondary) !important;
  border-color: var(--secondary) !important;
  color: var(--light) !important;
}

.meld-decrypt-actions button[type="submit"]:hover,
.meld-password-row button[type="submit"]:hover:not(:disabled) {
  background: var(--tertiary);
  border-color: var(--tertiary);
}

.meld-decrypt-submit:hover:not(:disabled) {
  background: var(--tertiary) !important;
  border-color: var(--tertiary) !important;
}

.meld-password-row button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.meld-decrypt-header button svg,
.meld-password-row button svg {
  height: 1rem;
  width: 1rem;
}

.meld-autofill-username {
  height: 1px;
  left: -9999px;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  top: auto;
  width: 1px;
}

.meld-copy-toast {
  position: fixed;
  left: 50%;
  top: 1.5rem;
  z-index: 1002;
  border-radius: 999px;
  background: var(--dark);
  color: var(--light);
  font-size: 0.85rem;
  opacity: 0;
  padding: 0.5rem 0.8rem;
  pointer-events: none;
  transform: translate(-50%, -0.5rem);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.meld-copy-toast.error {
  align-items: center;
  display: flex;
  gap: 0.4rem;
}

.meld-copy-toast.error svg {
  height: 1rem;
  width: 1rem;
}

.meld-copy-toast.visible {
  opacity: 0.95;
  transform: translate(-50%, 0);
}
`,
          },
        ],
        js: [
          {
            contentType: "inline",
            loadTime: "afterDOMReady",
            script: `
(() => {
  if (window.__meldDecryptBound) return
  window.__meldDecryptBound = true

  const decodeBase64 = (value) => {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const binary = window.atob(padded)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  }

  const encodeBase64 = (bytes) => {
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return window.btoa(binary)
  }

  const deriveKey = async (password, salt, iterations) => {
    const passwordKey = await window.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    )
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-512", salt, iterations },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    )
  }

  const decryptBeta = async (ciphertext, password) => {
    const payload = decodeBase64(ciphertext)
    if (payload.length < 48) throw new Error("密文格式不完整")
    const iv = payload.slice(0, 16)
    const salt = payload.slice(16, 32)
    const encrypted = payload.slice(32)
    const key = await deriveKey(password, salt, 210000)
    const plaintext = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted)
    return new TextDecoder().decode(plaintext)
  }

  const decryptGamma = async (ciphertext, password) => {
    const payload = decodeBase64(ciphertext)
    if (payload.length < 48 || payload[0] !== 1) throw new Error("不支持的 γ 密文格式")

    const iterations = payload[1] * 65536 + payload[2] * 256 + payload[3]
    if (iterations < 220000 || iterations > 2000000) throw new Error("不支持的迭代次数")

    const salt = payload.slice(4, 20)
    const iv = payload.slice(20, 32)
    const encrypted = payload.slice(32)
    const envelope = {
      version: "3.0",
      kdf: { name: "PBKDF2", hash: "SHA-512", iterations, salt: encodeBase64(salt) },
      cipher: { name: "AES-GCM", keyLength: 256, iv: encodeBase64(iv), tagLength: 128 },
    }
    const key = await deriveKey(password, salt, iterations)
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        tagLength: 128,
        additionalData: new TextEncoder().encode(JSON.stringify(envelope)),
      },
      key,
      encrypted,
    )
    return new TextDecoder().decode(plaintext)
  }

  const decrypt = async (ciphertext, version, password) => {
    if (!window.crypto || !window.crypto.subtle) throw new Error("当前浏览器不支持本地解密")
    if (version === "β") return decryptBeta(ciphertext, password)
    if (version === "γ") return decryptGamma(ciphertext, password)
    throw new Error("不支持的密文格式")
  }

  let toastTimeout
  const showToast = (message, isError = false) => {
    let toast = document.querySelector(".meld-copy-toast")
    if (!toast) {
      toast = document.createElement("div")
      toast.className = "meld-copy-toast"
      toast.setAttribute("role", "status")
      toast.setAttribute("aria-live", "polite")
      document.body.appendChild(toast)
    }
    toast.classList.toggle("error", isError)
    toast.innerHTML = isError
      ? '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg><span>密码错误，请重试。</span>'
      : message
    toast.classList.add("visible")
    window.clearTimeout(toastTimeout)
    toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 1500)
  }

  const openDecryptDialog = (ciphertext, version) => {
    const modal = document.createElement("div")
    modal.className = "meld-decrypt-modal"
    modal.innerHTML = '<form class="meld-decrypt-dialog" aria-modal="true" role="dialog">' +
      '<div class="meld-decrypt-auth">' +
      '<h2>文本已加密<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2"/></svg></h2>' +
      '<input class="meld-autofill-username" name="username" type="text" autocomplete="username" tabindex="-1" aria-hidden="true">' +
      '<div class="meld-password-row"><div class="meld-password-field"><input name="password" type="text" aria-label="密码" autocomplete="off" autocapitalize="none" spellcheck="false" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" autofocus><button class="meld-password-toggle" type="button" data-action="toggle-password" aria-label="显示密码" title="显示密码"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"></path><circle cx="12" cy="12" r="3"></circle></svg></button></div><button class="meld-decrypt-submit" type="submit" aria-label="解密" title="解密" disabled><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg></button></div>' +
      '</div>' +
      '</form>'
    document.body.appendChild(modal)

    let onKeyDown
    const close = () => {
      document.removeEventListener("keydown", onKeyDown)
      modal.remove()
    }
    const form = modal.querySelector("form")
    const passwordInput = modal.querySelector("input[name=password]")
    const submit = modal.querySelector("button[type=submit]")
    const passwordVisibilityToggle = modal.querySelector("[data-action=toggle-password]")
    const updateSubmitState = () => {
      submit.disabled = passwordInput.value.length === 0
    }
    modal.addEventListener("click", (event) => { if (event.target === modal) close() })
    onKeyDown = (event) => { if (event.key === "Escape") close() }
    document.addEventListener("keydown", onKeyDown)
    passwordInput.addEventListener("input", updateSubmitState)
    passwordVisibilityToggle.addEventListener("click", () => {
      const isPlaintext = passwordInput.classList.toggle("show-plain")
      const label = isPlaintext ? "隐藏密码" : "显示密码"
      passwordVisibilityToggle.setAttribute("aria-label", label)
      passwordVisibilityToggle.setAttribute("title", label)
      passwordVisibilityToggle.setAttribute("aria-pressed", String(isPlaintext))
      passwordVisibilityToggle.querySelector("svg").innerHTML = isPlaintext
        ? '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.6 6.6A19 19 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.6"/>'
        : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>'
    })
    updateSubmitState()
    window.setTimeout(() => passwordInput.focus(), 0)

    form.addEventListener("submit", async (event) => {
      event.preventDefault()
      if (passwordInput.value.length === 0) return
      submit.disabled = true
      try {
        const plaintext = await decrypt(ciphertext, version, passwordInput.value)
        form.querySelector(".meld-decrypt-auth").hidden = true
        const result = document.createElement("div")
        result.className = "meld-decrypt-result"
        result.innerHTML = '<div class="meld-decrypt-header"><h2>文本已解密<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.8-1M12 15v2"/></svg></h2><button type="button" data-action="copy" aria-label="复制" title="复制"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg></button></div><textarea readonly aria-label="解密内容"></textarea>'
        form.appendChild(result)
        const output = result.querySelector("textarea")
        output.value = plaintext
        const copyButton = result.querySelector("[data-action=copy]")
        copyButton.addEventListener("click", async (event) => {
          event.preventDefault()
          event.stopPropagation()
          try {
            await navigator.clipboard.writeText(plaintext)
            showToast("✓ 已复制到剪贴板")
          } catch (_error) {
            showToast("复制失败，请手动复制文本")
          }
        })
      } catch (_error) {
        showToast("密码错误，请重试。", true)
        submit.disabled = false
      }
    })
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".meld-encrypted-block")
    if (!button) return
    openDecryptDialog(button.dataset.ciphertext, button.dataset.version)
  })
})()
`,
          },
        ],
      }
    },
  }
}
