/** @jsxImportSource react */
import { createContext, useContext, useState, useMemo, type ReactNode } from "react"
import path from "path"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

// Hex color string for Ink compatibility
type HexColor = string

export interface ThemeColors {
  primary: HexColor
  secondary: HexColor
  accent: HexColor
  error: HexColor
  warning: HexColor
  success: HexColor
  info: HexColor
  text: HexColor
  textMuted: HexColor
  selectedListItemText: HexColor
  background: HexColor
  backgroundPanel: HexColor
  backgroundElement: HexColor
  backgroundMenu: HexColor
  border: HexColor
  borderActive: HexColor
  borderSubtle: HexColor
  diffAdded: HexColor
  diffRemoved: HexColor
  diffContext: HexColor
  diffHunkHeader: HexColor
  diffHighlightAdded: HexColor
  diffHighlightRemoved: HexColor
  diffAddedBg: HexColor
  diffRemovedBg: HexColor
  diffContextBg: HexColor
  diffLineNumber: HexColor
  diffAddedLineNumberBg: HexColor
  diffRemovedLineNumberBg: HexColor
  markdownText: HexColor
  markdownHeading: HexColor
  markdownLink: HexColor
  markdownLinkText: HexColor
  markdownCode: HexColor
  markdownBlockQuote: HexColor
  markdownEmph: HexColor
  markdownStrong: HexColor
  markdownHorizontalRule: HexColor
  markdownListItem: HexColor
  markdownListEnumeration: HexColor
  markdownImage: HexColor
  markdownImageText: HexColor
  markdownCodeBlock: HexColor
}

type ColorValue = string | { dark: string; light: string }
type ThemeJson = {
  $schema?: string
  defs?: Record<string, string>
  theme: Record<string, ColorValue | number>
}

// Default themes — imported lazily from the same JSON files used by old TUI
// We store the JSON at the same location, resolve at runtime
import aura from "../tui/context/theme/aura.json" with { type: "json" }
import ayu from "../tui/context/theme/ayu.json" with { type: "json" }
import catppuccin from "../tui/context/theme/catppuccin.json" with { type: "json" }
import catppuccinFrappe from "../tui/context/theme/catppuccin-frappe.json" with { type: "json" }
import catppuccinMacchiato from "../tui/context/theme/catppuccin-macchiato.json" with { type: "json" }
import cobalt2 from "../tui/context/theme/cobalt2.json" with { type: "json" }
import cursor from "../tui/context/theme/cursor.json" with { type: "json" }
import dracula from "../tui/context/theme/dracula.json" with { type: "json" }
import everforest from "../tui/context/theme/everforest.json" with { type: "json" }
import flexoki from "../tui/context/theme/flexoki.json" with { type: "json" }
import github from "../tui/context/theme/github.json" with { type: "json" }
import gruvbox from "../tui/context/theme/gruvbox.json" with { type: "json" }
import kanagawa from "../tui/context/theme/kanagawa.json" with { type: "json" }
import material from "../tui/context/theme/material.json" with { type: "json" }
import matrix from "../tui/context/theme/matrix.json" with { type: "json" }
import mercury from "../tui/context/theme/mercury.json" with { type: "json" }
import monokai from "../tui/context/theme/monokai.json" with { type: "json" }
import nightowl from "../tui/context/theme/nightowl.json" with { type: "json" }
import nord from "../tui/context/theme/nord.json" with { type: "json" }
import osakaJade from "../tui/context/theme/osaka-jade.json" with { type: "json" }
import onedark from "../tui/context/theme/one-dark.json" with { type: "json" }
import opencode from "../tui/context/theme/opencode.json" with { type: "json" }
import orng from "../tui/context/theme/orng.json" with { type: "json" }
import lucentOrng from "../tui/context/theme/lucent-orng.json" with { type: "json" }
import palenight from "../tui/context/theme/palenight.json" with { type: "json" }
import rosepine from "../tui/context/theme/rosepine.json" with { type: "json" }
import solarized from "../tui/context/theme/solarized.json" with { type: "json" }
import synthwave84 from "../tui/context/theme/synthwave84.json" with { type: "json" }
import tokyonight from "../tui/context/theme/tokyonight.json" with { type: "json" }
import vercel from "../tui/context/theme/vercel.json" with { type: "json" }
import vesper from "../tui/context/theme/vesper.json" with { type: "json" }
import zenburn from "../tui/context/theme/zenburn.json" with { type: "json" }
import carbonfox from "../tui/context/theme/carbonfox.json" with { type: "json" }
import lobster from "../tui/context/theme/lobster.json" with { type: "json" }

export const DEFAULT_THEMES: Record<string, ThemeJson> = {
  aura, ayu, catppuccin,
  "catppuccin-frappe": catppuccinFrappe,
  "catppuccin-macchiato": catppuccinMacchiato,
  cobalt2, cursor, dracula, everforest, flexoki, github, gruvbox, kanagawa,
  material, matrix, mercury, monokai, nightowl, nord,
  "one-dark": onedark,
  "osaka-jade": osakaJade,
  opencode, orng,
  "lucent-orng": lucentOrng,
  palenight, rosepine, solarized, synthwave84, tokyonight, vesper, vercel,
  zenburn, carbonfox, lobster,
} as Record<string, ThemeJson>

