import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { VoiceInput } from "../../voice/voice"
import { Server } from "../../server/server"
import { createLobsterClient } from "@lobster-ai/sdk/v2"
import { EOL } from "os"

export const VoiceCommand = cmd({
  command: "voice",
  describe: "record voice and send transcribed text as a message",
  builder: (yargs: Argv) => {
    return yargs
      .option("duration", {
        alias: ["d"],
        describe: "recording duration in seconds",
        type: "number",
        default: 10,
      })
      .option("model", {
        describe: "whisper model to use",
        type: "string",
        default: "whisper-1",
      })
      .option("session", {
        alias: ["s"],
        describe: "session id to continue",
        type: "string",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("transcribe-only", {
        describe: "only transcribe, do not send to session",
        type: "boolean",
        default: false,
      })
      .option("language", {
        alias: ["l"],
        describe: "language code (e.g., en, es, fr)",
        type: "string",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      UI.println(
        UI.Style.TEXT_INFO_BOLD + "~",
        UI.Style.TEXT_NORMAL + `Recording for ${args.duration} seconds... (speak now)`,
      )

      let text: string
      try {
        text = await VoiceInput.listen({
          duration: args.duration,
          model: args.model,
          language: args.language,
        })
      } catch (e) {
        UI.error(e instanceof Error ? e.message : String(e))
        process.exit(1)
        return
      }

      if (!text.trim()) {
        UI.println(UI.Style.TEXT_WARNING_BOLD + "!", UI.Style.TEXT_NORMAL + "No speech detected")
        process.exit(0)
        return
      }

      UI.empty()
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + ">", UI.Style.TEXT_NORMAL + " Transcribed:")
      UI.println(UI.Style.TEXT_DIM + text)
      UI.empty()

      if (args.transcribeOnly) {
        process.stdout.write(text + EOL)
        return
      }

      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        return Server.App().fetch(request)
      }) as typeof globalThis.fetch
      const sdk = createLobsterClient({ baseUrl: "http://lobster.internal", fetch: fetchFn })

      let sessionID: string | undefined
      if (args.continue) {
        const result = await sdk.session.list()
        sessionID = result.data?.find((s: { parentID?: string }) => !s.parentID)?.id
      } else if (args.session) {
        sessionID = args.session
      }

      if (!sessionID) {
        const title = "Voice: " + text.slice(0, 50) + (text.length > 50 ? "..." : "")
        const result = await sdk.session.create({ title })
        sessionID = result.data?.id
      }

      if (!sessionID) {
        UI.error("Failed to create or find session")
        process.exit(1)
        return
      }

      UI.println(
        UI.Style.TEXT_INFO_BOLD + "~",
        UI.Style.TEXT_NORMAL + `Sending to session ${sessionID.slice(0, 8)}...`,
      )

      await sdk.session.prompt({
        sessionID,
        parts: [{ type: "text", text }],
      })

      UI.println(UI.Style.TEXT_SUCCESS_BOLD + ">", UI.Style.TEXT_NORMAL + " Message sent")
    })
  },
})
