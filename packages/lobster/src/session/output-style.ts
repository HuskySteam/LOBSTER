import { Config } from "../config/config"

export namespace OutputStyle {
  const STYLES: Record<string, string> = {
    concise: "Respond in 1-3 sentences. No preamble. Code only when asked.",
    verbose:
      "Explain your reasoning step by step. Show alternatives considered. Be thorough in explanations.",
    structured:
      "Use headers, bullet points, and code blocks. Organize information clearly. Be thorough.",
    educational:
      "Explain concepts as you work. Include examples. Teach the user as you solve their problem.",
  }

  export async function instruction(): Promise<string | undefined> {
    const config = await Config.get()
    const style = config.output_style
    if (!style) return undefined
    return STYLES[style]
  }
}
