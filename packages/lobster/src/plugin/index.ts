import type { Hooks, PluginInput, Plugin as PluginInstance } from "@lobster-ai/plugin"
import path from "path"
import { fileURLToPath } from "url"
import { Config } from "../config/config"
import { Bus } from "../bus"
import { Log } from "../util/log"
import { createLobsterClient } from "@lobster-ai/sdk"
import { Server } from "../server/server"
import { BunProc } from "../bun"
import { Instance } from "../project/instance"
import { Flag } from "../flag/flag"
import { CodexAuthPlugin } from "./codex"
import { Session } from "../session"
import { NamedError } from "@lobster-ai/util/error"
import { CopilotAuthPlugin } from "./copilot"
import { gitlabAuthPlugin as GitlabAuthPlugin } from "@gitlab/opencode-gitlab-auth"
import { ClaudeCompat } from "./claude-compat"
import { GitPlugin } from "./git"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

export namespace Plugin {
  const log = Log.create({ service: "plugin" })

  const BUILTIN = ["opencode-anthropic-auth@0.0.13"]

  // Built-in plugins that are directly imported (not installed from npm)
  const INTERNAL_PLUGINS: PluginInstance[] = [CodexAuthPlugin, CopilotAuthPlugin, GitlabAuthPlugin]

  const state = Instance.state(async () => {
    const client = createLobsterClient({
      baseUrl: "http://lobster.internal",
      // @ts-ignore - fetch type incompatibility
      fetch: async (...args) => Server.App().fetch(...args),
    })
    const config = await Config.get()
    const hooks: Hooks[] = []
    const input: PluginInput = {
      client,
      project: Instance.project,
      worktree: Instance.worktree,
      directory: Instance.directory,
      serverUrl: Server.url(),
      $: Bun.$,
    }

    for (const plugin of INTERNAL_PLUGINS) {
      log.info("loading internal plugin", { name: plugin.name })
      const init = await plugin(input)
      hooks.push(init)
    }

    let plugins = config.plugin ?? []
    if (plugins.length) await Config.waitForDependencies()
    if (!Flag.LOBSTER_DISABLE_DEFAULT_PLUGINS) {
      plugins = [...BUILTIN, ...plugins]
    }

    for (let plugin of plugins) {
      // ignore old codex plugin since it is supported first party now
      if (plugin.includes("opencode-openai-codex-auth") || plugin.includes("opencode-copilot-auth")) continue
      log.info("loading plugin", { path: plugin })

      // Handle github: and https://github.com/ specs — clone and resolve to local path
      if (GitPlugin.isGitSpec(plugin)) {
        try {
          const pluginDir = await GitPlugin.install(plugin)
          if (await ClaudeCompat.detect(pluginDir)) {
            const init = await ClaudeCompat.load(pluginDir, input)
            hooks.push(init)
          } else {
            log.warn("git plugin is not a Claude Code plugin, skipping", { path: pluginDir })
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          log.error("failed to install git plugin", { plugin, error: message })
          Bus.publish(Session.Event.Error, {
            error: new NamedError.Unknown({
              message: `Failed to install git plugin ${plugin}: ${message}`,
            }).toObject(),
          })
        }
        continue
      }

      if (!plugin.startsWith("file://")) {
        const lastAtIndex = plugin.lastIndexOf("@")
        const pkg = lastAtIndex > 0 ? plugin.substring(0, lastAtIndex) : plugin
        const version = lastAtIndex > 0 ? plugin.substring(lastAtIndex + 1) : "latest"
        const builtin = BUILTIN.some((x) => x.startsWith(pkg + "@"))
        plugin = await BunProc.install(pkg, version).catch((err) => {
          if (!builtin) throw err

          const message = err instanceof Error ? err.message : String(err)
          log.error("failed to install builtin plugin", {
            pkg,
            version,
            error: message,
          })
          Bus.publish(Session.Event.Error, {
            error: new NamedError.Unknown({
              message: `Failed to install built-in plugin ${pkg}@${version}: ${message}`,
            }).toObject(),
          })

          return ""
        })
        if (!plugin) continue
      }

      // Check if the resolved path is a Claude Code plugin directory
      const resolvedPath = plugin.startsWith("file://") ? fileURLToPath(new URL(plugin)) : plugin

      // Validate file:// paths resolve within the project or global plugin directory
      if (plugin.startsWith("file://")) {
        const resolved = path.resolve(resolvedPath)
        const inProject = Filesystem.contains(Instance.directory, resolved)
        const inGlobal = Filesystem.contains(Global.Path.cache, resolved)
        const inData = Filesystem.contains(Global.Path.data, resolved)
        if (!inProject && !inGlobal && !inData) {
          log.warn("file:// plugin path outside allowed directories, skipping", {
            path: resolved,
            project: Instance.directory,
          })
          continue
        }
      }

      if (await ClaudeCompat.detect(resolvedPath)) {
        const init = await ClaudeCompat.load(resolvedPath, input)
        hooks.push(init)
        continue
      }

      // Validate plugin paths are within expected directories before dynamic import
      // For file:// URLs, use the already-resolved filesystem path instead of path.resolve
      // which would produce an invalid path from a file:// URL string
      const importPath = plugin.startsWith("file://") ? resolvedPath : path.resolve(plugin)
      const inCache = Filesystem.contains(Global.Path.cache, importPath)
      const inProject = Filesystem.contains(Instance.directory, importPath)
      const inData = Filesystem.contains(Global.Path.data, importPath)
      if (!inCache && !inProject && !inData) {
        log.warn("plugin path outside allowed directories, skipping dynamic import", {
          path: importPath,
        })
        continue
      }
      log.warn("loading plugin via dynamic import", { path: plugin })
      const mod = await import(plugin).catch((err) => {
        log.error("failed to load plugin", { path: plugin, error: err instanceof Error ? err.message : String(err) })
        return undefined
      })
      if (!mod) continue
      // Prevent duplicate initialization when plugins export the same function
      // as both a named export and default export (e.g., `export const X` and `export default X`).
      // Object.entries(mod) would return both entries pointing to the same function reference.
      const seen = new Set<PluginInstance>()
      for (const [_name, fn] of Object.entries<PluginInstance>(mod)) {
        if (seen.has(fn)) continue
        seen.add(fn)
        const init = await fn(input)
        hooks.push(init)
      }
    }

    return {
      hooks,
      input,
    }
  })

  export async function trigger<
    Name extends Exclude<keyof Required<Hooks>, "auth" | "event" | "tool">,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(name: Name, input: Input, output: Output): Promise<Output> {
    if (!name) return output
    for (const hook of await state().then((x) => x.hooks)) {
      const fn = hook[name]
      if (!fn) continue
      try {
        // @ts-expect-error if you feel adventurous, please fix the typing, make sure to bump the try-counter if you
        // give up.
        // try-counter: 2
        await fn(input, output)
      } catch (e) {
        log.warn("plugin trigger failed", { hook: name, error: e })
        continue
      }
    }
    return output
  }

  export async function list() {
    return state().then((x) => x.hooks)
  }

  export async function init() {
    const hooks = await state().then((x) => x.hooks)
    const config = await Config.get()
    for (const hook of hooks) {
      // @ts-expect-error this is because we haven't moved plugin to sdk v2
      await hook.config?.(config)
    }
    Bus.subscribeAll(async (input) => {
      const hooks = await state().then((x) => x.hooks)
      for (const hook of hooks) {
        hook["event"]?.({
          event: input,
        })
      }
    })
  }
}
