/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useState } from "react"
import { useTheme } from "../../theme"
import { InlineTool } from "./inline-tool"
import { BlockTool } from "./block-tool"
import path from "path"

// Shared types for tool rendering
export interface ToolProps {
  tool: string
  input: Record<string, any>
  metadata: Record<string, any>
  output?: string
  status: string
  error?: string
}

/** Strip ANSI escape codes from text */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

/** Normalize a file path for display */
function normalizePath(filepath?: string): string {
  if (!filepath) return ""
  const home = process.env.HOME ?? process.env.USERPROFILE
  if (home && filepath.startsWith(home)) {
    return "~" + filepath.slice(home.length)
  }
  const cwd = process.cwd()
  if (filepath.startsWith(cwd)) {
    return filepath.slice(cwd.length + 1) || "."
  }
  return filepath
}

/** Format tool input as [key=value, ...] */
function formatInput(input: Record<string, any>, skip: string[] = []): string {
  const entries = Object.entries(input).filter(([k, v]) => v !== undefined && !skip.includes(k))
  if (!entries.length) return ""
  return "[" + entries.map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 40) : v}`).join(", ") + "]"
}

function withStableKeys<T>(items: T[], getBase: (item: T) => string): Array<{ item: T; key: string }> {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const raw = getBase(item)
    const base = raw || "item"
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return {
      item,
      key: count === 0 ? base : `${base}:${count}`,
    }
  })
}

// ─── Bash ────────────────────────────────────────────────

export function BashTool(props: ToolProps) {
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const isRunning = props.status === "running"
  const raw = stripAnsi(props.metadata.output?.trim() ?? "")
  const lines = raw.split("\n")
  const overflow = lines.length > 10
  const limited = expanded || !overflow ? raw : [...lines.slice(0, 10), "..."].join("\n")

  const desc = props.input.description ?? "Shell"
  const workdir = props.input.workdir && props.input.workdir !== "." ? ` in ${normalizePath(props.input.workdir)}` : ""
  const title = `# ${desc}${workdir}`

  if (props.metadata.output !== undefined) {
    return (
      <BlockTool title={title} error={props.error} spinner={isRunning}>
        <Box flexDirection="column" gap={0}>
          <Text color={theme.text}>$ {props.input.command}</Text>
          {raw && <Text color={theme.text}>{limited}</Text>}
          {overflow && <Text color={theme.textMuted}>{expanded ? "(collapsed)" : "(truncated)"}</Text>}
        </Box>
      </BlockTool>
    )
  }

  return (
    <InlineTool
      icon="$"
      pending="Writing command..."
      complete={props.input.command}
      status={props.status}
      error={props.error}
    >
      {props.input.command}
    </InlineTool>
  )
}

// ─── Write ───────────────────────────────────────────────

export function WriteTool(props: ToolProps) {
  if (props.metadata.diagnostics !== undefined) {
    const diags = props.metadata.diagnostics?.[props.input.filePath] ?? []
    const visibleDiags = withStableKeys(
      diags.slice(0, 3),
      (d: any) => `${d.range?.start?.line ?? 0}:${d.range?.start?.character ?? 0}:${d.message ?? ""}`,
    )
    return (
      <BlockTool title={`# Wrote ${normalizePath(props.input.filePath)}`} error={props.error}>
        <Box flexDirection="column">
          {visibleDiags.map(({ item, key }) => (
            <Text key={key} color="red">
              Error [{item.range?.start?.line}:{item.range?.start?.character}]: {item.message}
            </Text>
          ))}
        </Box>
      </BlockTool>
    )
  }

  return (
    <InlineTool
      icon="<-"
      pending="Preparing write..."
      complete={props.input.filePath}
      status={props.status}
      error={props.error}
    >
      Write {normalizePath(props.input.filePath)}
    </InlineTool>
  )
}

// ─── Edit ────────────────────────────────────────────────

