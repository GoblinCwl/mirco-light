import sourceMapSupport from "source-map-support"
sourceMapSupport.install(options)
import path from "path"
import { PerfTimer } from "./util/perf"
import { GlobbyFilterFunction, isGitIgnored } from "globby"
import { styleText } from "util"
import { parseMarkdown } from "./processors/parse"
import { filterContent } from "./processors/filter"
import { emitContent, discoveryContent } from "./processors/emit"
import { publishBuildSnapshot } from "./util/buildSnapshot"
import { publishContentSnapshot } from "./util/contentSnapshot"
// @ts-ignore JavaScript watcher policy shared with the CLI
import { contentWatchIgnored } from "./cli/watchPolicy.mjs"
import { notifyBuildPublished } from "./cli/buildPublished.mjs"
import { beginPublication, type Publication } from "./cli/publishOutput.mjs"
import cfg from "../quartz.config"
import { FilePath, joinSegments, slugifyFilePath } from "./util/path"
import chokidar from "chokidar"
import { ProcessedContent } from "./plugins/vfile"
import { Argv, BuildCtx } from "./util/ctx"
import { glob, toPosixPath } from "./util/glob"
import { trace } from "./util/trace"
import { options } from "./util/sourcemap"
import { Mutex } from "async-mutex"
import { getStaticResourcesFromPlugins } from "./plugins"
import { randomIdNonSecure } from "./util/random"
import { ChangeEvent } from "./plugins/types"
import { minimatch } from "minimatch"

type ContentMap = Map<
  FilePath,
  | {
      type: "markdown"
      content: ProcessedContent
    }
  | {
      type: "other"
    }
>

type BuildData = {
  ctx: BuildCtx
  outputRoot: string
  ignored: GlobbyFilterFunction
  mut: Mutex
  contentMap: ContentMap
  changesSinceLastBuild: Record<FilePath, ChangeEvent["type"]>
  needsFullEmit?: boolean
  lastBuildMs: number
}

async function buildQuartz(argv: Argv, mut: Mutex, clientRefresh: () => void) {
  const ctx: BuildCtx = {
    buildId: randomIdNonSecure(),
    argv: { ...argv },
    cfg,
    allSlugs: [],
    allFiles: [],
    incremental: false,
  }

  const perf = new PerfTimer()
  const output = argv.output

  const pluginCount = Object.values(cfg.plugins).flat().length
  const pluginNames = (key: "transformers" | "filters" | "emitters") =>
    cfg.plugins[key].map((plugin) => plugin.name)
  if (argv.verbose) {
    console.log(`Loaded ${pluginCount} plugins`)
    console.log(`  Transformers: ${pluginNames("transformers").join(", ")}`)
    console.log(`  Filters: ${pluginNames("filters").join(", ")}`)
    console.log(`  Emitters: ${pluginNames("emitters").join(", ")}`)
  }

  const release = await mut.acquire()
  let publication: Publication | undefined
  try {
    perf.addEvent("clean")
    publication = await beginPublication(output)
    ctx.argv.output = publication.directory

    perf.addEvent("glob")
    const allFiles = await glob("**/*.*", argv.directory, cfg.configuration.ignorePatterns)
    const markdownPaths = allFiles.filter((fp) => fp.endsWith(".md")).sort()
    console.log(
      `Found ${markdownPaths.length} input files from \`${argv.directory}\` in ${perf.timeSince("glob")}`,
    )

    const filePaths = markdownPaths.map((fp) => joinSegments(argv.directory, fp) as FilePath)
    ctx.allFiles = allFiles
    ctx.allSlugs = allFiles.map((fp) => slugifyFilePath(fp as FilePath))

    const parsedFiles = await parseMarkdown(ctx, filePaths)
    const filteredContent = filterContent(ctx, parsedFiles)

    if (!(await emitContent(ctx, filteredContent))) throw new Error("Full build emission failed")
    await publication.commit()
    ctx.argv.output = output
    await publishContentSnapshot(filteredContent, cfg.configuration)
    await publishBuildSnapshot(filteredContent, cfg.configuration)
    await notifyBuildPublished()
    console.log(
      styleText("green", `Done processing ${markdownPaths.length} files in ${perf.timeSince()}`),
    )

    if (argv.watch) {
      ctx.incremental = true
      return await startWatching(ctx, mut, parsedFiles, clientRefresh)
    }
  } finally {
    ctx.argv.output = output
    try {
      await publication?.discard()
    } finally {
      release()
    }
  }
}

