import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { exportReport } from "../../export/export"
import { Session } from "../../session"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"

export const ReportCommand = cmd({
  command: "report [sessionID]",
  describe: "export a session as a markdown report",
  builder: (yargs: Argv) => {
    return yargs
      .positional("sessionID", {
        describe: "session id to generate report for",
        type: "string",
      })
      .option("session", {
        describe: "session id (alternative to positional)",
        type: "string",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      let sessionID = args.sessionID ?? args.session

      if (!sessionID) {
        UI.empty()
        prompts.intro("Export Report", {
          output: process.stderr,
        })

        const sessions = []
        for await (const session of Session.list()) {
          sessions.push(session)
        }

        if (sessions.length === 0) {
          prompts.log.error("No sessions found", {
            output: process.stderr,
          })
          prompts.outro("Done", {
            output: process.stderr,
          })
          return
        }

        sessions.sort((a, b) => b.time.updated - a.time.updated)

        const selectedSession = await prompts.autocomplete({
          message: "Select session to export",
          maxItems: 10,
          options: sessions.map((session) => ({
            label: session.title,
            value: session.id,
            hint: `${new Date(session.time.updated).toLocaleString()} - ${session.id.slice(-8)}`,
          })),
          output: process.stderr,
        })

        if (prompts.isCancel(selectedSession)) {
          throw new UI.CancelledError()
        }

        sessionID = selectedSession as string

        prompts.outro("Generating report...", {
          output: process.stderr,
        })
      }

      await exportReport(sessionID!)
    })
  },
})
