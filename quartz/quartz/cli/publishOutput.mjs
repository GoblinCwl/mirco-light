import { constants } from "node:fs"
import { cp, mkdir, readlink, readdir, rename, rm, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { randomUUID } from "node:crypto"

export const atomicPublicationEnabled = () => process.env.QUARTZ_ATOMIC_PUBLISH === "1"
export const publishedOutput = (root) => (atomicPublicationEnabled() ? join(root, "current") : root)

// The mount itself stays in place. Only the relative symlink inside it is replaced.
export async function beginPublication(root, inheritCurrent = false) {
  if (!atomicPublicationEnabled()) {
    await mkdir(root, { recursive: true })
    if (!inheritCurrent) {
      for (const file of await readdir(root))
        await rm(join(root, file), { recursive: true, force: true })
    }
    return { directory: root, commit: async () => {}, discard: async () => {} }
  }

  root = resolve(root)
  const releases = join(root, ".releases")
  await mkdir(releases, { recursive: true })
  const name = `build-${randomUUID()}`
  const directory = join(releases, name)
  const current = join(root, "current")
  const temporary = join(root, `.current-${randomUUID()}`)
  let committed = false
  try {
    if (inheritCurrent) {
      // Never hardlink: emitters overwrite files and would also change the live site.
      await cp(await resolveCurrent(current), directory, {
        recursive: true,
        mode: constants.COPYFILE_FICLONE,
      })
    } else {
      await mkdir(directory)
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }

  return {
    directory,
    async commit() {
      let previous
      try {
        previous = await readlink(current)
      } catch (error) {
        if (error.code !== "ENOENT") throw error
      }
      await symlink(`.releases/${name}`, temporary)
      await rename(temporary, current)
      committed = true
      // Retain the previous complete release for rollback and in-flight reads.
      // Cleanup failure must not turn an already published build into a failure.
      try {
        for (const entry of await readdir(releases)) {
          if (
            /^build-[0-9a-f-]{36}$/.test(entry) &&
            entry !== name &&
            `.releases/${entry}` !== previous
          ) {
            await rm(join(releases, entry), { recursive: true, force: true })
          }
        }
      } catch (error) {
        console.warn("Previous build cleanup failed:", error.message)
      }
    },
    async discard() {
      await rm(temporary, { force: true })
      if (!committed) await rm(directory, { recursive: true, force: true })
    },
  }
}

async function resolveCurrent(current) {
  const target = await readlink(current)
  return resolve(current, "..", target)
}
