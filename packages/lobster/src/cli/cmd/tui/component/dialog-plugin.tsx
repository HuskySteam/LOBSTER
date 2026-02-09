import { createMemo, createSignal, createResource, createEffect, on, onMount, For, Show, Match, Switch } from "solid-js"
import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { Spinner } from "./spinner"

type Tab = "installed" | "marketplace" | "add"

interface MarketplacePlugin {
  name: string
  description: string
  spec: string
  source: string
}

interface RegistryPlugin {
  name: string
  npm: string
  description: string
  category: string
}

interface Registry {
  version: number
  updated: string
  categories: string[]
  plugins: RegistryPlugin[]
}

function isRegistryPlugin(v: unknown): v is RegistryPlugin {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as any).name === "string" &&
    typeof (v as any).npm === "string" &&
    typeof (v as any).description === "string" &&
    typeof (v as any).category === "string"
  )
}

function parseRegistry(json: unknown): Registry | null {
  if (typeof json !== "object" || json === null) return null
  const obj = json as Record<string, unknown>
  if (typeof obj.version !== "number") return null
  if (!Array.isArray(obj.plugins)) return null
  const plugins = obj.plugins.filter(isRegistryPlugin)
  return {
    version: obj.version,
    updated: typeof obj.updated === "string" ? obj.updated : "",
    categories: Array.isArray(obj.categories) ? obj.categories.filter((c): c is string => typeof c === "string") : [],
    plugins,
  }
}

