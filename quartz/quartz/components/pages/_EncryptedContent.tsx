import { QuartzComponent, QuartzComponentConstructor } from "../types"
import { i18n } from "../../i18n"
import PasswordGate from "../PasswordGate"

const EncryptedContent: QuartzComponent = ({ encryptedPayloadUrl, encryptedCacheId, cfg }) => {
  const text = i18n(cfg.locale).pages.encryptedContent
  return <article id="content"><PasswordGate hidden payloadUrl={encryptedPayloadUrl} cacheId={encryptedCacheId}
    message={text.enterPassword} placeholder={text.password} submitLabel={text.submit}
    loading={text.loading} decrypting={text.decrypting} wrongPassword={text.wrongPassword}
    modernBrowser={text.modernBrowser} noPayload={text.noPayload} /></article>
}

export default (() => EncryptedContent) satisfies QuartzComponentConstructor
