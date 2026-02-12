import fs from "fs/promises"
import path from "path"
import z from "zod"
import { tool, type ToolDefinition } from "@lobster-ai/plugin"
import type { Hooks, PluginInput } from "@lobster-ai/plugin"
import { ConfigMarkdown } from "../config/markdown"
import { Log } from "../util/log"
import { Filesystem } from "@/util/filesystem"
import { filterEnv } from "../tool/bash"

export namespace ClaudeCompat {
  const log = Log.create({ service: "claude-compat" })

  // --- Claude Code plugin manifest ---

  export interface CCPluginManifest {
    name: string
    version?: string
    description?: string
    author?: { name: string }
  }

  // --- CC hooks.json types ---

  interface CCHookEntry {
    matcher?: string
    command: string
  }

  interface CCHooksConfig {
    PreToolUse?: CCHookEntry[]
    PostToolUse?: CCHookEntry[]
    SessionStart?: CCHookEntry[]
    UserPromptSubmit?: CCHookEntry[]
    Stop?: CCHookEntry[]
  }

  // --- CC .mcp.json types ---

  interface CCMcpServer {
    command: string
    args?: string[]
    env?: Record<string, string>
  }

  interface CCMcpConfig {
    mcpServers?: Record<string, CCMcpServer>
  }

  // --- Glob patterns ---

  const SKILL_GLOB = new Bun.Glob("skills/**/SKILL.md")
  const COMMAND_GLOB = new Bun.Glob("commands/**/*.md")
  const AGENT_GLOB = new Bun.Glob("agents/**/*.md")

  // Max regex length to prevent ReDoS from untrusted matcher patterns
  const MAX_MATCHER_LENGTH = 200

