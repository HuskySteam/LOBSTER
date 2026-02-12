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
   * Run setup.sh if it exists and hasn't been run yet for this plugin directory.
   * Creates a .setup-done marker to avoid re-running.
   */
  async function runSetupIfNeeded(dir: string, pluginName: string): Promise<void> {
    const setupPath = path.join(dir, "setup.sh")
    if (!(await Filesystem.exists(setupPath))) return
    if (!(await validateSymlink(setupPath, dir))) {
      log.warn("setup.sh symlink points outside plugin directory, skipping", { path: setupPath, dir })
      return
    }

    const markerPath = path.join(dir, ".claude-plugin", ".setup-done")
    if (await Filesystem.exists(markerPath)) return

    log.info("running setup.sh for CC plugin", { name: pluginName, path: setupPath })
    try {
      const proc = Bun.spawn(["sh", setupPath], {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...filterEnv(process.env),
          CLAUDE_PLUGIN_ROOT: dir,
        },
      })

      const setupTimeout = setTimeout(() => proc.kill(), 60_000) // 60s for setup
      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ])
        clearTimeout(setupTimeout)

        if (exitCode !== 0) {
          log.warn("setup.sh failed", { name: pluginName, exitCode, stderr: stderr.slice(0, 500) })
        } else {
          log.info("setup.sh completed", { name: pluginName, stdout: stdout.slice(0, 200) })
          // Mark setup as done
          await Bun.write(markerPath, new Date().toISOString())
        }
      } catch (e) {
        clearTimeout(setupTimeout)
        throw e
      }
    } catch (e) {
      log.warn("setup.sh execution error", { name: pluginName, error: e })
    }
  }

  /**
   * Load a Claude Code plugin directory and return LOBSTER Hooks.
   */
  export async function load(dir: string, _input: PluginInput): Promise<Hooks> {
    const manifest = await loadManifest(dir)
    const pluginName = manifest.name || path.basename(dir)
    log.info("loading claude code plugin", { name: pluginName, dir })

    // Run setup.sh on first load if it exists
    await runSetupIfNeeded(dir, pluginName)

    const hooks: Hooks = {}

    // 1. Load skills from skills/**/SKILL.md — register as LOBSTER tools (skills provide guidance)
    const tools: Record<string, ToolDefinition> = {}
    await loadSkills(dir, pluginName, tools)

    if (Object.keys(tools).length > 0) {
      hooks.tool = tools
    }

    // 2. Load commands from commands/**/*.md — register as LOBSTER slash commands via config hook
    const commands = await loadCommands(dir, pluginName)

    // 3. Load agents from agents/**/*.md — register as real Lobster agents via config hook
    const agents = await loadAgents(dir)
    if (agents.length > 0 || commands.length > 0) {
      const prevConfig = hooks.config
      hooks.config = async (config) => {
        if (prevConfig) await prevConfig(config)

        // Register CC agents as LOBSTER agents
        if (agents.length > 0) {
          const agentConfig = (config as any).agent ?? {}
          for (const agent of agents) {
            const sanitized = agent.name.replace(/[^a-zA-Z0-9_-]/g, "_")
            if (agentConfig[sanitized]) continue // don't override existing
            const entry: Record<string, any> = {
              name: agent.name,
              description: agent.description || `Agent from ${pluginName}`,
              prompt: agent.prompt,
              mode: "all",
            }
            if (agent.model) entry.model = agent.model
            if (agent.color) entry.color = agent.color
            if (agent.permission) entry.permission = agent.permission
            agentConfig[sanitized] = entry
            log.info("registered CC agent", { name: sanitized, plugin: pluginName })
          }
          ;(config as any).agent = agentConfig
        }

        // Register CC commands as LOBSTER slash commands
        // LOBSTER's command system handles $ARGUMENTS, !`shell` execution, and permissions
        if (commands.length > 0) {
          const cmdConfig = (config as any).command ?? {}
          for (const cmd of commands) {
            if (cmdConfig[cmd.name]) continue // don't override existing
            cmdConfig[cmd.name] = {
              template: cmd.template,
              description: cmd.description || `Command from ${pluginName}`,
              agent: cmd.agent,
              subtask: cmd.subtask,
            }
            log.info("registered CC command", { name: cmd.name, plugin: pluginName })
          }
          ;(config as any).command = cmdConfig
        }
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
      const prevConfigMcp = hooks.config
      hooks.config = async (config) => {
        // Chain with previous config hook (e.g. agent registration)
        if (prevConfigMcp) await prevConfigMcp(config)
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

  // Timeout for plugin shell commands (30 seconds)
  const SHELL_TIMEOUT_MS = 30_000

  /**
   * Execute shell commands found in CC skill markdown content (```! blocks and !`inline` syntax).
   * Only substitutes $CLAUDE_PLUGIN_ROOT; $ARGUMENTS is passed via environment variable
   * to prevent command injection.
   */
  async function executeMarkdownShellBlocks(
    content: string,
    pluginDir: string,
    args: string,
  ): Promise<{ output: string; shellResults: string[] }> {
    const shellResults: string[] = []

    // Process fenced code blocks: ```! or ```bash ! or ```sh !
    // These are executable shell blocks in CC plugin markdown
    const fencedBlockRegex = /```(?:bash|sh)?\s*!\s*\n([\s\S]*?)```/g
    let processedContent = content
    const fencedMatches = Array.from(content.matchAll(fencedBlockRegex))

    for (const match of fencedMatches) {
      // Only substitute CLAUDE_PLUGIN_ROOT in the command text.
      // $ARGUMENTS is left for the shell to expand from the environment variable,
      // preventing command injection from untrusted args.
      const shellCmd = match[1]
        .trim()
        .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginDir)
        .replace(/\$CLAUDE_PLUGIN_ROOT/g, pluginDir)

      try {
        const result = await executeShellCommand(shellCmd, pluginDir, args)
        shellResults.push(result)
        processedContent = processedContent.replace(match[0], `\`\`\`\n${result}\n\`\`\``)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        shellResults.push(`Error: ${errMsg}`)
        processedContent = processedContent.replace(match[0], `\`\`\`\nError executing command: ${errMsg}\n\`\`\``)
      }
    }

    // Process inline shell: !`command`
    const inlineMatches = Array.from(processedContent.matchAll(ConfigMarkdown.SHELL_REGEX))
    for (const match of inlineMatches) {
      const shellCmd = match[1]
        .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginDir)
        .replace(/\$CLAUDE_PLUGIN_ROOT/g, pluginDir)

      try {
        const result = await executeShellCommand(shellCmd, pluginDir, args)
        shellResults.push(result)
        processedContent = processedContent.replace(match[0], result)
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        shellResults.push(`Error: ${errMsg}`)
        processedContent = processedContent.replace(match[0], `Error: ${errMsg}`)
      }
    }

    return { output: processedContent, shellResults }
  }

  /**
   * Execute a single shell command string in the plugin directory context.
   * $ARGUMENTS is passed as an environment variable (not inlined) to prevent injection.
   */
  async function executeShellCommand(cmd: string, pluginDir: string, args: string): Promise<string> {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      cwd: pluginDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...filterEnv(process.env),
        CLAUDE_PLUGIN_ROOT: pluginDir,
        ARGUMENTS: args,
      },
    })

    const timeout = setTimeout(() => proc.kill(), SHELL_TIMEOUT_MS)
    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      clearTimeout(timeout)

      if (exitCode !== 0 && stderr.trim()) {
        throw new Error(`Exit code ${exitCode}: ${stderr.trim()}`)
      }

      return stdout.trim()
    } catch (e) {
      clearTimeout(timeout)
      throw e
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
        const rawContent = md.content.trim()
        const hasShellBlocks =
          /!`[^`]+`/.test(rawContent) || /```(?:bash|sh)?\s*!\s*\n/.test(rawContent)

        tools[toolName] = tool({
          description: description || `Skill from ${pluginName}: ${name}`,
          args: {
            args: z.string().describe("Arguments to pass to the skill").optional(),
          },
          async execute(toolArgs, _ctx) {
            let content = rawContent
              .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, dir)
              .replace(/\$CLAUDE_PLUGIN_ROOT/g, dir)

            // If the skill has executable shell blocks, run them
            if (hasShellBlocks) {
              const result = await executeMarkdownShellBlocks(rawContent, dir, toolArgs.args ?? "")
              content = result.output
            }

            return [
              `<skill_content name="${toolName}">`,
              `# Skill: ${name} (from ${pluginName})`,
              "",
              content,
              "",
              `Plugin directory: ${dir}`,
              `</skill_content>`,
            ].join("\n")
          },
        })

        log.info("loaded CC skill", { plugin: pluginName, skill: name, hasShellBlocks })
      } catch (e) {
        log.warn("failed to load CC skill", { path: match, error: e })
      }
    }
  }

  interface CCCommand {
    name: string
    description: string
    template: string
    agent?: string
    subtask?: boolean
  }

  /**
   * Load CC commands and return them as LOBSTER command configs.
   * Commands are registered as slash commands via config hook, not as tools.
   * LOBSTER's command system handles $ARGUMENTS, !`shell` execution, and permissions natively.
   */
  async function loadCommands(
    dir: string,
    pluginName: string,
  ): Promise<CCCommand[]> {
    const commands: CCCommand[] = []
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
      return commands
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

        // Substitute $CLAUDE_PLUGIN_ROOT in the template so LOBSTER's command
        // system can execute !`shell` blocks with resolved paths
        const template = md.content
          .trim()
          .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, dir)
          .replace(/\$CLAUDE_PLUGIN_ROOT/g, dir)

        commands.push({
          name: cmdName,
          description: description || `Command from ${pluginName}: ${cmdName}`,
          template,
        })

        log.info("loaded CC command", { plugin: pluginName, command: cmdName })
      } catch (e) {
        log.warn("failed to load CC command", { path: match, error: e })
      }
    }

    return commands
  }

  interface CCAgent {
    name: string
    description: string
    prompt: string
    model?: string
    color?: string
    permission?: Record<string, string>
  }

  // Map CC tool names (case-insensitive) to LOBSTER permission names
  const CC_TOOL_MAP: Record<string, string> = {
    glob: "glob",
    grep: "grep",
    ls: "list",
    read: "read",
    write: "write",
    edit: "edit",
    multiedit: "multiedit",
    bash: "bash",
    bashoutput: "bash",
    notebookread: "notebookread",
    notebookedit: "notebookedit",
    webfetch: "webfetch",
    websearch: "websearch",
    todowrite: "todowrite",
    todoread: "todoread",
    task: "task",
    sendmessage: "sendmessage",
    taskcreate: "taskcreate",
    taskupdate: "taskupdate",
    taskget: "taskget",
    tasklist: "tasklist",
    killshell: "killshell",
    codesearch: "codesearch",
  }

  /**
   * Convert CC agent's tools list to LOBSTER permission config.
   * CC agents list allowed tools explicitly; we deny everything else.
   */
  function toolsToPermission(tools: string[]): Record<string, string> {
    if (tools.length === 0) return {}
    const permission: Record<string, string> = { "*": "deny" }
    for (const rawTool of tools) {
      const key = rawTool.toLowerCase().replace(/[^a-z]/g, "")
      const mapped = CC_TOOL_MAP[key]
      if (mapped) {
        permission[mapped] = "allow"
      } else {
        // Pass through unknown tools directly
        permission[key] = "allow"
      }
    }
    // Always allow read for agents that need context
    if (!permission.read) permission.read = "allow"
    return permission
  }

  async function loadAgents(
    dir: string,
  ): Promise<CCAgent[]> {
    const agents: CCAgent[] = []
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
        const model = md.data?.model as string | undefined
        const color = md.data?.color as string | undefined
        const rawTools = md.data?.tools as string[] | string | undefined

        // Parse tools list — can be array or comma-separated string
        const toolsList = Array.isArray(rawTools)
          ? rawTools
          : typeof rawTools === "string"
            ? rawTools.split(",").map((t) => t.trim())
            : []

        const agent: CCAgent = {
          name,
          description,
          prompt: md.content.trim(),
        }
        if (model) agent.model = model
        if (color) agent.color = color
        if (toolsList.length > 0) agent.permission = toolsToPermission(toolsList)

        agents.push(agent)
        log.info("loaded CC agent", { name, model, color, tools: toolsList.length })
      } catch (e) {
        log.warn("failed to load CC agent", { path: match, error: e })
      }
    }

    return agents
  }

  // --- hooks.json schema ---
  // Real CC hooks.json has two formats:
  // Legacy/simple:  { "Stop": [{ "command": "...", "matcher": "..." }] }
  // Nested (real):  { "description": "...", "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "..." }] }] } }

  const CCHookEntrySchema = z.object({
    matcher: z.string().optional(),
    command: z.string(),
  })

  // Nested format: each event has an array of hook groups, each with a "hooks" array
  const CCNestedHookItemSchema = z.object({
    type: z.string().optional(),
    command: z.string(),
  })

  const CCNestedHookGroupSchema = z.object({
    matcher: z.string().optional(),
    hooks: z.array(CCNestedHookItemSchema),
  })

  const CCNestedHooksConfigSchema = z.object({
    description: z.string().optional(),
    hooks: z.object({
      PreToolUse: z.array(CCNestedHookGroupSchema).optional(),
      PostToolUse: z.array(CCNestedHookGroupSchema).optional(),
      SessionStart: z.array(CCNestedHookGroupSchema).optional(),
      UserPromptSubmit: z.array(CCNestedHookGroupSchema).optional(),
      Stop: z.array(CCNestedHookGroupSchema).optional(),
    }),
  })

  const CCFlatHooksConfigSchema = z.object({
    PreToolUse: z.array(CCHookEntrySchema).optional(),
    PostToolUse: z.array(CCHookEntrySchema).optional(),
    SessionStart: z.array(CCHookEntrySchema).optional(),
    UserPromptSubmit: z.array(CCHookEntrySchema).optional(),
    Stop: z.array(CCHookEntrySchema).optional(),
  })

  /**
   * Normalize nested CC hooks format into flat format that LOBSTER understands.
   */
  function normalizeHooksConfig(raw: any): CCHooksConfig | null {
    // Try nested format first (the real CC format)
    const nested = CCNestedHooksConfigSchema.safeParse(raw)
    if (nested.success) {
      const result: CCHooksConfig = {}
      const events = nested.data.hooks
      for (const [eventName, groups] of Object.entries(events)) {
        if (!groups || groups.length === 0) continue
        const entries: CCHookEntry[] = []
        for (const group of groups) {
          for (const hook of group.hooks) {
            if (hook.type && hook.type !== "command") continue // only support command hooks
            entries.push({
              matcher: group.matcher,
              command: hook.command,
            })
          }
        }
        if (entries.length > 0) {
          ;(result as any)[eventName] = entries
        }
      }
      return result
    }

    // Try flat format (legacy/simple)
    const flat = CCFlatHooksConfigSchema.safeParse(raw)
    if (flat.success) return flat.data

    return null
  }

  async function loadShellHooks(dir: string): Promise<CCHooksConfig | null> {
    const hooksPath = path.join(dir, "hooks", "hooks.json")
    if (!(await Filesystem.exists(hooksPath))) return null
    if (!(await validateSymlink(hooksPath, dir))) {
      log.warn("hooks.json symlink points outside plugin directory, skipping", { path: hooksPath, dir })
      return null
    }

    try {
      const text = await Bun.file(hooksPath).text()
      const raw = JSON.parse(text)
      const result = normalizeHooksConfig(raw)
      if (!result) {
        log.warn("invalid hooks.json schema", { path: hooksPath })
        return null
      }
      // Substitute $CLAUDE_PLUGIN_ROOT in all commands
      for (const entries of Object.values(result)) {
        if (!Array.isArray(entries)) continue
        for (const entry of entries) {
          entry.command = entry.command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, dir)
        }
      }
      return result
    } catch (e) {
      log.warn("failed to parse hooks.json", { path: hooksPath, error: e })
      return null
    }
  }

  async function loadMcpConfig(dir: string): Promise<Record<string, CCMcpServer> | null> {
    const mcpPath = path.join(dir, ".mcp.json")
    if (!(await Filesystem.exists(mcpPath))) return null
    if (!(await validateSymlink(mcpPath, dir))) {
      log.warn(".mcp.json symlink points outside plugin directory, skipping", { path: mcpPath, dir })
      return null
    }

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

    const timeout = setTimeout(() => proc.kill(), SHELL_TIMEOUT_MS)
    try {
      // Consume both streams in parallel to avoid deadlocks
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      clearTimeout(timeout)

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
    } catch (e) {
      clearTimeout(timeout)
      throw e
    }
  }
}
