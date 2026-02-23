const CONTROL_CHAR = /[\u0000-\u001f\u007f-\u009f]/

export function normalizePromptInput(input: string) {
  let output = ""
  for (const char of input) {
    if (char === "\b" || char === "\u007f") {
      output = output.slice(0, -1)
      continue
    }
    if (CONTROL_CHAR.test(char)) continue
    output += char
  }
  return output
}

