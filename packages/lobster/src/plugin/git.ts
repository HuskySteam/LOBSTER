import path from "path"
import { Global } from "@/global"
import { Log } from "../util/log"
import { Filesystem } from "@/util/filesystem"

export namespace GitPlugin {
  const log = Log.create({ service: "git-plugin" })

  const CACHE_DIR = "cc-plugins"

  function cacheRoot() {
    return path.join(Global.Path.cache, CACHE_DIR)
  }

  /**
   * Parse a plugin specifier into its components.
   *
   * Supported formats:
   *   "github:user/repo"
   *   "github:user/repo/path/to/plugin"
   *   "https://github.com/user/repo.git"
   *   "https://github.com/user/repo"
   */
  function validateSegment(segment: string, spec: string) {
    if (!segment || segment === "." || segment === ".." || segment.includes("\\")) {
      throw new Error(`Invalid path segment in plugin spec: ${spec}`)
    }
  }

  export function parse(spec: string): {
    url: string
    slug: string
    subpath?: string
  } {
    if (spec.startsWith("github:")) {
      const rest = spec.slice("github:".length)
      const parts = rest.split("/")
      const user = parts[0]
      const repo = parts[1]
      if (!user || !repo) throw new Error(`Invalid github: spec: ${spec}`)
      validateSegment(user, spec)
      validateSegment(repo, spec)
      const subpath = parts.length > 2 ? parts.slice(2).join("/") : undefined
      if (subpath) {
        for (const seg of parts.slice(2)) validateSegment(seg, spec)
      }
      return {
        url: `https://github.com/${user}/${repo}.git`,
        slug: `${user}-${repo}`,
        subpath,
      }
    }

    if (spec.startsWith("https://")) {
      const url = new URL(spec)
      const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/")
      const user = parts[0]
      const repo = parts[1]
      if (!user || !repo) throw new Error(`Invalid URL spec: ${spec}`)
      validateSegment(user, spec)
      validateSegment(repo, spec)
      const subpath = parts.length > 2 ? parts.slice(2).join("/") : undefined
      if (subpath) {
        for (const seg of parts.slice(2)) validateSegment(seg, spec)
      }
      return {
        url: spec.endsWith(".git") ? spec : spec + ".git",
        slug: `${user}-${repo}`,
        subpath,
      }
    }

    throw new Error(`Unsupported plugin spec format: ${spec}`)
  }

  /**
   * Clone or update a Git repo, return the absolute path to the plugin directory.
   */
  export async function install(spec: string): Promise<string> {
    const { url, slug, subpath } = parse(spec)
    const root = cacheRoot()
    await Bun.$`mkdir -p ${root}`.quiet()

    const repoDir = path.join(root, slug)
    const exists = await Filesystem.isDir(repoDir)

    if (exists) {
      log.info("updating cached plugin", { spec, dir: repoDir })
      try {
        await Bun.$`git -C ${repoDir} pull --ff-only`.quiet()
      } catch (e) {
        log.warn("git pull failed, continuing with cached version", { spec, error: e })
      }
    } else {
      log.info("cloning plugin", { spec, url, dir: repoDir })
      await Bun.$`git clone --depth 1 ${url} ${repoDir}`.quiet()
    }

    const pluginDir = subpath ? path.resolve(repoDir, subpath) : repoDir

    // Prevent path traversal — pluginDir must stay inside repoDir
    if (!Filesystem.contains(repoDir, pluginDir)) {
      throw new Error(`Plugin subpath escapes repository: ${subpath}`)
    }

    if (!(await Filesystem.isDir(pluginDir))) {
      throw new Error(`Plugin subpath not found after clone: ${pluginDir}`)
    }

    return pluginDir
  }

  /**
   * Check if a spec is a Git-based plugin specifier.
   */
  export function isGitSpec(spec: string): boolean {
    return spec.startsWith("github:") || spec.startsWith("https://github.com/")
  }
}
