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
  "Press {Escape} to go back from a session",
  "Use {/cost} to see token usage breakdown",
  "Add custom tools in {.lobster/tool/}",
  "Create custom agents in {.lobster/agent/}",
  "Use {/help} for a list of all commands",
  "Memory files in {.lobster/memory/} persist across sessions",
  "Reviewer agents are read-only — they cannot write files",
  "Use {Ctrl+T} to toggle the sidebar",
  "Configure providers in {lobster.jsonc}",
  "Run {lobster serve} for headless API mode",
  "Install plugins with {/plugin install name}",
  "Skills in {.lobster/skill/} add slash commands",
  "Use {lobster run \"msg\"} for one-shot CLI mode",
  "Press {Ctrl+C} to interrupt a running agent",
  "MCP servers connect via stdio, SSE, or HTTP",
  "Use {lobster auth} to manage API keys from CLI",
  "Custom commands go in {.lobster/command/}",
  "Use {lobster stats} to see cost statistics",
  "Agents can be assigned different models per task",
  "The team system coordinates architect, coder, reviewer, and tester",
]

export function Tips() {
  const { theme } = useTheme()
  const [tipIndex] = useState(() => Math.floor(Math.random() * TIPS.length))

  const tip = TIPS[tipIndex] ?? TIPS[0]
  const parts = tip.split(/\{([^}]+)\}/)

  return (
    <Box paddingLeft={2}>
      <Text color={theme.warning}>{"● "}</Text>
      <Text color={theme.textMuted}>Tip: </Text>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          <Text key={i} color={theme.textMuted}>{part}</Text>
        ) : (
          <Text key={i} color={theme.text}>{part}</Text>
        ),
      )}
    </Box>
  )
}
