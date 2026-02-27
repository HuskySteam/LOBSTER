type Diagnostic = { severity?: number; range?: { start?: { line?: number; character?: number } }; message?: string }
type ToolPartState = { status?: string; metadata?: Record<string, unknown>; input?: Record<string, unknown>; error?: unknown }
type PatchFile = { file?: string; diff?: string }
type TodoItem = { content?: string }
export type ToolPartForEstimate = { id?: string; tool?: string; state?: ToolPartState }

const BLOCK_TOOL_CHROME_LINES = 3 // marginTop + title + marginBottom

/** Count rendered terminal rows for a string, accounting for soft-wrap at cols. */
export function wrappedLineCount(text: string, cols: number): number {
  const hardLines = text.split("\n")
  let total = 0
  for (const line of hardLines) {
    total += Math.max(1, Math.ceil(line.length / cols))
  }
  return total
}

/** Count wrapped rows for an array of hard lines (already split), capped at maxLines. */
function wrappedSliceCount(lines: string[], maxLines: number, cols: number): number {
  const capped = lines.slice(0, maxLines)
  let total = 0
  for (const line of capped) {
    total += Math.max(1, Math.ceil(line.length / cols))
  }
  return total
}

const toolLineCache = new Map<string, { cols: number; signature: string; result: number }>()

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalizeError(error: unknown): string {
  if (error === null || error === undefined) return ""
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function buildToolLineSignature(part: ToolPartForEstimate): string {
  const state: ToolPartState = part.state ?? {}
  const input: Record<string, unknown> = (state.input ?? {}) as Record<string, unknown>
  const meta: Record<string, unknown> = state.status === "pending" ? {} : ((state.metadata ?? {}) as Record<string, unknown>)
  const todos: TodoItem[] = Array.isArray(input.todos) ? (input.todos as TodoItem[]) : []
  const diagnosticsMap = (meta.diagnostics ?? {}) as Record<string, Diagnostic[]>
  const diagnostics = Object.entries(diagnosticsMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, list]) => {
      const items = Array.isArray(list) ? list : []
      return [
        file,
        items.map((d) => `${d.severity ?? ""}:${d.range?.start?.line ?? ""}:${d.range?.start?.character ?? ""}:${d.message ?? ""}`),
      ]
    })
  const files = Array.isArray(meta.files) ? (meta.files as PatchFile[]) : []
  const loaded = Array.isArray(meta.loaded) ? (meta.loaded as string[]) : []

  return JSON.stringify({
    tool: part.tool ?? "",
    status: state.status ?? "",
    error: hashString(normalizeError(state.error)),
    command: hashString(String(input.command ?? "")),
    filePath: String(input.filePath ?? ""),
    description: hashString(String(input.description ?? "")),
    subagentType: String(input.subagent_type ?? ""),
    todos: todos.map((t) => hashString(String(t.content ?? ""))),
    output: hashString(String(meta.output ?? "")),
    diff: hashString(String(meta.diff ?? "")),
    diagnostics,
    files: files.map((f) => [f.file ?? "", hashString(String(f.diff ?? ""))]),
    loaded,
  })
}

export function resetToolLineCacheForTests(): void {
  toolLineCache.clear()
}

/** Estimate rendered lines for a tool part based on its state/metadata.
 * Mirrors the rendering caps in component/message/tools.tsx.
 * Results are cached per part ID + cols + signature to avoid redundant computation. */
