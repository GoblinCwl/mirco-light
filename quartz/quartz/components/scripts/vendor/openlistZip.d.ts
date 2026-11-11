type ZipEntry = { name: string; stream?: ReadableStream<Uint8Array>; directory?: boolean; lastModified?: number }
type ZipController = { enqueue(entry: ZipEntry): void; close(): void }
export default function createWriter(source: { pull(controller: ZipController): void | Promise<void>; cancel?(reason: unknown): void }): ReadableStream<Uint8Array>
