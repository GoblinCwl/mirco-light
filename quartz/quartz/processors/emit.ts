import { listedContent, publicLinks } from "../util/contentVisibility"
import { PerfTimer } from "../util/perf"
import { getStaticResourcesFromPlugins } from "../plugins"
import { ProcessedContent } from "../plugins/vfile"
import { QuartzLogger } from "../util/log"
import { trace } from "../util/trace"
import { BuildCtx } from "../util/ctx"
import { styleText } from "util"

export async function emitContent(ctx: BuildCtx, content: ProcessedContent[]) {
  const { argv, cfg } = ctx
  const perf = new PerfTimer()
  const log = new QuartzLogger(ctx.argv.verbose)

  log.start(`Emitting files`)

  let emittedFiles = 0
  let failed = false
  const staticResources = getStaticResourcesFromPlugins(ctx)
  const discovery = discoveryContent(ctx, content)
  await Promise.all(
    cfg.plugins.emitters.map(async (emitter) => {
      try {
        const emitted = await emitter.emit(ctx, emitter.discoveryOnly ? discovery : content, staticResources)
        if (Symbol.asyncIterator in emitted) {
          // Async generator case
          for await (const file of emitted) {
            emittedFiles++
            if (ctx.argv.verbose) {
              console.log(`[emit:${emitter.name}] ${file}`)
            } else {
              log.updateText(`${emitter.name} -> ${styleText("gray", file)}`)
            }
          }
        } else {
          // Array case
          emittedFiles += emitted.length
          for (const file of emitted) {
            if (ctx.argv.verbose) {
              console.log(`[emit:${emitter.name}] ${file}`)
            } else {
              log.updateText(`${emitter.name} -> ${styleText("gray", file)}`)
            }
          }
        }
      } catch (err) {
        failed = true
        trace(`Failed to emit from plugin \`${emitter.name}\``, err as Error, false)
      }
    }),
  )

  log.end(`Emitted ${emittedFiles} files to \`${argv.output}\` in ${perf.timeSince()}`)
  return !failed
}

export function discoveryContent(ctx: BuildCtx, content: ProcessedContent[]): ProcessedContent[] {
  const listed = listedContent(content, ctx.cfg.configuration)
  const hiddenLinks = publicLinks(content, ctx.cfg.configuration)
  return listed.map(([tree, file]) => {
    const copy = Object.assign(Object.create(Object.getPrototypeOf(file)), file)
    copy.data = { ...file.data, links: file.data.links?.filter(link => !hiddenLinks.has(link)) }
    return [tree, copy] as ProcessedContent
  })
}
