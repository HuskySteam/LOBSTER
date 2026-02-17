/** @jsxImportSource react */
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import path from "path"
import { useTheme } from "../../theme"
import { useAppStore } from "../../store"
import { useSDK } from "../../context/sdk"
import { useArgs } from "../../context/args"
import { useExit } from "../../context/exit"
import { useRoute } from "../../context/route"
import { useLocal } from "../../context/local"
import { useLobster } from "../../context/lobster"
import { useKeybind } from "../../context/keybind"
import { useDialog } from "../../ui/dialog"
import { useToast } from "../../ui/toast"
import { DialogHelp } from "../../ui/dialog-help"
import { DialogModel } from "../dialog-model"
import { DialogAgent } from "../dialog-agent"
import { DialogSessionList } from "../dialog-session-list"
import { DialogSessionRename } from "../dialog-session-rename"
import { DialogCommand } from "../dialog-command"
import { DialogProvider } from "../dialog-provider"
import { DialogKeybinds } from "../dialog-keybinds"
import { DialogStatus } from "../dialog-status"
import { DialogThemeList } from "../dialog-theme-list"
import { DialogMcp } from "../dialog-mcp"
import { DialogPlugin } from "../dialog-plugin"
import { DialogReviewDashboard } from "../dialog-review-dashboard"
import { DialogReviewResults } from "../dialog-review-results"
import { DialogHealth } from "../dialog-health"
import { DialogPatterns } from "../dialog-patterns"
import { Spinner } from "../spinner"
import { Autocomplete, type AutocompleteOption } from "./autocomplete"
import { BUILT_IN_COMMANDS, parseSlashCommand, resolveBuiltInCommand } from "./command-registry"
import { Clipboard } from "@tui/util/clipboard"
import { formatTranscript } from "@tui/util/transcript"
import { Identifier } from "@/id/id"
import type { AssistantMessage, Part, UserMessage } from "@lobster-ai/sdk/v2"

const EMPTY_MSGS: never[] = []

interface PromptProps {
  sessionID?: string
  onSubmit: (input: string, options: { agent: string; model: { providerID: string; modelID: string } }) => void
  showThinking?: boolean
  showTimestamps?: boolean
  onToggleThinking?: () => void
  onToggleTimestamps?: () => void
}

const HEALTH_ANALYSIS_PROMPT = `Analyze this project's quality and call the project_quality tool with your assessment.

Instructions:
1. Use glob to map the directory tree (top-level files and key directories)
2. Read key files: package.json, tsconfig.json, README.md, any CI config (.github/workflows/*, .gitlab-ci.yml), and sample test files
3. Score these 5 categories from 0-100:
   - code_structure: Code organization, patterns, architecture, modularity
   - testing: Test coverage indicators, test quality, testing practices
   - documentation: README quality, inline docs, API documentation
   - dependencies: Dependency health, outdated packages, lock file presence
   - security: Security practices, no hardcoded secrets, input validation patterns
4. Call the project_quality tool with your structured results

Calibration guide:
- 40-59%: Needs significant improvement
- 60-79%: Well-maintained, typical good project
- 80-89%: Excellent, above average
- 90%+: Exceptional, only for truly outstanding projects

Be honest and specific in findings and suggestions.`

function pluginName(spec: string): string {
  if (!spec) return spec
  const normalized = spec.replace(/\\/g, "/").replace(/\.git$/, "")
  const parts = normalized.split("/")
  const last = parts[parts.length - 1] ?? spec
  const at = last.indexOf("@")
  return at > 0 ? last.slice(0, at) : last
}

