/** @jsxImportSource react */
import { Box, Text } from "ink"

const MASCOT_COLOR = "#ff5a1f"
const MASCOT = [
  "    \u2588      \u2588",
  "     \u2588    \u2588",
  "  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "  \u2588\u2588  \u2588\u2588\u2588\u2588  \u2588\u2588",
  "  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  " \u2588\u2588  \u2588\u2588  \u2588\u2588  \u2588\u2588",
]

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {MASCOT.map((line, index) => (
        <Text key={`mascot-${index}`} color={MASCOT_COLOR} bold>
          {line}
        </Text>
      ))}
    </Box>
  )
}
