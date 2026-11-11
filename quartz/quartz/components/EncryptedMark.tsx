import { encryptedIcon } from "../util/encryptedIcon"

const EncryptedMark = () => <span class="encrypted-mark" role="img" aria-label="加密文章" dangerouslySetInnerHTML={{ __html: encryptedIcon }} />

export default EncryptedMark