export function estimateToolLines(part: ToolPartForEstimate, cols: number): number {
  const signature = buildToolLineSignature(part)
  const cacheKey = part.id ?? ""
  const cached = cacheKey ? toolLineCache.get(cacheKey) : undefined
  if (cached && cached.cols === cols && cached.signature === signature) return cached.result

  const state: ToolPartState = part.state ?? {}
  const meta: Record<string, unknown> = state.status === "pending" ? {} : ((state.metadata ?? {}) as Record<string, unknown>)
  const input: Record<string, unknown> = (state.input ?? {}) as Record<string, unknown>

  // InlineTool tools render 1 line (+ optional error)
  let inlineBase = state.error ? 2 : 1
  if (input.command) {
    inlineBase = wrappedLineCount(String(input.command), cols) + (state.error ? 1 : 0)
  } else if (input.filePath) {
    inlineBase = wrappedLineCount(String(input.filePath), cols) + (state.error ? 1 : 0)
  }

  // Block tools have borders and padding which reduce available width
  const blockCols = Math.max(10, cols - 4)
  let result: number

  switch (part.tool) {
    case "bash": {
      if (meta.output === undefined) { result = inlineBase; break }
      const raw = (meta.output as string ?? "").trim()
      const allLines = raw ? raw.split("\n") : []
      const outputRows = raw ? wrappedSliceCount(allLines, 10, blockCols) : 0
      const cmdRows = wrappedLineCount(String(input.command ?? ""), blockCols)
      result = BLOCK_TOOL_CHROME_LINES + 1 + cmdRows + outputRows + (allLines.length > 10 ? 1 : 0) + (state.error ? 1 : 0)
      break
    }
    case "edit": {
      if (meta.diff === undefined) { result = inlineBase; break }
      const allLines = (meta.diff as string ?? "").split("\n")
      const diffRows = wrappedSliceCount(allLines, 30, blockCols)
      const diagnosticsMap = (meta.diagnostics ?? {}) as Record<string, Diagnostic[]>
      const diags = (diagnosticsMap[input.filePath as string] ?? [])
        .filter((x) => x.severity === 1)
        .slice(0, 3)
      let diagRows = 0
      for (const d of diags) {
        diagRows += wrappedLineCount(
          `Error [${d.range?.start?.line}:${d.range?.start?.character}] ${d.message}`,
          blockCols,
        )
      }
      result = BLOCK_TOOL_CHROME_LINES + 1 + diffRows + (allLines.length > 30 ? 1 : 0) + diagRows + (state.error ? 1 : 0)
      break
    }
    case "write": {
      if (meta.diagnostics === undefined) { result = inlineBase; break }
      const diagnosticsMap = (meta.diagnostics ?? {}) as Record<string, Diagnostic[]>
      const diags = (diagnosticsMap[input.filePath as string] ?? []).slice(0, 3)
      let diagRows = 0
      for (const d of diags) {
        diagRows += wrappedLineCount(
          `Error [${d.range?.start?.line}:${d.range?.start?.character}] ${d.message}`,
          blockCols,
        )
      }
      result = BLOCK_TOOL_CHROME_LINES + 1 + diagRows + (state.error ? 1 : 0)
      break
    }
    case "apply_patch": {
      const files: PatchFile[] = (meta.files as PatchFile[]) ?? []
      if (files.length === 0) { result = inlineBase; break }
      let total = 1
      for (const f of files) {
        total +=
          wrappedLineCount(String(f.file ?? ""), blockCols) +
          (f.diff ? wrappedSliceCount(f.diff.split("\n"), 15, blockCols) : 0)
      }
      result = BLOCK_TOOL_CHROME_LINES + total + (state.error ? 1 : 0)
      break
    }
    case "read": {
      const loaded: string[] = Array.isArray(meta.loaded) ? (meta.loaded as string[]) : []
      let loadedLines = 0
      for (const f of loaded) {
        loadedLines += wrappedLineCount(`-> Loaded ${f}`, Math.max(10, cols - 5))
      }
      result = inlineBase + loadedLines
      break
    }
    case "task": {
      if (input.description || input.subagent_type) {
        const desc = String(input.description ?? "")
        result = BLOCK_TOOL_CHROME_LINES + 1 + wrappedLineCount(desc, blockCols) + (state.error ? 1 : 0)
        break
      }
      result = inlineBase
      break
    }
    case "todowrite": {
      const todos: TodoItem[] = (input.todos as TodoItem[]) ?? []
      if (todos.length > 0) {
        let todoLines = 0
        for (const t of todos) {
          todoLines += wrappedLineCount(`[x] ${t.content ?? ""}`, blockCols)
        }
        result = BLOCK_TOOL_CHROME_LINES + 1 + todoLines + (state.error ? 1 : 0)
        break
      }
      result = inlineBase
      break
    }
    default:
      result = inlineBase
  }

  if (cacheKey) {
    toolLineCache.set(cacheKey, { cols, signature, result })
    // Cap cache size to prevent unbounded growth
    if (toolLineCache.size > 2000) {
      const firstKey = toolLineCache.keys().next().value
      if (firstKey !== undefined) toolLineCache.delete(firstKey)
    }
  }

  return result
}