  // Dangerous shell metacharacters that could enable command injection
  const DANGEROUS_METACHARACTERS = /[;|&`$(){}!<>]/

  /**
   * Parse a hook command string into an argv array.
   * Rejects commands containing dangerous shell metacharacters.
   */
  function parseCommand(command: string): string[] {
    const trimmed = command.trim()
    if (!trimmed) throw new Error("Empty hook command")
    if (DANGEROUS_METACHARACTERS.test(trimmed)) {
      throw new Error(`Hook command contains dangerous shell metacharacters: ${trimmed}`)
    }
    // Split on whitespace, respecting simple quoting
    const args: string[] = []
    let current = ""
    let inQuote: string | null = null
    for (const ch of trimmed) {
      if (inQuote) {
        if (ch === inQuote) {
          inQuote = null
        } else {
          current += ch
        }
      } else if (ch === '"' || ch === "'") {
        inQuote = ch
      } else if (ch === " " || ch === "\t") {
        if (current) {
          args.push(current)
          current = ""
        }
      } else {
        current += ch
      }
    }
    if (current) args.push(current)
    if (args.length === 0) throw new Error("Empty hook command after parsing")
    return args
  }

  /**
   * Resolve a file path through symlinks and validate it stays within the plugin directory.
   */
  async function validateSymlink(filePath: string, pluginDir: string): Promise<boolean> {
    try {
      const resolved = await fs.realpath(filePath)
      return Filesystem.contains(pluginDir, resolved)
    } catch {
      return false
    }
  }

  /**
   * Safely compile and test a regex matcher from untrusted plugin hooks.
   * Returns false if the pattern is invalid or too long.
   */
  function matchesPattern(pattern: string, input: string): boolean {
    if (pattern.length > MAX_MATCHER_LENGTH) return false
    try {
      return new RegExp(pattern).test(input)
    } catch {
      return false
    }
  }

  /**
   * Detect if a directory is a Claude Code plugin.
   */
  export async function detect(dir: string): Promise<boolean> {
    return Filesystem.exists(path.join(dir, ".claude-plugin", "plugin.json"))
  }

  /**
   * Load a Claude Code plugin directory and return LOBSTER Hooks.
   */
  export async function load(dir: string, _input: PluginInput): Promise<Hooks> {
    const manifest = await loadManifest(dir)
    const pluginName = manifest.name || path.basename(dir)
    log.info("loading claude code plugin", { name: pluginName, dir })

    const hooks: Hooks = {}
    const tools: Record<string, ToolDefinition> = {}

    // 1. Load skills from skills/**/SKILL.md
    await loadSkills(dir, pluginName, tools)

    // 2. Load commands from commands/**/*.md
    await loadCommands(dir, pluginName, tools)

    if (Object.keys(tools).length > 0) {
      hooks.tool = tools
    }

    // 3. Load agents from agents/**/*.md — register as real Lobster agents via config hook
    const agents = await loadAgents(dir)
    if (agents.length > 0) {
      const prevConfig = hooks.config
      hooks.config = async (config) => {
        if (prevConfig) await prevConfig(config)
        const agentConfig = (config as any).agent ?? {}
        for (const agent of agents) {
          const sanitized = agent.name.replace(/[^a-zA-Z0-9_-]/g, "_")
          if (agentConfig[sanitized]) continue // don't override existing
          agentConfig[sanitized] = {
            name: agent.name,
            description: agent.description || `Agent from ${pluginName}`,
            prompt: agent.prompt,
            mode: "all",
          }
          log.info("registered CC agent", { name: sanitized, plugin: pluginName })
        }
        ;(config as any).agent = agentConfig
      }
    }

    // 4. Load hooks from hooks/hooks.json
    const shellHooks = await loadShellHooks(dir)
    if (shellHooks) {
      if (shellHooks.PreToolUse && shellHooks.PreToolUse.length > 0) {
        hooks["tool.execute.before"] = async (input, output) => {
          for (const hook of shellHooks.PreToolUse!) {
            if (hook.matcher && !matchesPattern(hook.matcher, input.tool)) continue
            try {
              const result = await executeShellHook(hook.command, dir, {
                tool_name: input.tool,
                tool_input: output.args,
              })
              if (result && typeof result === "object") {
                if ("tool_input" in result) output.args = result.tool_input
                if ("args" in result) output.args = result.args
              }
            } catch (e) {
              log.warn("PreToolUse shell hook failed", { command: hook.command, error: e })
            }
          }
        }
      }

      if (shellHooks.PostToolUse && shellHooks.PostToolUse.length > 0) {
        hooks["tool.execute.after"] = async (input, output) => {
          for (const hook of shellHooks.PostToolUse!) {
            if (hook.matcher && !matchesPattern(hook.matcher, input.tool)) continue
            try {
              await executeShellHook(hook.command, dir, {
                tool_name: input.tool,
                tool_output: output.output,
              })
            } catch (e) {
              log.warn("PostToolUse shell hook failed", { command: hook.command, error: e })
            }
          }
        }
      }

      if (shellHooks.UserPromptSubmit && shellHooks.UserPromptSubmit.length > 0) {
        hooks["chat.message"] = async (_input, output) => {
          for (const hook of shellHooks.UserPromptSubmit!) {
            try {
              await executeShellHook(hook.command, dir, {
                message: output.message,
              })
            } catch (e) {
              log.warn("UserPromptSubmit shell hook failed", { command: hook.command, error: e })
            }
          }
        }
      }

      if (shellHooks.SessionStart && shellHooks.SessionStart.length > 0) {
        hooks["session.start"] = async (input) => {
          for (const hook of shellHooks.SessionStart!) {
            try {
              await executeShellHook(hook.command, dir, {
                session_id: input.sessionID,
              })
            } catch (e) {
              log.warn("SessionStart shell hook failed", { command: hook.command, error: e })
            }
          }
        }
      }

      if (shellHooks.Stop && shellHooks.Stop.length > 0) {
        hooks["session.stop"] = async (input) => {
          for (const hook of shellHooks.Stop!) {
            try {
              await executeShellHook(hook.command, dir, {
                session_id: input.sessionID,
              })
            } catch (e) {
              log.warn("Stop shell hook failed", { command: hook.command, error: e })
            }
          }
        }
      }
    }

    // 5. Load MCP config from .mcp.json
    const mcpConfig = await loadMcpConfig(dir)
    if (mcpConfig) {
      hooks.config = async (config) => {
        // Merge MCP servers into LOBSTER config
        if (!config.mcp) (config as any).mcp = {}
        const mcp = (config as any).mcp as Record<string, any>
        for (const [name, server] of Object.entries(mcpConfig)) {
          if (mcp[name]) continue // don't override existing
          // Filter env vars through the same blocklist used for bash tool
          const rawEnv = Object.fromEntries(
            Object.entries(server.env ?? {}).map(([k, v]) => [
              k,
              v.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, dir),
            ]),
          )
          const sanitizedEnv = filterEnv(rawEnv as NodeJS.ProcessEnv)
          mcp[name] = {
            type: "local" as const,
            command: [server.command, ...(server.args ?? [])].map((s) =>
              s.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, dir),
            ),
            environment: sanitizedEnv,
          }
        }
      }
    }

    return hooks
  }

  // --- Internal helpers ---

  const ManifestSchema = z.object({
    name: z.string(),
    version: z.string().optional(),
    description: z.string().optional(),
    author: z.object({ name: z.string() }).optional(),
  })

  async function loadManifest(dir: string): Promise<CCPluginManifest> {
    const manifestPath = path.join(dir, ".claude-plugin", "plugin.json")
    try {
      const text = await Bun.file(manifestPath).text()
      const parsed = ManifestSchema.safeParse(JSON.parse(text))
      if (parsed.success) return parsed.data
      log.warn("invalid plugin manifest, using defaults", { path: manifestPath })
      return { name: path.basename(dir) }
    } catch {
      return { name: path.basename(dir) }
    }
  }

  async function loadSkills(
    dir: string,
    pluginName: string,
    tools: Record<string, ToolDefinition>,
  ) {
    const matches: string[] = []
    try {
      for await (const match of SKILL_GLOB.scan({
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        followSymlinks: true,
        dot: true,
      })) {
        matches.push(match)
      }
    } catch {
      return
    }

    for (const match of matches) {
      try {
        if (!(await validateSymlink(match, dir))) {
          log.warn("skill symlink points outside plugin directory, skipping", { path: match, dir })
          continue
        }
        const md = await ConfigMarkdown.parse(match)
        const name = md.data?.name as string | undefined
        const description = md.data?.description as string | undefined
        if (!name) continue

        const sanitizedPlugin = pluginName.replace(/[^a-zA-Z0-9_-]/g, "_")
        const sanitizedSkill = name.replace(/[^a-zA-Z0-9_-]/g, "_")
        const toolName = `${sanitizedPlugin}_${sanitizedSkill}`
        tools[toolName] = tool({
          description: description || `Skill from ${pluginName}: ${name}`,
          args: {},
          async execute(_args, _ctx) {
            return [
              `<skill_content name="${toolName}">`,
              `# Skill: ${name} (from ${pluginName})`,
              "",
              md.content.trim(),
              "",
              `Plugin directory: ${dir}`,
              `</skill_content>`,
            ].join("\n")
          },
        })

        log.info("loaded CC skill", { plugin: pluginName, skill: name })
      } catch (e) {
        log.warn("failed to load CC skill", { path: match, error: e })
      }
    }
  }

  async function loadCommands(
    dir: string,
    pluginName: string,
    tools: Record<string, ToolDefinition>,
  ) {
    const matches: string[] = []
    try {
      for await (const match of COMMAND_GLOB.scan({
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        followSymlinks: true,
        dot: true,
      })) {
        matches.push(match)
      }
    } catch {
      return
    }

    for (const match of matches) {
      try {
        if (!(await validateSymlink(match, dir))) {
          log.warn("command symlink points outside plugin directory, skipping", { path: match, dir })
          continue
        }
        const md = await ConfigMarkdown.parse(match)
        const name = md.data?.name as string | undefined
        const description = md.data?.description as string | undefined
        const cmdName = name || path.basename(match, ".md")

        const sanitizedPlugin = pluginName.replace(/[^a-zA-Z0-9_-]/g, "_")
        const sanitizedCmd = cmdName.replace(/[^a-zA-Z0-9_-]/g, "_")
        const toolName = `${sanitizedPlugin}_${sanitizedCmd}`
        tools[toolName] = tool({
          description: description || `Command from ${pluginName}: ${cmdName}`,
          args: {},
          async execute(_args, _ctx) {
            return [
              `<command_content name="${toolName}">`,
              `# Command: ${cmdName} (from ${pluginName})`,
              "",
              md.content.trim(),
              "",
              `Plugin directory: ${dir}`,
              `</command_content>`,
            ].join("\n")
          },
        })

        log.info("loaded CC command", { plugin: pluginName, command: cmdName })
      } catch (e) {
        log.warn("failed to load CC command", { path: match, error: e })
      }
    }
  }

  async function loadAgents(
    dir: string,
  ): Promise<Array<{ name: string; description: string; prompt: string }>> {
    const agents: Array<{ name: string; description: string; prompt: string }> = []
    const matches: string[] = []

    try {
      for await (const match of AGENT_GLOB.scan({
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        followSymlinks: true,
        dot: true,
      })) {
        matches.push(match)
      }
    } catch {
      return agents
    }

    for (const match of matches) {
      try {
        if (!(await validateSymlink(match, dir))) {
          log.warn("agent symlink points outside plugin directory, skipping", { path: match, dir })
          continue
        }
        const md = await ConfigMarkdown.parse(match)
        const name = (md.data?.name as string) || path.basename(match, ".md")
        const description = (md.data?.description as string) || ""

        agents.push({
          name,
          description,
          prompt: md.content.trim(),
        })

        log.info("loaded CC agent", { name })
      } catch (e) {
        log.warn("failed to load CC agent", { path: match, error: e })
      }
    }

    return agents
  }

  const CCHookEntrySchema = z.object({
    matcher: z.string().optional(),
    command: z.string(),
  })

  const CCHooksConfigSchema = z.object({
    PreToolUse: z.array(CCHookEntrySchema).optional(),
    PostToolUse: z.array(CCHookEntrySchema).optional(),
    SessionStart: z.array(CCHookEntrySchema).optional(),
    UserPromptSubmit: z.array(CCHookEntrySchema).optional(),
    Stop: z.array(CCHookEntrySchema).optional(),
  })

  async function loadShellHooks(dir: string): Promise<CCHooksConfig | null> {
    const hooksPath = path.join(dir, "hooks", "hooks.json")
    if (!(await Filesystem.exists(hooksPath))) return null

    try {
      const text = await Bun.file(hooksPath).text()
      const parsed = CCHooksConfigSchema.safeParse(JSON.parse(text))
      if (!parsed.success) {
        log.warn("invalid hooks.json schema", { path: hooksPath, error: parsed.error.message })
        return null
      }
      return parsed.data
    } catch (e) {
      log.warn("failed to parse hooks.json", { path: hooksPath, error: e })
      return null
    }
  }

  async function loadMcpConfig(dir: string): Promise<Record<string, CCMcpServer> | null> {
    const mcpPath = path.join(dir, ".mcp.json")
    if (!(await Filesystem.exists(mcpPath))) return null

    try {
      const text = await Bun.file(mcpPath).text()
      const config = JSON.parse(text) as CCMcpConfig
      return config.mcpServers ?? null
    } catch (e) {
      log.warn("failed to parse .mcp.json", { path: mcpPath, error: e })
      return null
    }
  }

  async function executeShellHook(
    command: string,
    pluginDir: string,
    input: object,
  ): Promise<any> {
    const argv = parseCommand(command)
    const proc = Bun.spawn(argv, {
      stdin: new Blob([JSON.stringify(input)]),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...filterEnv(process.env),
        CLAUDE_PLUGIN_ROOT: pluginDir,
      },
    })

    // Consume both streams in parallel to avoid deadlocks
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode === 1) {
      return { blocked: true }
    }

    if (exitCode === 2) {
      throw new Error(`Hook command failed: ${stderr}`)
    }

    if (exitCode === 0 && stdout.trim()) {
      try {
        return JSON.parse(stdout)
      } catch {
        return {}
      }
    }

    return {}
  }
}