export function EditTool(props: ToolProps) {
  const { theme } = useTheme()

  if (props.metadata.diff !== undefined) {
    const diffLines: string[] = (props.metadata.diff ?? "").split("\n")
    const visibleDiffLines = withStableKeys(diffLines.slice(0, 30), (line) => line)
    const diags = (props.metadata.diagnostics?.[props.input.filePath] ?? [])
      .filter((x: any) => x.severity === 1)
      .slice(0, 3)
    const visibleDiags = withStableKeys(
      diags,
      (d: any) => `${d.range?.start?.line ?? 0}:${d.range?.start?.character ?? 0}:${d.message ?? ""}`,
    )

    return (
      <BlockTool title={`Edit ${normalizePath(props.input.filePath)}`} error={props.error}>
        <Box flexDirection="column" paddingLeft={1}>
          {visibleDiffLines.map(({ item: line, key }) => {
            const color = line.startsWith("+")
              ? theme.success
              : line.startsWith("-")
                ? theme.error
                : line.startsWith("@@")
                  ? theme.info
                  : theme.textMuted
            return (
              <Text key={key} color={color}>
                {line}
              </Text>
            )
          })}
          {diffLines.length > 30 && <Text color={theme.textMuted}>... {diffLines.length - 30} more lines</Text>}
          {visibleDiags.map(({ item: d, key }) => (
            <Text key={key} color={theme.error}>
              Error [{(d.range?.start?.line ?? 0) + 1}:{(d.range?.start?.character ?? 0) + 1}] {d.message}
            </Text>
          ))}
        </Box>
      </BlockTool>
    )
  }

  return (
    <InlineTool
      icon="<-"
      pending="Preparing edit..."
      complete={props.input.filePath}
      status={props.status}
      error={props.error}
    >
      Edit {normalizePath(props.input.filePath)} {formatInput({ replaceAll: props.input.replaceAll })}
    </InlineTool>
  )
}

// ─── Read ────────────────────────────────────────────────

export function ReadTool(props: ToolProps) {
  const { theme } = useTheme()
  const loaded: string[] =
    props.status === "completed" && Array.isArray(props.metadata.loaded)
      ? props.metadata.loaded.filter((p: any): p is string => typeof p === "string")
      : []
  const loadedWithKeys = withStableKeys(loaded, (filepath) => filepath)

  return (
    <>
      <InlineTool
        icon="->"
        pending="Reading file..."
        complete={props.input.filePath}
        status={props.status}
        error={props.error}
      >
        Read {normalizePath(props.input.filePath)} {formatInput(props.input, ["filePath"])}
      </InlineTool>
      {loadedWithKeys.map(({ item: filepath, key }) => (
        <Box key={key} paddingLeft={5}>
          <Text color={theme.textMuted}>
            {"-> "}Loaded {normalizePath(filepath)}
          </Text>
        </Box>
      ))}
    </>
  )
}

// ─── Glob ────────────────────────────────────────────────

export function GlobTool(props: ToolProps) {
  return (
    <InlineTool
      icon="*"
      pending="Finding files..."
      complete={props.input.pattern}
      status={props.status}
      error={props.error}
    >
      Glob "{props.input.pattern}"{props.input.path ? ` in ${normalizePath(props.input.path)}` : ""}
      {props.metadata.count !== undefined
        ? ` (${props.metadata.count} match${props.metadata.count === 1 ? "" : "es"})`
        : ""}
    </InlineTool>
  )
}

// ─── Grep ────────────────────────────────────────────────

export function GrepTool(props: ToolProps) {
  return (
    <InlineTool
      icon="*"
      pending="Searching content..."
      complete={props.input.pattern}
      status={props.status}
      error={props.error}
    >
      Grep "{props.input.pattern}"{props.input.path ? ` in ${normalizePath(props.input.path)}` : ""}
      {props.metadata.matches !== undefined
        ? ` (${props.metadata.matches} match${props.metadata.matches === 1 ? "" : "es"})`
        : ""}
    </InlineTool>
  )
}

// ─── WebFetch ────────────────────────────────────────────

export function WebFetchTool(props: ToolProps) {
  return (
    <InlineTool
      icon="%"
      pending="Fetching from web..."
      complete={(props.input as any).url}
      status={props.status}
      error={props.error}
    >
      WebFetch {(props.input as any).url}
    </InlineTool>
  )
}

