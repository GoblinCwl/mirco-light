import { FilePath, joinSegments, slugifyFilePath } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import path from "path"
import fs from "fs"
import { glob } from "../../util/glob"
import { Argv } from "../../util/ctx"
import { QuartzConfig } from "../../cfg"

const filesToCopy = async (argv: Argv, cfg: QuartzConfig) => {
  // glob all non MD files in content folder and copy it over
  return await glob("**", argv.directory, ["**/*.md", ...cfg.configuration.ignorePatterns])
}

const copyFile = async (argv: Argv, fp: FilePath) => {
  const src = joinSegments(argv.directory, fp) as FilePath

  const name = slugifyFilePath(fp)
  const dest = joinSegments(argv.output, name) as FilePath

  // ensure dir exists
  const dir = path.dirname(dest) as FilePath
  await fs.promises.mkdir(dir, { recursive: true })

  // Check if source file exists before attempting to copy
  try {
    await fs.promises.copyFile(src, dest)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Warning: Source file does not exist, skipping copy: ${src}`)
      return null // Return null to indicate the file was skipped
    } else {
      throw e // Re-throw if it's a different error
    }
  }
  return dest
}

export const Assets: QuartzEmitterPlugin = () => {
  return {
    name: "Assets",
    async *emit({ argv, cfg }) {
      const fps = await filesToCopy(argv, cfg)
      for (const fp of fps) {
        const result = await copyFile(argv, fp)
        if (result !== null) {
          yield result
        }
      }
    },
    async *partialEmit(ctx, _content, _resources, changeEvents) {
      for (const changeEvent of changeEvents) {
        const ext = path.extname(changeEvent.path)
        if (ext === ".md") continue

        if (changeEvent.type === "add" || changeEvent.type === "change") {
          const result = await copyFile(ctx.argv, changeEvent.path)
          if (result !== null) {
            yield result
          }
        } else if (changeEvent.type === "delete") {
          const name = slugifyFilePath(changeEvent.path)
          const dest = joinSegments(ctx.argv.output, name) as FilePath
          try {
            await fs.promises.unlink(dest)
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw e // Re-throw if it's a different error
            }
            // If file doesn't exist, that's fine - we were trying to delete it anyway
          }
        }
      }
    },
  }
}