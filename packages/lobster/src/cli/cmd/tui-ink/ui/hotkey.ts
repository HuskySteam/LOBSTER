import type { Key } from "ink"

function ctrlCodeForLetter(letter: string): number | undefined {
  if (!letter || letter.length !== 1) return
  const lower = letter.toLowerCase()
  const code = lower.charCodeAt(0) - 96
  if (code < 1 || code > 26) return
  return code
}

export function isCtrlCharacterForLetter(ch: string | undefined, letter: string): boolean {
  if (!ch) return false
  const code = ctrlCodeForLetter(letter)
  if (!code) return false
  return ch === String.fromCharCode(code)
}

export function isCtrlShortcut(
  ch: string | undefined,
  key: Key,
  letter: string,
  options?: { allowControlChar?: boolean },
): boolean {
  const lowered = letter.toLowerCase()
  if ((key.ctrl ?? false) && ch?.toLowerCase() === lowered) return true
  const runtimeKey = key as Key & { name?: string; sequence?: string }
  if ((key.ctrl ?? false) && runtimeKey.name?.toLowerCase() === lowered) return true
  if (options?.allowControlChar === false) return false
  if (isCtrlCharacterForLetter(ch, lowered)) return true
  return isCtrlCharacterForLetter(runtimeKey.sequence, lowered)
}
