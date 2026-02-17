/** @jsxImportSource react */
import { Box, Text } from "ink"
import React, { useState } from "react"
import { useTheme } from "../theme"

const TIPS = [
  "Press {Ctrl+P} to open the command palette",
  "Use {/connect} to add a new provider",
  "Press {Tab} to cycle through agents",
  "Press {Ctrl+M} to switch models",
  "Use {Ctrl+S} to browse sessions",
  "Use {/new} to start a fresh session",
  "Use {/status} to inspect providers, MCP, LSP, and formatters",
  "Use {/share} and {/unshare} to manage session links",
  "Use {/compact} to summarize long sessions",
  "Use {/undo} and {/redo} to move through session history",
  "Use {/copy} or {/export} to capture a transcript",
  "Use {/thinking} and {/timestamps} to control message visibility",
  "Use {/review}, {/findings}, {/health}, and {/patterns} for Lobster dashboards",
  "Use {/help} for quick shortcuts and guidance",
  "Manage plugins with {/plugin}, {/plugin list}, {/plugin install <spec>}, and {/plugin remove <name>}",
  "Add custom tools in {.lobster/tool/}",
  "Create custom agents in {.lobster/agent/}",
  "Skills in {.lobster/skill/} add slash command workflows",
  "Memory files in {.lobster/memory/} persist across sessions",
  "Custom commands go in {.lobster/command/}",
  "Press {Ctrl+T} to toggle the sidebar",
  "Run {lobster serve} for headless API mode",
  "Use {lobster run \"msg\"} for one-shot CLI mode",
]

export function Tips() {
  const { theme } = useTheme()
  const [tipIndex] = useState(() => Math.floor(Math.random() * TIPS.length))

  const tip = TIPS[tipIndex] ?? TIPS[0]
  const parts = tip.split(/\{([^}]+)\}/)

  return (
    <Box paddingLeft={2}>
      <Text color={theme.warning}>{"* "}</Text>
      <Text color={theme.textMuted}>Tip: </Text>
      {parts.map((part, index) =>
        index % 2 === 0 ? (
          <Text key={index} color={theme.textMuted}>{part}</Text>
        ) : (
          <Text key={index} color={theme.text}>{part}</Text>
        ),
      )}
    </Box>
  )
}
