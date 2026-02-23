const CONTROL_CHAR = /[\u0000-\u001f\u007f-\u009f]/

function removeLastCodePoint(input: string) {
  if (!input) return input
  const lastIndex = input.length - 1
  const last = input.charCodeAt(lastIndex)
  if (Number.isNaN(last)) return input
  if (lastIndex > 0 && last >= 0xdc00 && last <= 0xdfff) {
    const prev = input.charCodeAt(lastIndex - 1)
    if (prev >= 0xd800 && prev <= 0xdbff) return input.slice(0, -2)
  }
  return input.slice(0, -1)
}

export function normalizePromptInput(input: string) {
  let output = ""
  for (const char of input) {
    if (char === "\b" || char === "\u007f") {
      output = removeLastCodePoint(output)
      continue
    }
    if (CONTROL_CHAR.test(char)) continue
    output += char
  }
  return output
}
