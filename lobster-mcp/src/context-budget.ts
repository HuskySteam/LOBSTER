export interface FileTokenEstimate {
  path: string
  tokens: number
  size: number
}

export interface TokenEstimate {
  files: FileTokenEstimate[]
  total: number
}

const CHARS_PER_TOKEN = 4

export function estimateTokens(
  files: Array<{ path: string, size: number }>
): TokenEstimate {
  const estimates: FileTokenEstimate[] = []
  let total = 0

  for (const file of files) {
    const tokens = Math.ceil(file.size / CHARS_PER_TOKEN)
    total += tokens
    estimates.push({
      path: file.path,
      tokens,
      size: file.size,
    })
  }

  return {
    files: estimates,
    total,
  }
}
