export namespace Token {
  /**
   * Approximate characters per token ratio. This is a rough heuristic and will
   * not match exact tokenizer output from providers like OpenAI or Anthropic.
   * For precise counts, consider using a dedicated tokenizer library (e.g. tiktoken).
   */
  const CHARS_PER_TOKEN = 4

  /**
   * Returns an approximate token count for the given string.
   * This is a fast heuristic (chars / 4) and may differ from actual tokenizer results.
   */
  export function estimate(input: string) {
    return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
  }
}
