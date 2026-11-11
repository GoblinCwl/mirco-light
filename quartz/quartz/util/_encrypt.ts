import { base64 } from "rfc4648"
import { getRandomValues, subtle } from "crypto"

export async function getEncryptedPayload(
    content: string,
    password: string,
    iterations: number = 2e6,
    saltSeed?: string,
) {
    const encoder = new TextEncoder()
    // A stable per-article salt lets the browser reuse a cached key across
    // rebuilds. The IV below remains random for every build.
    const salt = saltSeed
        ? new Uint8Array(await subtle.digest("SHA-256", encoder.encode(`quartz-encrypted:${saltSeed}`)))
        : getRandomValues(new Uint8Array(32))
    const baseKey = await subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
        "deriveKey",
    ])
    const key = await subtle.deriveKey(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"],
    )

    const iv = getRandomValues(new Uint8Array(16))
    const ciphertext = new Uint8Array(
        await subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(content)),
    )
    const totalLength = salt.length + iv.length + ciphertext.length
    const mergedData = new Uint8Array(totalLength)
    mergedData.set(salt)
    mergedData.set(iv, salt.length)
    mergedData.set(ciphertext, salt.length + iv.length)

    return base64.stringify(mergedData)
}