declare const streamSaver: {
  mitm: string
  createWriteStream(name: string): WritableStream<Uint8Array>
}
export default streamSaver
