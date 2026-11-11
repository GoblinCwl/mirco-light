type PasswordGateProps = {
  prefix?: string
  message: string
  placeholder: string
  submitLabel: string
  inputName?: string
  hidden?: boolean
  payloadUrl?: string
  cacheId?: string
  loading?: string
  decrypting?: string
  wrongPassword?: string
  modernBrowser?: string
  noPayload?: string
}

// The article and Drive gates deliberately share their markup and stylesheet.
export default function PasswordGate({ prefix = "", message, placeholder, submitLabel,
  inputName = "unlock-key", hidden = false, payloadUrl, cacheId, loading, decrypting,
  wrongPassword, modernBrowser, noPayload }: PasswordGateProps) {
  const articleIds: Record<string, string> = {
    lock: "lock", message: "msg", form: "lockForm", password: "password", visibility: "toggle-password-visibility",
    error: "error-msg", load: "load", "load-text": "load-text", "keyhole-mask": "lock-keyhole-mask",
  }
  const id = (part: string) => prefix ? `${prefix}-${part}` : articleIds[part]
  return (
            <div id={id("lock")} class={`password-gate${hidden ? " hidden" : ""}`} data-payload-url={payloadUrl} data-cache-id={cacheId}>
                <div class="lock-header">
                    <div class="lock-icon" aria-hidden="true">
                        <svg viewBox="0 0 64 64" fill="none">
                            <defs>
                                <mask id={id("keyhole-mask")}>
                                    <rect width="64" height="64" fill="#fff" />
                                    <circle cx="32" cy="38" r="3.6" fill="#000" />
                                    <path d="M32 40v7" stroke="#000" stroke-width="4.2" stroke-linecap="round" />
                                </mask>
                            </defs>
                            <path
                                d="M20 28v-4a12 12 0 0 1 24 0v4"
                                stroke="currentColor"
                                stroke-width="6"
                                stroke-linecap="round"
                            />
                            <rect x="11" y="27" width="42" height="29" rx="9" fill="currentColor" mask={`url(#${id("keyhole-mask")})`} />
                            <path d="M50 13l.9 2.1L53 16l-2.1.9L50 19l-.9-2.1L47 16l2.1-.9L50 13Z" fill="currentColor" opacity=".6" />
                            <circle cx="14" cy="15" r="1.3" fill="currentColor" opacity=".45" />
                        </svg>
                    </div>
                    <div
                        id={id("message")} class="password-gate-message"
                    >
                        {message}
                    </div>
                </div>
                <div id={id("load")} class="password-gate-load">
                    <p class="spinner"></p>
                    <p id={id("load-text")} data-decrypt={decrypting}>
                        {loading}
                    </p>
                </div>
                <form id={id("form")} class="password-gate-form" autocomplete="off">
                    <div class="password-field">
                        <span class="password-icon" aria-hidden="true">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <circle cx="8" cy="8" r="4" />
                                <path d="M11 11l9.5 9.5" />
                                <path d="M17 17l2-2" />
                                <path d="M19.5 19.5l1.5-1.5" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            class="pwd"
                            id={id("password")}
                            name={inputName}
                            placeholder={placeholder}
                            aria-label={placeholder}
                            aria-describedby={`${id("message")} ${id("error")}`}
                            autocomplete="off"
                            spellcheck={false}
                            autocapitalize="none"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            data-bwignore="true"
                            autofocus
                        />
                        <button
                            id={id("visibility")} class="password-visibility-toggle"
                            type="button"
                            aria-label="显示密码"
                            title="显示密码"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                    </div>
                    <button
                        type="submit"
                        aria-label={submitLabel}
                        title={submitLabel}
                        disabled
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                        >
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                        </svg>
                    </button>
                    <div
                        id={id("error")} class="password-gate-error"
                        role="alert"
                        aria-live="assertive"
                        data-wrong={wrongPassword}
                        data-modern={modernBrowser}
                        data-empty={noPayload}
                    ></div>
                </form>
            </div>
  )
}
