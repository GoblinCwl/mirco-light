type Engine = {
  config: (options: { danmuku: unknown[] }) => void
  load: (rows?: unknown[]) => Promise<unknown>
}

/** Plugin load() is a microtask loop: even fast inserts can starve input and
 * media events. Append bounded batches, yielding to rendering between slices. */
export async function loadDanmakuRows(
  engine: Engine,
  rows: unknown[],
  current: () => boolean,
  yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
) {
  if (!current()) return
  engine.config({ danmuku: [] })
  await engine.load()
  let slice = performance.now()
  for (let index = 0; index < rows.length && current(); index += 256) {
    await engine.load(rows.slice(index, index + 256))
    if (performance.now() - slice >= 6) {
      await yieldFrame()
      slice = performance.now()
    }
  }
  if (current()) engine.config({ danmuku: rows })
}
