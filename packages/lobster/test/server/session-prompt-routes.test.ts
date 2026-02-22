import { describe, expect, test } from "bun:test"
import path from "path"
import { Session } from "../../src/session"
import { SessionPrompt } from "../../src/session/prompt"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("session prompt routes", () => {
  test("prompt_async catches prompt rejections without unhandled rejection", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const app = Server.App()
        const session = await Session.create({})

        const originalPrompt = SessionPrompt.prompt
        const unhandled: unknown[] = []
        const onUnhandled = (reason: unknown) => {
          unhandled.push(reason)
        }

        ;(SessionPrompt as any).prompt = async () => {
          throw new Error("simulated prompt failure")
        }

        process.on("unhandledRejection", onUnhandled)
        try {
          const response = await app.request(`/session/${session.id}/prompt_async`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Lobster-CSRF": "1",
            },
            body: JSON.stringify({
              parts: [{ type: "text", text: "test" }],
            }),
          })

          expect(response.status).toBe(204)
          await new Promise((resolve) => setTimeout(resolve, 30))
          expect(unhandled).toEqual([])
        } finally {
          process.off("unhandledRejection", onUnhandled)
          ;(SessionPrompt as any).prompt = originalPrompt
          await Session.remove(session.id)
        }
      },
    })
  })
})
