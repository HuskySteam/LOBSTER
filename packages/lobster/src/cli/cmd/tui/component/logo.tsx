import { TextAttributes } from "@opentui/core"
import { For, type JSX } from "solid-js"
import { useTheme, tint } from "@tui/context/theme"
import { logo, decoChars } from "@/cli/logo"

// Shadow markers (rendered chars in parens):
// _ = full shadow cell (space with bg=shadow)
// ^ = letter top, shadow bottom (▀ with fg=letter, bg=shadow)
// ~ = shadow top only (▀ with fg=shadow)
// Decoration chars (\, /, >, <, (, )) render in accent color
const DECO_SET = new Set(decoChars)

export function Logo() {
  const { theme } = useTheme()

  const renderLine = (line: string): JSX.Element[] => {
    const fg = theme.text
    const accent = theme.accent
    const shadow = tint(theme.background, fg, 0.25)
    const attrs = TextAttributes.BOLD
    const elements: JSX.Element[] = []
    let textBuf = ""
    let decoBuf = ""

    const flushText = () => {
      if (textBuf) {
        elements.push(
          <text fg={fg} attributes={attrs} selectable={false}>
            {textBuf}
          </text>,
        )
        textBuf = ""
      }
    }

    const flushDeco = () => {
      if (decoBuf) {
        elements.push(
          <text fg={accent} selectable={false}>
            {decoBuf}
          </text>,
        )
        decoBuf = ""
      }
    }

    for (const ch of line) {
      if (DECO_SET.has(ch)) {
        flushText()
        decoBuf += ch
      } else if (ch === "_" || ch === "^" || ch === "~") {
        flushText()
        flushDeco()
        switch (ch) {
          case "_":
            elements.push(
              <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
                {" "}
              </text>,
            )
            break
          case "^":
            elements.push(
              <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
                ▀
              </text>,
            )
            break
          case "~":
            elements.push(
              <text fg={shadow} attributes={attrs} selectable={false}>
                ▀
              </text>,
            )
            break
        }
      } else {
        flushDeco()
        textBuf += ch
      }
    }

    flushText()
    flushDeco()

    return elements
  }

  return (
    <box>
      <For each={logo}>
        {(line) => (
          <box flexDirection="row">
            {renderLine(line)}
          </box>
        )}
      </For>
    </box>
  )
}