// setup watcher for rebuilds
async function startWatching(
  ctx: BuildCtx,
  mut: Mutex,
  initialContent: ProcessedContent[],
  clientRefresh: () => void,
) {
  const { argv, allFiles } = ctx

  const contentMap: ContentMap = new Map()
  for (const filePath of allFiles) {
    contentMap.set(filePath, {
      type: "other",
    })
  }

  for (const content of initialContent) {
    const [_tree, vfile] = content
    contentMap.set(vfile.data.relativePath!, {
      type: "markdown",
      content,
    })
  }

  const gitIgnoredMatcher = await isGitIgnored()
  const buildData: BuildData = {
    ctx,
    outputRoot: argv.output,
    mut,
    contentMap,
    ignored: (fp) => {
      const pathStr = toPosixPath(fp.toString())
      if (pathStr.startsWith(".git/")) return true
      if (/^\.quartz-tags-.*\.tmp$/.test(path.posix.basename(pathStr))) return true
      if (gitIgnoredMatcher(pathStr)) return true
      for (const pattern of cfg.configuration.ignorePatterns) {
        if (minimatch(pathStr, pattern)) {
          return true
        }
      }

      return false
    },

    changesSinceLastBuild: {},
    lastBuildMs: 0,
  }

  const watcher = chokidar.watch(".", {
    awaitWriteFinish: { stabilityThreshold: 250 },
    persistent: true,
    cwd: argv.directory,
    ignoreInitial: true,
    ignored: contentWatchIgnored(argv.directory, cfg.configuration.ignorePatterns, buildData.ignored),
  })

  const changes: ChangeEvent[] = []
  watcher
    .on("add", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "add" })
      void rebuild(changes, clientRefresh, buildData).catch((error) => {
        console.error("Rebuild failed; pending changes will be retried on the next change.", error)
      })
    })
    .on("change", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "change" })
      void rebuild(changes, clientRefresh, buildData).catch((error) => {
        console.error("Rebuild failed; pending changes will be retried on the next change.", error)
      })
    })
    .on("unlink", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "delete" })
      void rebuild(changes, clientRefresh, buildData).catch((error) => {
        console.error("Rebuild failed; pending changes will be retried on the next change.", error)
      })
    })

  return async () => {
    await watcher.close()
  }
}