function resolveColor(value: ColorValue, mode: "dark" | "light", defs: Record<string, string>, theme: Record<string, ColorValue | number>): string {
  if (typeof value === "number") return ansiToHex(value)
  if (typeof value === "string") {
    if (value === "transparent" || value === "none") return ""
    if (value.startsWith("#")) return value
    if (defs[value] != null) return resolveColor(defs[value], mode, defs, theme)
    if (theme[value] !== undefined) return resolveColor(theme[value] as ColorValue, mode, defs, theme)
    return "#000000"
  }
  return resolveColor(value[mode], mode, defs, theme)
}

function ansiToHex(code: number): string {
  const ansiColors = [
    "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
    "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
  ]
  if (code < 16) return ansiColors[code] ?? "#000000"
  if (code < 232) {
    const i = code - 16
    const b = i % 6, g = Math.floor(i / 6) % 6, r = Math.floor(i / 36)
    const v = (x: number) => x === 0 ? 0 : x * 40 + 55
    return `#${v(r).toString(16).padStart(2, "0")}${v(g).toString(16).padStart(2, "0")}${v(b).toString(16).padStart(2, "0")}`
  }
  if (code < 256) {
    const gray = (code - 232) * 10 + 8
    const hex = gray.toString(16).padStart(2, "0")
    return `#${hex}${hex}${hex}`
  }
  return "#000000"
}

export function resolveTheme(themeJson: ThemeJson, mode: "dark" | "light"): ThemeColors {
  const defs = themeJson.defs ?? {}
  const t = themeJson.theme
  const resolve = (key: string): string => {
    const val = t[key]
    if (val === undefined) return "#000000"
    return resolveColor(val as ColorValue, mode, defs, t)
  }

  const colors: Record<string, string> = {}
  const themeKeys: (keyof ThemeColors)[] = [
    "primary", "secondary", "accent", "error", "warning", "success", "info",
    "text", "textMuted", "background", "backgroundPanel", "backgroundElement",
    "border", "borderActive", "borderSubtle",
    "diffAdded", "diffRemoved", "diffContext", "diffHunkHeader",
    "diffHighlightAdded", "diffHighlightRemoved",
    "diffAddedBg", "diffRemovedBg", "diffContextBg", "diffLineNumber",
    "diffAddedLineNumberBg", "diffRemovedLineNumberBg",
    "markdownText", "markdownHeading", "markdownLink", "markdownLinkText",
    "markdownCode", "markdownBlockQuote", "markdownEmph", "markdownStrong",
    "markdownHorizontalRule", "markdownListItem", "markdownListEnumeration",
    "markdownImage", "markdownImageText", "markdownCodeBlock",
  ]

  for (const key of themeKeys) {
    colors[key] = resolve(key)
  }

  // Optional keys with fallbacks
  colors.selectedListItemText = t.selectedListItemText !== undefined
    ? resolveColor(t.selectedListItemText as ColorValue, mode, defs, t)
    : colors.background
  colors.backgroundMenu = t.backgroundMenu !== undefined
    ? resolveColor(t.backgroundMenu as ColorValue, mode, defs, t)
    : colors.backgroundElement

  return colors as unknown as ThemeColors
}

const CUSTOM_THEME_GLOB = new Bun.Glob("themes/*.json")
async function getCustomThemes(): Promise<Record<string, ThemeJson>> {
  const directories = [
    Global.Path.config,
    ...(await Array.fromAsync(
      Filesystem.up({ targets: [".lobster"], start: process.cwd() }),
    )),
  ]
  const result: Record<string, ThemeJson> = {}
  for (const dir of directories) {
    for await (const item of CUSTOM_THEME_GLOB.scan({
      absolute: true,
      followSymlinks: true,
      dot: true,
      cwd: dir,
    })) {
      const name = path.basename(item, ".json")
      result[name] = await Bun.file(item).json()
    }
  }
  return result
}

// React context
interface ThemeContextValue {
  theme: ThemeColors
  selected: string
  mode: "dark" | "light"
  setMode: (mode: "dark" | "light") => void
  set: (name: string) => void
  all: () => Record<string, ThemeJson>
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider(props: {
  mode: "dark" | "light"
  configTheme?: string
  children: ReactNode
}) {
  const [themes, setThemes] = useState<Record<string, ThemeJson>>(DEFAULT_THEMES)
  const [mode, setMode] = useState(props.mode)
  const [active, setActive] = useState(props.configTheme ?? "lobster")

  // Load custom themes on mount
  useState(() => {
    getCustomThemes()
      .then((custom) => setThemes((prev) => ({ ...prev, ...custom })))
      .catch(() => setActive("lobster"))
  })

  const resolved = useMemo(
    () => resolveTheme(themes[active] ?? themes.lobster, mode),
    [themes, active, mode],
  )

  const value: ThemeContextValue = {
    theme: resolved,
    selected: active,
    mode,
    setMode,
    set: setActive,
    all: () => themes,
  }

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
