import { describe, expect, test } from "bun:test"
import { Storage } from "../../src/storage/storage"
import { MessageV2 } from "../../src/session/message-v2"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

function nowId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function orderedMessageIDs() {
  const scope = `${Date.now()}_${Math.random().toString(16).slice(2)}`
  return {
    first: `msg_${scope}_0001`,
    second: `msg_${scope}_0002`,
  }
}

async function putMessage(sessionID: string, messageID: string) {
  await Storage.write(["message", sessionID, messageID], {
    id: messageID,
    sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: "user",
    model: { providerID: "test", modelID: "test-model" },
  } as MessageV2.Info)
}

async function putTextPart(sessionID: string, messageID: string, partID: string, text: string) {
  await Storage.write(["part", messageID, partID], {
    id: partID,
    sessionID,
    messageID,
    type: "text",
    text,
  } as MessageV2.TextPart)
}

describe("session.message-v2.stream", () => {
  test("returns messages newest-first", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = nowId("ses")
        const { first: msg1, second: msg2 } = orderedMessageIDs()
        await putMessage(sessionID, msg1)
        await putMessage(sessionID, msg2)
        await putTextPart(sessionID, msg1, nowId("prt"), "one")
        await putTextPart(sessionID, msg2, nowId("prt"), "two")

        const result = await Array.fromAsync(MessageV2.stream(sessionID))
        expect(result.map((x) => x.info.id)).toEqual([msg2, msg1])
      },
    })
  })

  test("rememberMessageID keeps stream index in sync for newly written messages", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = nowId("ses")
        const { first: msg1, second: msg2 } = orderedMessageIDs()
        await putMessage(sessionID, msg1)
        await putTextPart(sessionID, msg1, nowId("prt"), "first")

        await Array.fromAsync(MessageV2.stream(sessionID))

        await putMessage(sessionID, msg2)
        await putTextPart(sessionID, msg2, nowId("prt"), "second")
        MessageV2.rememberMessageID(sessionID, msg2)

        const second = await Array.fromAsync(MessageV2.stream(sessionID))
        expect(second.map((x) => x.info.id)).toEqual([msg2, msg1])
      },
    })
  })
})