export function DialogPlugin(props: { initialTab?: Tab }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const dimensions = useTerminalDimensions()

  onMount(() => dialog.setSize("large"))

  const [activeTab, setActiveTab] = createSignal<Tab>(props.initialTab ?? "installed")
  const [hover, setHover] = createSignal(false)
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [loading, setLoading] = createSignal(false)
  const [addInput, setAddInput] = createSignal("")

  // Scrollbox refs for each tab
  let installedScroll: ScrollBoxRenderable | undefined
  let marketplaceScroll: ScrollBoxRenderable | undefined

  const maxListHeight = createMemo(() => Math.max(5, Math.floor(dimensions().height / 2) - 6))

  const tabs: Tab[] = ["installed", "marketplace", "add"]
  const tabLabels: Record<Tab, string> = {
    installed: "Installed",
    marketplace: "Marketplace",
    add: "Add",
  }

  // Parse installed plugins
  const plugins = createMemo(() => {
    const list = sync.data.config.plugin ?? []
    return list.map((value) => {
      if (value.startsWith("github:") || value.startsWith("https://github.com/")) {
        const parts = value.replace(/\.git$/, "").split("/")
        const name = parts[parts.length - 1] || value
        return { name, source: "cc" as const, raw: value }
      }
      if (value.startsWith("file://")) {
        const p = value.substring("file://".length)
        const parts = p.split("/")
        const filename = parts.pop() || p
        if (!filename.includes(".")) return { name: filename, source: "file" as const, raw: value }
        const basename = filename.split(".")[0]
        if (basename === "index") {
          const dirname = parts.pop()
          return { name: dirname || basename, source: "file" as const, raw: value }
        }
        return { name: basename, source: "file" as const, raw: value }
      }
      const index = value.lastIndexOf("@")
      if (index <= 0) return { name: value, version: "latest", source: "npm" as const, raw: value }
      const name = value.substring(0, index)
      const version = value.substring(index + 1)
      return { name, version, source: "npm" as const, raw: value }
    }).toSorted((a, b) => a.name.localeCompare(b.name))
  })

  // Fetch all marketplace sources when marketplace tab is active
  const [allMarketplace] = createResource(
    () => activeTab() === "marketplace",
    async (active) => {
      if (!active) return []
      const results: MarketplacePlugin[] = []

      // Fetch LOBSTER registry
      try {
        const res = await fetch(
          "https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/registry/plugins.json",
        )
        if (res.ok) {
          const reg = parseRegistry(await res.json())
          if (reg) {
            for (const p of reg.plugins) {
              results.push({ name: p.name, description: p.description, spec: p.npm, source: "LOBSTER" })
            }
          }
        }
      } catch {}

      // Fetch fresh config to get latest marketplace sources (sync store may be stale)
      let configSources: string[] = []
      try {
        const config = await sdk.client.global.config.get()
        configSources = config.data?.plugin_marketplaces ?? []
      } catch {
        configSources = sync.data.config.plugin_marketplaces ?? []
      }
      const sources = Array.from(new Set([...configSources, "anthropics/claude-code"]))

      // Fetch each marketplace source in parallel (validate format to prevent SSRF)
      const validSources = sources.filter((s) => /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s))
      const fetches = validSources.map(async (source) => {
        try {
          // Claude Code marketplace uses .claude-plugin/marketplace.json
          const url = `https://raw.githubusercontent.com/${source}/main/.claude-plugin/marketplace.json`
          const res = await fetch(url)
          if (!res.ok) return []
          const json = await res.json()
          const items = Array.isArray(json) ? json : (json?.plugins ?? [])
          const label = source.split("/").pop() || source
          const parsed: MarketplacePlugin[] = []
          for (const item of items) {
            if (typeof item !== "object" || !item) continue
            const name = typeof (item as any).name === "string" ? (item as any).name : ""
            if (!name) continue
            const description = typeof (item as any).description === "string" ? (item as any).description : ""
            // Use spec if provided, otherwise construct from source field or fallback
            const itemSource = typeof (item as any).source === "string" ? (item as any).source : ""
            const spec = typeof (item as any).spec === "string"
              ? (item as any).spec
              : itemSource.startsWith("./")
                ? `github:${source}/${itemSource.slice(2)}`
                : `github:${source}/plugins/${name}`
            parsed.push({ name, description, spec, source: label })
          }
          return parsed
        } catch {
          return []
        }
      })
      const sourceResults = await Promise.all(fetches)
      for (const batch of sourceResults) {
        results.push(...batch)
      }

      return results
    },
  )

  // Unified marketplace list — deduplicated and filtered
  const marketplacePlugins = createMemo(() => {
    const list = allMarketplace()
    if (!list) return []
    const installedNames = new Set(plugins().map((p) => p.name))
    const installedRaw = new Set(plugins().map((p) => p.raw))
    const seen = new Set<string>()
    return list
      .filter((p) => {
        if (installedNames.has(p.name) || installedRaw.has(p.spec)) return false
        if (seen.has(p.name)) return false
        seen.add(p.name)
        return true
      })
      .toSorted((a, b) => a.name.localeCompare(b.name))
  })

  function scrollToSelected(scroll: ScrollBoxRenderable | undefined, index: number) {
    if (!scroll) return
    const children = scroll.getChildren()
    const target = children[index]
    if (!target) return
    const y = target.y - scroll.y
    if (y >= scroll.height) {
      scroll.scrollBy(y - scroll.height + 1)
    } else if (y < 0) {
      scroll.scrollBy(y)
      if (index === 0) scroll.scrollTo(0)
    }
  }

  function getActiveScroll(): ScrollBoxRenderable | undefined {
    const tab = activeTab()
    if (tab === "installed") return installedScroll
    if (tab === "marketplace") return marketplaceScroll
    return undefined
  }

  // Clamp selectedIndex when list shrinks (e.g. after install/remove)
  createEffect(() => {
    const tab = activeTab()
    const len = tab === "installed" ? plugins().length
      : tab === "marketplace" ? marketplacePlugins().length
      : 0
    if (len === 0) setSelectedIndex(0)
    else if (selectedIndex() >= len) setSelectedIndex(len - 1)
  })

  // Scroll to follow selection changes
  createEffect(
    on(selectedIndex, (idx) => {
      scrollToSelected(getActiveScroll(), idx)
    }),
  )

  function nextTab() {
    const idx = tabs.indexOf(activeTab())
    setActiveTab(tabs[(idx + 1) % tabs.length])
    setSelectedIndex(0)
  }

  function prevTab() {
    const idx = tabs.indexOf(activeTab())
    setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length])
    setSelectedIndex(0)
  }

  async function globalPlugins() {
    const res = await sdk.client.global.config.get()
    return res.data?.plugin ?? []
  }

  async function installPlugin(spec: string) {
    if (loading()) return
    setLoading(true)
    try {
      const current = await globalPlugins()
      await sdk.client.global.config.update({ config: { plugin: [...current, spec] } })
    } finally {
      setLoading(false)
    }
  }

  async function removePlugin(raw: string) {
    if (loading()) return
    setLoading(true)
    try {
      const current = await globalPlugins()
      await sdk.client.global.config.update({ config: { plugin: current.filter((p) => p !== raw) } })
    } finally {
      setLoading(false)
    }
  }

  async function addPlugin(input: string) {
    if (!input.trim() || loading()) return
    setLoading(true)
    try {
      const current = await globalPlugins()
      await sdk.client.global.config.update({ config: { plugin: [...current, input.trim()] } })
      setAddInput("")
    } finally {
      setLoading(false)
    }
  }

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      dialog.clear()
      return
    }

    if (evt.name === "tab" && evt.shift) {
      prevTab()
      return
    }
    if (evt.name === "tab") {
      nextTab()
      return
    }

    const tab = activeTab()

    if (tab === "installed") {
      const list = plugins()
      if (list.length === 0) return
      if (evt.name === "up") {
        setSelectedIndex((i) => Math.max(0, i - 1))
      } else if (evt.name === "down") {
        setSelectedIndex((i) => Math.min(list.length - 1, i + 1))
      } else if (evt.name === "return" || evt.name === "d" || evt.name === "x") {
        const item = list[selectedIndex()]
        if (item) removePlugin(item.raw)
      }
    }

    if (tab === "marketplace") {
      const list = marketplacePlugins()
      if (list.length === 0) return
      if (evt.name === "up") {
        setSelectedIndex((i) => Math.max(0, i - 1))
      } else if (evt.name === "down") {
        setSelectedIndex((i) => Math.min(list.length - 1, i + 1))
      } else if (evt.name === "return") {
        const item = list[selectedIndex()]
        if (item) installPlugin(item.spec)
      }
    }

    if (tab === "add") {
      if (evt.name === "return") {
        addPlugin(addInput())
      } else if (evt.name === "backspace") {
        setAddInput((v) => v.slice(0, -1))
      } else if (evt.sequence && evt.sequence.length === 1 && !evt.ctrl && !evt.meta) {
        setAddInput((v) => v + evt.sequence)
      }
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Plugin Manager
        </text>
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={hover() ? theme.primary : undefined}
          onMouseOver={() => setHover(true)}
          onMouseOut={() => setHover(false)}
          onMouseUp={() => dialog.clear()}
        >
          <text fg={hover() ? theme.selectedListItemText : theme.textMuted}>esc</text>
        </box>
      </box>

      {/* Tab bar */}
      <box flexDirection="row" gap={2}>
        <For each={tabs}>
          {(tab) => (
            <box
              onMouseUp={() => {
                setActiveTab(tab)
                setSelectedIndex(0)
              }}
            >
              <text
                fg={activeTab() === tab ? theme.text : theme.textMuted}
                attributes={activeTab() === tab ? TextAttributes.BOLD | TextAttributes.UNDERLINE : 0}
              >
                {tabLabels[tab]}
              </text>
            </box>
          )}
        </For>
        <text fg={theme.textMuted}>Tab/Shift+Tab to switch</text>
      </box>

      {/* Loading indicator */}
      <Show when={loading()}>
        <Spinner color={theme.accent}>Working...</Spinner>
      </Show>

      {/* Tab content */}
      <Switch>
        {/* Installed tab */}
        <Match when={activeTab() === "installed"}>
          <Show
            when={plugins().length > 0}
            fallback={<text fg={theme.textMuted}>No plugins installed</text>}
          >
            <text fg={theme.textMuted}>
              {plugins().length} plugin{plugins().length !== 1 ? "s" : ""} installed — Enter/x to
              remove
            </text>
            <scrollbox
              maxHeight={maxListHeight()}
              ref={(r: ScrollBoxRenderable) => (installedScroll = r)}
              scrollbarOptions={{ visible: false }}
            >
              <For each={plugins()}>
                {(item, index) => (
                  <box
                    backgroundColor={
                      selectedIndex() === index() ? theme.primary : undefined
                    }
                    onMouseUp={() => {
                      setSelectedIndex(index())
                      if (!loading()) removePlugin(item.raw)
                    }}
                    paddingLeft={1}
                    paddingRight={1}
                  >
                    <text
                      fg={
                        selectedIndex() === index()
                          ? theme.selectedListItemText
                          : theme.text
                      }
                    >
                      <b>{item.name}</b>
                      {item.version && (
                        <span style={{ fg: theme.textMuted }}> @{item.version}</span>
                      )}
                      {" "}
                      <span
                        style={{
                          fg: item.source === "file" ? theme.warning : item.source === "cc" ? theme.accent : theme.success,
                        }}
                      >
                        [{item.source === "cc" ? "CC" : item.source}]
                      </span>
                    </text>
                  </box>
                )}
              </For>
            </scrollbox>
          </Show>
        </Match>

        {/* Marketplace tab (unified from all sources) */}
        <Match when={activeTab() === "marketplace"}>
          <Show when={!allMarketplace.loading} fallback={<Spinner color={theme.accent}>Loading marketplace...</Spinner>}>
            <Show
              when={marketplacePlugins().length > 0}
              fallback={
                <text fg={theme.textMuted}>
                  {allMarketplace() ? "All marketplace plugins are installed" : "Could not load marketplaces"}
                </text>
              }
            >
              <text fg={theme.textMuted}>
                {marketplacePlugins().length} available — Enter to install
              </text>
              <scrollbox
                maxHeight={maxListHeight()}
                ref={(r: ScrollBoxRenderable) => (marketplaceScroll = r)}
                scrollbarOptions={{ visible: false }}
              >
                <For each={marketplacePlugins()}>
                  {(item, index) => (
                    <box
                      paddingLeft={1}
                      paddingRight={1}
                      backgroundColor={
                        selectedIndex() === index() ? theme.primary : undefined
                      }
                      onMouseUp={() => {
                        setSelectedIndex(index())
                        if (!loading()) installPlugin(item.spec)
                      }}
                    >
                      <text
                        fg={
                          selectedIndex() === index()
                            ? theme.selectedListItemText
                            : theme.text
                        }
                      >
                        <b>{item.name}</b>{" "}
                        <span style={{ fg: theme.accent }}>[{item.source}]</span>{" "}
                        <span style={{ fg: theme.textMuted }}>
                          — {item.description}
                        </span>
                      </text>
                    </box>
                  )}
                </For>
              </scrollbox>
            </Show>
          </Show>
        </Match>

        {/* Add tab */}
        <Match when={activeTab() === "add"}>
          <text fg={theme.textMuted}>
            Enter a plugin spec to add directly:
          </text>
          <text fg={theme.textMuted}>
            npm: package-name  |  npm: package@version
          </text>
          <text fg={theme.textMuted}>
            cc:  github:user/repo/path  |  github:user/repo
          </text>
          <box flexDirection="row" gap={1} marginTop={1}>
            <text fg={theme.accent}>{">"}</text>
            <text fg={theme.text}>
              {addInput()}
              <span style={{ fg: theme.accent }}>█</span>
            </text>
          </box>
          <Show when={addInput().trim().length > 0}>
            <text fg={theme.textMuted} marginTop={1}>
              Press Enter to add "{addInput().trim()}"
            </text>
          </Show>
          <text fg={theme.textMuted} marginTop={1}>
            Tip: /plugin install {"<name>"} to search marketplaces
          </text>
        </Match>
      </Switch>
    </box>
  )
}