// ─── WebSearch ───────────────────────────────────────────

export function WebSearchTool(props: ToolProps) {
  return (
    <InlineTool
      icon="@"
      pending="Searching web..."
      complete={props.input.query}
      status={props.status}
      error={props.error}
    >
      Search "{props.input.query}"{props.metadata.numResults ? ` (${props.metadata.numResults} results)` : ""}
    </InlineTool>
  )
}

// ─── CodeSearch ──────────────────────────────────────────

export function CodeSearchTool(props: ToolProps) {
  return (
    <InlineTool
      icon="<>"
      pending="Searching code..."
      complete={props.input.query}
      status={props.status}
      error={props.error}
    >
      Code Search "{props.input.query}"{props.metadata.results ? ` (${props.metadata.results} results)` : ""}
    </InlineTool>
  )
}

// ─── Task ────────────────────────────────────────────────

export function TaskTool(props: ToolProps) {
  const { theme } = useTheme()
  const isRunning = props.status === "running"
  const subtype = props.input.subagent_type ?? "unknown"
  const title = subtype.charAt(0).toUpperCase() + subtype.slice(1) + " Task"

  if (props.input.description || props.input.subagent_type) {
    return (
      <BlockTool title={`# ${title}`} error={props.error} spinner={isRunning}>
        <Text color={theme.textMuted}>{props.input.description}</Text>
      </BlockTool>
    )
  }

  return (
    <InlineTool
      icon="#"
      pending="Delegating..."
      complete={props.input.subagent_type}
      status={props.status}
      error={props.error}
    >
      {subtype} Task {props.input.description}
    </InlineTool>
  )
}

// ─── ApplyPatch ──────────────────────────────────────────

export function ApplyPatchTool(props: ToolProps) {
  const { theme } = useTheme()
  const files: Array<{ file: string; diff?: string }> = props.metadata.files ?? []
  const filesWithKeys = withStableKeys(files, (file) => file.file)

  if (files.length > 0) {
    return (
      <BlockTool title="# Apply Patch" error={props.error}>
        {filesWithKeys.map(({ item: f, key }) => (
          <Box key={key} flexDirection="column">
            <Text color={theme.text} bold>
              {normalizePath(f.file)}
            </Text>
            {f.diff &&
              withStableKeys(f.diff.split("\n").slice(0, 15), (line) => line).map(({ item: line, key: lineKey }) => {
                const color = line.startsWith("+")
                  ? theme.success
                  : line.startsWith("-")
                    ? theme.error
                    : theme.textMuted
                return (
                  <Text key={lineKey} color={color}>
                    {line}
                  </Text>
                )
              })}
          </Box>
        ))}
      </BlockTool>
    )
  }

  return (
    <InlineTool icon="<-" pending="Applying patch..." complete={true} status={props.status} error={props.error}>
      Apply Patch
    </InlineTool>
  )
}

// ─── TodoWrite ───────────────────────────────────────────

export function TodoWriteTool(props: ToolProps) {
  const { theme } = useTheme()
  const todos: Array<{ content: string; status: string }> = props.input.todos ?? []
  const todosWithKeys = withStableKeys(todos, (todo) => `${todo.status}:${todo.content}`)

  if (todos.length > 0) {
    return (
      <BlockTool title="# Todo" error={props.error}>
        {todosWithKeys.map(({ item: t, key }) => {
          const icon = t.status === "completed" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]"
          const color =
            t.status === "completed" ? theme.success : t.status === "in_progress" ? theme.warning : theme.text
          return (
            <Text key={key} color={color}>
              {icon} {t.content}
            </Text>
          )
        })}
      </BlockTool>
    )
  }

  return (
    <InlineTool icon="v" pending="Updating todos..." complete={true} status={props.status} error={props.error}>
      Update Todos
    </InlineTool>
  )
}

// ─── Generic ─────────────────────────────────────────────

export function GenericTool(props: ToolProps) {
  return (
    <InlineTool icon="*" pending="Running..." complete={true} status={props.status} error={props.error}>
      {props.tool} {formatInput(props.input)}
    </InlineTool>
  )
}
