import { Session } from "."
import { MessageV2 } from "./message-v2"
import { Log } from "../util/log"

export namespace SessionResume {
  const log = Log.create({ service: "session.resume" })

  export async function lastSession(): Promise<Session.Info | undefined> {
    const sessions: Session.Info[] = []
    for await (const session of Session.list()) {
      // Skip archived sessions
      if (session.time.archived) continue
      sessions.push(session)
    }
    // Sort by updated time descending
    sessions.sort((a, b) => b.time.updated - a.time.updated)
    // Return the most recently updated session (skip the current one if it exists)
    return sessions[0]
  }

  export async function summary(sessionID: string): Promise<string | undefined> {
    const msgs = await Session.messages({ sessionID }).catch(() => [])
    if (msgs.length === 0) return undefined

    // Single backward pass: prefer compaction summary, fall back to last assistant text
    let fallback: string | undefined
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (msg.info.role !== "assistant") continue
      const textParts = msg.parts
        .filter((p): p is MessageV2.TextPart => p.type === "text")
        .map((p) => p.text)
        .join("\n")
      if (!textParts.trim()) continue
      if ("summary" in msg.info && (msg.info as MessageV2.Assistant).summary) return textParts
      if (fallback === undefined) {
        fallback = textParts.length > 2000 ? textParts.slice(0, 2000) + "..." : textParts
      }
    }

    return fallback
  }

  export async function prompt(args?: string): Promise<string> {
    const session = await lastSession()
    if (!session) return "No previous session found to continue."

    log.info("resuming from session", { sessionID: session.id, title: session.title })
    const sessionSummary = await summary(session.id)

    const lines = [
      `Continuing from previous session: "${session.title}"`,
    ]

    if (sessionSummary) {
      lines.push("")
      lines.push("## Previous Session Summary")
      lines.push(sessionSummary)
    }

    lines.push("")
    lines.push("Continue the work from the previous session.")

    if (args?.trim()) {
      lines.push(args.trim())
    }

    return lines.join("\n")
  }
}
