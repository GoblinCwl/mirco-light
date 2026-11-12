import chokidar from 'chokidar'

// Begin observing before the first file read. Hold events until the initial
// content map is ready, so edits during a full build cannot fall into a gap.
export async function watchContent(directory, ignored, rebuild) {
  const changes = []
  let active = false, closed = false
  const watcher = chokidar.watch('.', {
    cwd: directory, ignored, ignoreInitial: true, persistent: true,
    awaitWriteFinish: { stabilityThreshold: 250 },
  })
  for (const [event, type] of [['add','add'],['change','change'],['unlink','delete']]) {
    watcher.on(event, path => {
      if (closed) return
      changes.push({path: path.replaceAll("\\", "/"), type})
      if (active) rebuild(changes)
    })
  }
  try {
    await new Promise((resolve,reject) => {
      const ready = () => { watcher.off('error',failed); resolve() }
      const failed = error => { watcher.off('ready',ready); reject(error) }
      watcher.once('ready',ready); watcher.once('error',failed)
    })
  } catch (error) { await watcher.close(); throw error }
  return {
    activate() {
      if (closed || active) return
      active = true
      if (changes.length) rebuild(changes)
    },
    async close() { closed = true; active = false; await watcher.close() },
  }
}