async function rebuild(changes: ChangeEvent[], clientRefresh: () => void, buildData: BuildData) {
  const { ctx, contentMap, mut, changesSinceLastBuild } = buildData
  const { argv, cfg } = ctx

  const buildId = randomIdNonSecure()
  ctx.buildId = buildId
  buildData.lastBuildMs = new Date().getTime()
  const numChangesInBuild = changes.length
  const release = await mut.acquire()
  let publication: Publication | undefined

  try {
    // A newer queued build will consume these changes instead.
    if (ctx.buildId !== buildId) return

    const perf = new PerfTimer()
    perf.addEvent("rebuild")
    console.log(styleText("yellow", "Detected change, rebuilding..."))

    // update changesSinceLastBuild
    for (const change of changes.slice(0, numChangesInBuild)) {
      changesSinceLastBuild[change.path] = change.type
    }

    const staticResources = getStaticResourcesFromPlugins(ctx)
    const pathsToParse: FilePath[] = []
    // Keep track of published files before replacing their parsed content below. A
    // frontmatter-only change can make a file fail a filter (for example,
    // `publish: true` -> `publish: false`). In that case partial emitters have no
    // output to replace, so their previously generated files would otherwise
    // remain in the output directory.
    const previouslyPublished = new Set<FilePath>()
    for (const [fp, type] of Object.entries(changesSinceLastBuild)) {
      if (path.extname(fp) !== ".md") continue

      const previousContent = contentMap.get(fp as FilePath)
      if (
        previousContent?.type === "markdown" &&
        filterContent(ctx, [previousContent.content]).length > 0
      ) {
        previouslyPublished.add(fp as FilePath)
      }

      // Capture deleted pages before removing them from contentMap. Partial page
      // emitters cannot clean up their HTML/aliases after this metadata is lost.
      if (type === "delete") continue

      const fullPath = joinSegments(argv.directory, toPosixPath(fp)) as FilePath
      pathsToParse.push(fullPath)
    }

    const parsed = await parseMarkdown(ctx, pathsToParse)
    for (const content of parsed) {
      contentMap.set(content[1].data.relativePath!, {
        type: "markdown",
        content,
      })
    }

    // update state using changesSinceLastBuild
    // we do this weird play of add => compute change events => remove
    // so that partialEmitters can do appropriate cleanup based on the content of deleted files
    for (const [file, change] of Object.entries(changesSinceLastBuild)) {
      if (change === "delete") {
        // universal delete case
        contentMap.delete(file as FilePath)
      }

      // manually track non-markdown files as processed files only
      // contains markdown files
      if (change === "add" && path.extname(file) !== ".md") {
        contentMap.set(file as FilePath, {
          type: "other",
        })
      }
    }

    const changeEvents: ChangeEvent[] = Object.entries(changesSinceLastBuild).map(([fp, type]) => {
      const path = fp as FilePath
      const processedContent = contentMap.get(path)
      if (processedContent?.type === "markdown") {
        const [_tree, file] = processedContent.content
        return {
          type,
          path,
          file,
        }
      }

      return {
        type,
        path,
      }
    })

    // update allFiles and then allSlugs with the consistent view of content map
    ctx.allFiles = Array.from(contentMap.keys())
    ctx.allSlugs = ctx.allFiles.map((fp) => slugifyFilePath(fp as FilePath))
    let processedFiles = filterContent(
      ctx,
      Array.from(contentMap.values())
        .filter((file) => file.type === "markdown")
        .map((file) => file.content),
    )

    const currentlyPublished = new Set(
      processedFiles.map(([, file]) => file.data.relativePath as FilePath),
    )
    const hasUnpublishedFile = Array.from(previouslyPublished).some(
      (filePath) => !currentlyPublished.has(filePath),
    )

    publication = await beginPublication(
      buildData.outputRoot,
      !(hasUnpublishedFile || buildData.needsFullEmit),
    )
    argv.output = publication.directory

    // A full rebuild is deliberately used here instead of trying to teach every
    // emitter how to remove every derived artifact (HTML, OG image, aliases,
    // index entries, tags, and so on). This is rare, correct for all filters,
    // and guarantees an unpublished page is no longer served by a static host.
    if (hasUnpublishedFile || buildData.needsFullEmit) {
      buildData.needsFullEmit = true
      console.log("A published file was deleted or filtered out; rebuilding a complete output...")
      if (!(await emitContent(ctx, processedFiles))) throw new Error("Full rebuild emission failed")
      await publication.commit()
      await publishContentSnapshot(processedFiles, cfg.configuration)
      await publishBuildSnapshot(processedFiles, cfg.configuration)
      await notifyBuildPublished()
      buildData.needsFullEmit = false

      console.log(styleText("green", `Done rebuilding in ${perf.timeSince()}`))
      changes.splice(0, numChangesInBuild)
      for (const file of Object.keys(changesSinceLastBuild))
        delete changesSinceLastBuild[file as FilePath]
      clientRefresh()
      return
    }

    let emittedFiles = 0
    const discovery = discoveryContent(ctx, processedFiles)
    for (const emitter of cfg.plugins.emitters) {
      // Try to use partialEmit if available, otherwise assume the output is static
      const emitFn = emitter.partialEmit ?? emitter.emit
      const emitted = await emitFn(
        ctx,
        emitter.discoveryOnly ? discovery : processedFiles,
        staticResources,
        changeEvents,
      )
      if (emitted === null) {
        continue
      }

      if (Symbol.asyncIterator in emitted) {
        // Async generator case
        for await (const file of emitted) {
          emittedFiles++
          if (ctx.argv.verbose) {
            console.log(`[emit:${emitter.name}] ${file}`)
          }
        }
      } else {
        // Array case
        emittedFiles += emitted.length
        if (ctx.argv.verbose) {
          for (const file of emitted) {
            console.log(`[emit:${emitter.name}] ${file}`)
          }
        }
      }
    }

    console.log(
      `Emitted ${emittedFiles} files to \`${argv.output}\` in ${perf.timeSince("rebuild")}`,
    )
    await publication.commit()
    await publishContentSnapshot(processedFiles, cfg.configuration)
    await publishBuildSnapshot(processedFiles, cfg.configuration)
    await notifyBuildPublished()
    console.log(styleText("green", `Done rebuilding in ${perf.timeSince()}`))
    changes.splice(0, numChangesInBuild)
    for (const file of Object.keys(changesSinceLastBuild))
      delete changesSinceLastBuild[file as FilePath]
    clientRefresh()
  } catch (error) {
    buildData.needsFullEmit = true
    throw error
  } finally {
    argv.output = buildData.outputRoot
    try {
      await publication?.discard()
    } finally {
      release()
    }
  }
}

export default async (argv: Argv, mut: Mutex, clientRefresh: () => void) => {
  try {
    return await buildQuartz(argv, mut, clientRefresh)
  } catch (err) {
    trace("\nQuartz build failed", err as Error, false)
    throw err
  }
}