export function Prompt(props: PromptProps) {
  const { theme } = useTheme()
  const exit = useExit()
  const route = useRoute()
  const { sync } = useSDK()
  const args = useArgs()
  const local = useLocal()
  const lobster = useLobster()
  const dialog = useDialog()
  const { setBlocker } = useKeybind()
  const toast = useToast()

  const [input, setInput] = useState(args.prompt ?? "")
  const [interruptCount, setInterruptCount] = useState(0)
  const isDialogOpen = dialog.content !== null

  const [acMode, setAcMode] = useState<false | "/" | "@">(false)
  const [acIndex, setAcIndex] = useState(0)
  const [acTriggerPos, setAcTriggerPos] = useState(0)
  const [fileResults, setFileResults] = useState<string[]>([])

  const sessionStatus = useAppStore((s) =>
    props.sessionID ? s.session_status[props.sessionID] : undefined,
  )
  const commands = useAppStore((s) => s.command)
  const agents = useAppStore((s) => s.agent)
  const allParts = useAppStore((s) => s.part)
  const sessions = useAppStore((s) => s.session)
  const projectDir = useAppStore((s) => s.path.directory)
  const config = useAppStore((s) => s.config)
  const sessionMessages = useAppStore((s) =>
    props.sessionID ? s.message[props.sessionID] ?? EMPTY_MSGS : EMPTY_MSGS,
  )
  const sessionInfo = useMemo(
    () => sessions.find((x) => x.id === props.sessionID),
    [sessions, props.sessionID],
  )

  const isBusy = sessionStatus?.type === "busy"
  const currentAgent = local.agent.current()
  const currentModel = local.model.current()
  const modelParsed = local.model.parsed()

  useEffect(() => {
    setBlocker("prompt-autocomplete", !!acMode)
    return () => setBlocker("prompt-autocomplete", false)
  }, [acMode, setBlocker])

  const fileSearchTimer = useRef<ReturnType<typeof setTimeout>>()
  const fileSearchQuery = useRef("")
  const fileSearchRun = useRef(0)
  const areSameResults = useCallback((prev: string[], next: string[]) => {
    if (prev === next) return true
    if (prev.length !== next.length) return false
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) return false
    }
    return true
  }, [])

  const searchFiles = useCallback(
    (query: string) => {
      if (fileSearchTimer.current) clearTimeout(fileSearchTimer.current)
      if (query === fileSearchQuery.current) return
      fileSearchQuery.current = query

      if (!query) {
        fileSearchRun.current++
        setFileResults((prev) => (prev.length > 0 ? [] : prev))
        return
      }

      const run = ++fileSearchRun.current
      fileSearchTimer.current = setTimeout(async () => {
        const result = await sync.client.find.files({ query, limit: 20 }).catch(() => null)
        if (run !== fileSearchRun.current) return
        if (result?.data) {
          const next = Array.isArray(result.data) ? result.data : []
          setFileResults((prev) => (areSameResults(prev, next) ? prev : next))
        }
      }, 150)
    },
    [sync, areSameResults],
  )

  useEffect(() => {
    return () => {
      if (fileSearchTimer.current) clearTimeout(fileSearchTimer.current)
      fileSearchRun.current++
    }
  }, [])

  const clearInput = useCallback(() => {
    setInput("")
    setAcMode(false)
    setAcIndex(0)
    fileSearchQuery.current = ""
    fileSearchRun.current++
    if (fileSearchTimer.current) clearTimeout(fileSearchTimer.current)
    setFileResults((prev) => (prev.length > 0 ? [] : prev))
  }, [])

  const createTranscript = useCallback((): string | null => {
    if (!sessionInfo) return null

    const messages = sessionMessages
      .filter((msg): msg is UserMessage | AssistantMessage => msg.role === "user" || msg.role === "assistant")
      .map((msg) => {
        const parts = allParts[msg.id] ?? []
        return { info: msg, parts: parts as Part[] }
      })

    return formatTranscript(
      {
        id: sessionInfo.id,
        title: sessionInfo.title || "Untitled Session",
        time: sessionInfo.time,
      },
      messages,
      {
        thinking: props.showThinking ?? true,
        toolDetails: true,
        assistantMetadata: true,
      },
    )
  }, [sessionInfo, sessionMessages, allParts, props.showThinking])

  const openCommandDialog = useCallback(
    (name: string) => {
      switch (name) {
        case "connect":
          dialog.replace(<DialogProvider />)
          break
        case "model":
          dialog.replace(<DialogModel />)
          break
        case "agent":
          dialog.replace(<DialogAgent />)
          break
        case "sessions":
          dialog.replace(<DialogSessionList />)
          break
        case "status":
          dialog.replace(<DialogStatus />)
          break
        case "keybinds":
          dialog.replace(<DialogKeybinds />)
          break
        case "help":
          dialog.replace(<DialogHelp />)
          break
        case "plugin":
          dialog.replace(<DialogPlugin />)
          break
        case "mcp":
          dialog.replace(<DialogMcp />)
          break
        case "theme":
          dialog.replace(<DialogThemeList />)
          break
        case "review":
          dialog.replace(<DialogReviewDashboard />)
          break
        case "findings":
          dialog.replace(<DialogReviewResults />)
          break
        case "health":
          dialog.replace(<DialogHealth />)
          break
        case "patterns":
          dialog.replace(<DialogPatterns />)
          break
      }
    },
    [dialog],
  )

  const runPluginCommand = useCallback(
    async (args: string) => {
      const text = args.trim()
      if (!text) {
        dialog.replace(<DialogPlugin />)
        return
      }

      const [rawSub, ...rest] = text.split(/\s+/)
      const sub = (rawSub ?? "").toLowerCase()
      const value = rest.join(" ").trim()
      const list = ((config as { plugin?: string[] }).plugin ?? []).slice()

      if (sub === "list") {
        if (list.length === 0) {
          toast.show({ message: "No plugins installed", variant: "info" })
          return
        }
        toast.show({
          message: `Installed (${list.length}): ${list.map((x) => pluginName(x)).join(", ")}`,
          variant: "info",
          duration: 5000,
        })
        return
      }

      if (sub === "install") {
        if (!value) {
          toast.show({ message: "Usage: /plugin install <spec>", variant: "warning" })
          return
        }
        if (list.includes(value)) {
          toast.show({ message: `Plugin already installed: ${value}`, variant: "warning" })
          return
        }
        await sync.client.global.config.update({ config: { plugin: [...list, value] } })
        await sync.client.instance.dispose()
        await sync.bootstrap()
        toast.show({ message: `Plugin installed: ${pluginName(value)}`, variant: "success" })
        return
      }

      if (sub === "remove") {
        if (!value) {
          toast.show({ message: "Usage: /plugin remove <name>", variant: "warning" })
          return
        }

        const index = list.findIndex((item) => {
          const name = pluginName(item)
          return item === value || name.toLowerCase() === value.toLowerCase()
        })
        if (index < 0) {
          toast.show({ message: `Plugin not found: ${value}`, variant: "warning" })
          return
        }
        const removed = list[index]
        const next = [...list.slice(0, index), ...list.slice(index + 1)]
        await sync.client.global.config.update({ config: { plugin: next } })
        await sync.client.instance.dispose()
        await sync.bootstrap()
        toast.show({ message: `Plugin removed: ${pluginName(removed ?? value)}`, variant: "success" })
        return
      }

      dialog.replace(<DialogPlugin />)
    },
    [config, dialog, sync, toast],
  )

  const runBuiltInCommand = useCallback(
    async (name: string, args: string) => {
      const command = resolveBuiltInCommand(name)
      if (!command) return false

      if (command.sessionOnly && !props.sessionID) {
        toast.show({ message: `/${command.name} is only available in a session`, variant: "warning" })
        return true
      }

      try {
        switch (command.name) {
          case "connect":
          case "model":
          case "agent":
          case "sessions":
          case "status":
          case "keybinds":
          case "help":
          case "mcp":
          case "theme":
          case "review":
          case "findings":
          case "health":
          case "patterns":
            openCommandDialog(command.name)
            break

          case "plugin":
            await runPluginCommand(args)
            break

          case "new":
            route.navigate({ type: "home" })
            break

          case "rename":
            if (props.sessionID) {
              dialog.replace(<DialogSessionRename sessionID={props.sessionID} />)
            }
            break

          case "share": {
            if (!props.sessionID) break
            const result = await sync.client.session.share({ sessionID: props.sessionID })
            const url = result.data?.share?.url
            if (!url) {
              toast.show({ message: "Failed to share session", variant: "error" })
              break
            }
            await Clipboard.copy(url).catch(() => {})
            toast.show({ message: "Share URL copied to clipboard", variant: "success" })
            break
          }

          case "unshare":
            if (!props.sessionID) break
            await sync.client.session.unshare({ sessionID: props.sessionID })
            toast.show({ message: "Session unshared", variant: "success" })
            break

          case "compact":
            if (!props.sessionID) break
            if (!currentModel) {
              toast.show({ message: "Connect a provider to summarize this session", variant: "warning" })
              break
            }
            await sync.client.session.summarize({
              sessionID: props.sessionID,
              providerID: currentModel.providerID,
              modelID: currentModel.modelID,
            })
            toast.show({ message: "Session compaction started", variant: "info" })
            break

          case "undo": {
            if (!props.sessionID) break
            if (sessionStatus?.type !== "idle") {
              await sync.client.session.abort({ sessionID: props.sessionID }).catch(() => {})
            }
            const revertID = sessionInfo?.revert?.messageID
            const target = [...sessionMessages].reverse().find(
              (msg) => msg.role === "user" && (!revertID || msg.id < revertID),
            )
            if (!target) {
              toast.show({ message: "No user message to undo", variant: "warning" })
              break
            }
            await sync.client.session.revert({ sessionID: props.sessionID, messageID: target.id })
            toast.show({ message: "Reverted to previous user message", variant: "success" })
            break
          }

          case "redo": {
            if (!props.sessionID) break
            const revertID = sessionInfo?.revert?.messageID
            if (!revertID) {
              toast.show({ message: "Nothing to redo", variant: "warning" })
              break
            }
            const next = sessionMessages.find((msg) => msg.role === "user" && msg.id > revertID)
            if (next) {
              await sync.client.session.revert({ sessionID: props.sessionID, messageID: next.id })
            } else {
              await sync.client.session.unrevert({ sessionID: props.sessionID })
            }
            toast.show({ message: "Redo applied", variant: "success" })
            break
          }

          case "copy": {
            const transcript = createTranscript()
            if (!transcript) {
              toast.show({ message: "No active session to copy", variant: "warning" })
              break
            }
            await Clipboard.copy(transcript).catch(() => {})
            toast.show({ message: "Session transcript copied", variant: "success" })
            break
          }

          case "export": {
            const transcript = createTranscript()
            if (!transcript || !sessionInfo) {
              toast.show({ message: "No active session to export", variant: "warning" })
              break
            }
            const safeTitle = (sessionInfo.title || `session-${sessionInfo.id}`)
              .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
              .replace(/\s+/g, "-")
              .replace(/-+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 80) || sessionInfo.id
            const targetArg = args.trim()
            const filename = targetArg || `${safeTitle}.md`
            const targetPath = path.isAbsolute(filename)
              ? filename
              : path.join(projectDir || process.cwd(), filename)
            await Bun.write(targetPath, transcript)
            toast.show({ message: `Transcript exported: ${targetPath}`, variant: "success", duration: 5000 })
            break
          }

          case "thinking":
            props.onToggleThinking?.()
            if (props.onToggleThinking) {
              toast.show({
                message: props.showThinking ? "Thinking hidden" : "Thinking visible",
                variant: "info",
              })
            }
            break

          case "timestamps":
            props.onToggleTimestamps?.()
            if (props.onToggleTimestamps) {
              toast.show({
                message: props.showTimestamps ? "Timestamps hidden" : "Timestamps visible",
                variant: "info",
              })
            }
            break

          case "timeline":
            toast.show({
              message: "Timeline picker is not yet available in Ink. Use /fork [message-id] as a workaround.",
              variant: "warning",
              duration: 4500,
            })
            break

          case "fork": {
            if (!props.sessionID) break
            const inputMessageID = args.trim()
            const fallbackMessageID = [...sessionMessages].reverse().find((x) => x.role === "user")?.id
            const messageID = inputMessageID || fallbackMessageID
            const result = await sync.client.session.fork({
              sessionID: props.sessionID,
              ...(messageID ? { messageID } : {}),
            })
            const next = result.data?.id
            if (!next) {
              toast.show({ message: "Failed to fork session", variant: "error" })
              break
            }
            route.navigate({ type: "session", sessionID: next })
            toast.show({ message: "Forked into new session", variant: "success" })
            break
          }

          case "exit":
            exit()
            break
        }

        if (command.name === "health") {
          const quality = lobster.projectQuality
          if (quality && Date.now() - quality.analyzed_at < 24 * 60 * 60 * 1000) return true
          if (lobster.analysisRunning) return true
          if (!currentModel || !currentAgent) {
            toast.show({ message: "Connect a provider to run health analysis", variant: "warning" })
            return true
          }

          let sessionID = props.sessionID
          if (!sessionID) {
            const created = await sync.client.session.create({})
            sessionID = created.data?.id
            if (!sessionID) {
              toast.show({ message: "Failed to create session for analysis", variant: "error" })
              return true
            }
            route.navigate({ type: "session", sessionID })
          }

          lobster.setAnalysisRunning(true)
          sync.client.session.prompt({
            sessionID,
            messageID: Identifier.ascending("message"),
            agent: currentAgent.name,
            model: currentModel,
            parts: [{ id: Identifier.ascending("part"), type: "text", text: HEALTH_ANALYSIS_PROMPT }],
          }).catch(() => {
            toast.show({ message: "Failed to start health analysis", variant: "error" })
          }).finally(() => {
            lobster.setAnalysisRunning(false)
          })
        }

        return true
      } catch (error) {
        toast.error(error)
        return true
      }
    },
    [
      props.sessionID,
      props.onToggleThinking,
      props.onToggleTimestamps,
      props.showThinking,
      props.showTimestamps,
      toast,
      openCommandDialog,
      runPluginCommand,
      route,
      dialog,
      currentModel,
      currentAgent,
      sync,
      sessionStatus?.type,
      sessionInfo,
      sessionMessages,
      createTranscript,
      projectDir,
      exit,
      lobster,
    ],
  )

  const commandOptions = useMemo<AutocompleteOption[]>(() => {
    const builtIn = BUILT_IN_COMMANDS
      .filter((x) => !x.sessionOnly || !!props.sessionID)
      .map((x) => ({
        label: `/${x.name}`,
        value: `builtin:${x.name}`,
        description: x.aliases && x.aliases.length > 0
          ? `${x.description} (${x.aliases.join(", ")})`
          : x.description,
      }))
    const sdkCmds = commands
      .filter((x) => !resolveBuiltInCommand(x.name))
      .map((x) => ({
        label: `/${x.name}`,
        value: `sdk:${x.name}`,
        description: x.description ?? "",
      }))
    return [...builtIn, ...sdkCmds]
  }, [commands, props.sessionID])

  const mentionOptions = useMemo<AutocompleteOption[]>(() => {
    const agentOpts: AutocompleteOption[] = agents
      .filter((a) => !a.hidden && a.mode !== "subagent")
      .map((a) => ({
        label: "@" + a.name,
        value: "agent:" + a.name,
        description: a.description ?? "agent",
      }))
    const fileOpts: AutocompleteOption[] = fileResults.map((f) => ({
      label: "@" + f,
      value: "file:" + f,
      description: "file",
    }))
    return [...agentOpts, ...fileOpts]
  }, [agents, fileResults])

  const filteredOptions = useMemo(() => {
    if (!acMode) return []
    const source = acMode === "/" ? commandOptions : mentionOptions
    const filterStart = acMode === "/" ? 1 : acTriggerPos + 1
    const filterText = input.slice(filterStart).toLowerCase()
    if (!filterText) return source
    return source.filter(
      (opt) =>
        opt.label.toLowerCase().includes(filterText) ||
        (opt.description?.toLowerCase().includes(filterText) ?? false),
    )
  }, [acMode, input, acTriggerPos, commandOptions, mentionOptions])

  const safeAcIndex = useMemo(() => {
    if (filteredOptions.length <= 0) return 0
    if (acIndex < 0) return 0
    if (acIndex >= filteredOptions.length) return filteredOptions.length - 1
    return acIndex
  }, [filteredOptions.length, acIndex])

  const selectOption = useCallback(
    (option: AutocompleteOption) => {
      if (acMode === "/") {
        if (option.value.startsWith("builtin:")) {
          const name = option.value.slice("builtin:".length)
          clearInput()
          void runBuiltInCommand(name, "")
          return
        }
        if (option.value.startsWith("sdk:")) {
          const name = option.value.slice("sdk:".length)
          setInput("/" + name + " ")
          setAcMode(false)
          return
        }
      } else if (acMode === "@") {
        const before = input.slice(0, acTriggerPos)
        const name = option.value.startsWith("agent:")
          ? option.value.slice(6)
          : option.value.startsWith("file:")
            ? option.value.slice(5)
            : option.value
        setInput(before + "@" + name + " ")
        setAcMode(false)
      }
    },
    [acMode, acTriggerPos, input, clearInput, runBuiltInCommand],
  )

  const handleInputChange = useCallback((value: string) => {
    setInput(value)

    if (value.startsWith("/") && !value.includes(" ")) {
      setAcMode("/")
      setAcTriggerPos(0)
      setAcIndex(0)
      searchFiles("")
      return
    }

    const lastAt = value.lastIndexOf("@")
    if (lastAt >= 0) {
      const charBefore = lastAt === 0 ? undefined : value[lastAt - 1]
      const textAfter = value.slice(lastAt + 1)
      if ((charBefore === undefined || /\s/.test(charBefore)) && !textAfter.includes(" ")) {
        setAcMode("@")
        setAcTriggerPos(lastAt)
        setAcIndex(0)
        searchFiles(textAfter)
        return
      }
    }

    setAcMode(false)
    searchFiles("")
  }, [searchFiles])

  const handleSubmit = useCallback(
    (value: string) => {
      if (acMode && filteredOptions.length > 0) {
        const selected = filteredOptions[safeAcIndex]
        if (selected) selectOption(selected)
        return
      }

      const text = value.trim()
      if (!text) return

      if (text === "exit" || text === "quit" || text === ":q") {
        exit()
        return
      }

      const slash = parseSlashCommand(text)
      if (slash) {
        const command = resolveBuiltInCommand(slash.name)
        if (command) {
          clearInput()
          void runBuiltInCommand(command.name, slash.args)
          return
        }
      }

      if (isBusy) return
      if (!currentAgent || !currentModel) return

      props.onSubmit(text, {
        agent: currentAgent.name,
        model: currentModel,
      })
      clearInput()
    },
    [
      acMode,
      filteredOptions,
      safeAcIndex,
      selectOption,
      isBusy,
      currentAgent,
      currentModel,
      props.onSubmit,
      exit,
      clearInput,
      runBuiltInCommand,
    ],
  )

  const handlePaletteCommand = useCallback(
    (command: string) => {
      if (resolveBuiltInCommand(command)) {
        void runBuiltInCommand(command, "")
        return
      }
      setInput(`/${command} `)
      setAcMode(false)
    },
    [runBuiltInCommand],
  )

  useInput((ch, key) => {
    if (acMode && filteredOptions.length > 0) {
      if (key.upArrow) {
        setAcIndex((prev) => {
          const next = prev <= 0 ? filteredOptions.length - 1 : prev - 1
          return next
        })
        return
      }
      if (key.downArrow) {
        setAcIndex((prev) => {
          const next = prev >= filteredOptions.length - 1 ? 0 : prev + 1
          return next
        })
        return
      }
      if (key.tab) {
        const selected = filteredOptions[safeAcIndex]
        if (selected) selectOption(selected)
        return
      }
      if (key.escape) {
        setAcMode(false)
        return
      }
    }

    if (key.ctrl && ch === "c") {
      if (isBusy && props.sessionID) {
        setInterruptCount((c) => c + 1)
        sync.client.session.abort({ sessionID: props.sessionID }).catch(() => {})
        return
      }
      if (interruptCount > 0) {
        exit()
        return
      }
      setInterruptCount(1)
      setTimeout(() => setInterruptCount(0), 2000)
      return
    }

    if (isDialogOpen) return

    if (key.tab && !acMode) {
      local.agent.move(1)
      return
    }

    if (key.ctrl && ch === "m") {
      dialog.replace(<DialogModel />)
      return
    }

    if (key.ctrl && ch === "a") {
      dialog.replace(<DialogAgent />)
      return
    }

    if (key.ctrl && ch === "s") {
      dialog.replace(<DialogSessionList />)
      return
    }

    if (key.ctrl && ch === "p") {
      dialog.replace(<DialogCommand onTrigger={handlePaletteCommand} />)
      return
    }

    if (key.ctrl && ch === "o") {
      dialog.replace(<DialogProvider />)
      return
    }

    if (ch === "\x1F") {
      dialog.replace(<DialogKeybinds />)
      return
    }
  })

  const autoSubmitted = useRef(false)
  useEffect(() => {
    if (!autoSubmitted.current && args.prompt && currentModel && currentAgent) {
      autoSubmitted.current = true
      handleSubmit(args.prompt)
    }
  }, [args.prompt, currentModel, currentAgent, handleSubmit])

  return (
    <Box flexDirection="column">
      <Box paddingLeft={2} gap={1}>
        <Text color={theme.secondary} bold>{currentAgent?.name ?? "build"}</Text>
        <Text color={theme.textMuted}>|</Text>
        <Text color={theme.textMuted}>{modelParsed.model}</Text>
        <Text color={theme.textMuted} dimColor>({modelParsed.provider})</Text>
        {isBusy && (
          <>
            <Text color={theme.textMuted}>|</Text>
            <Spinner color={theme.primary} />
          </>
        )}
      </Box>

      {acMode && filteredOptions.length > 0 && !isBusy && (
        <Autocomplete options={filteredOptions} selected={safeAcIndex} />
      )}

      <Box paddingLeft={1}>
        <Text color={theme.accent}>{"> "}</Text>
        {isBusy ? (
          <Text color={theme.textMuted} dimColor>
            {interruptCount > 0 ? "Press Ctrl+C again to exit" : "Agent is working... Press Ctrl+C to interrupt"}
          </Text>
        ) : (
          <TextInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            placeholder="Type a message... (/ commands, @ mentions)"
            focus={!isDialogOpen}
          />
        )}
      </Box>

      {!isBusy && !acMode && (
        <Box paddingLeft={2} gap={2}>
          <Text color={theme.textMuted} dimColor>tab agent</Text>
          <Text color={theme.textMuted} dimColor>^M model</Text>
          <Text color={theme.textMuted} dimColor>^S sessions</Text>
          <Text color={theme.textMuted} dimColor>^P commands</Text>
          <Text color={theme.textMuted} dimColor>^O connect</Text>
        </Box>
      )}
      {!isBusy && acMode && (
        <Box paddingLeft={2} gap={2}>
          <Text color={theme.textMuted} dimColor>up/down navigate</Text>
          <Text color={theme.textMuted} dimColor>enter/tab select</Text>
          <Text color={theme.textMuted} dimColor>esc dismiss</Text>
        </Box>
      )}
    </Box>
  )
}
