import type { FileInfo } from "./indexer.js"

export interface ScoredFile {
  path: string
  score: number
  size: number
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "this", "that", "are", "was",
  "be", "has", "had", "not", "no", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "if", "then", "else", "when",
  "up", "out", "so", "as", "all", "each", "every", "both", "few", "more",
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\W_]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

export function findRelevant(
  query: string,
  files: FileInfo[],
  maxResults: number
): ScoredFile[] {
  const queryTerms = tokenize(query)
  if (queryTerms.length === 0) {
    return []
  }

  const docCount = files.length
  if (docCount === 0) {
    return []
  }

  const docFreq: Record<string, number> = {}
  for (const file of files) {
    const uniqueTerms = new Set(file.terms)
    for (const term of uniqueTerms) {
      docFreq[term] = (docFreq[term] || 0) + 1
    }
  }

  const scored: ScoredFile[] = []

  for (const file of files) {
    const termCounts: Record<string, number> = {}
    for (const term of file.terms) {
      termCounts[term] = (termCounts[term] || 0) + 1
    }

    const totalTerms = file.terms.length || 1
    let score = 0

    for (const qt of queryTerms) {
      const tf = (termCounts[qt] || 0) / totalTerms
      const df = docFreq[qt] || 0
      if (df === 0) {
        continue
      }
      const idf = Math.log(docCount / df)
      score += tf * idf
    }

    if (score > 0) {
      scored.push({
        path: file.relativePath,
        score,
        size: file.size,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxResults)
}
