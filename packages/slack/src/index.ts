import { App } from "@slack/bolt"
import { createLobster, type ToolPart } from "@lobster-ai/sdk"

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
})

console.log("🔧 Bot configuration:")
console.log("- Bot token present:", !!process.env.SLACK_BOT_TOKEN)
console.log("- Signing secret present:", !!process.env.SLACK_SIGNING_SECRET)
console.log("- App token present:", !!process.env.SLACK_APP_TOKEN)

console.log("🚀 Starting opencode server...")
const opencode = await createLobster({
  port: 0,
})
console.log("✅ Opencode server ready")

const MAX_SESSIONS = 1000
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const EVENT_BACKOFF_BASE_MS = 500
const EVENT_BACKOFF_MAX_MS = 10_000

const sessions = new Map<string, { client: any; server: any; sessionId: string; channel: string; thread: string; lastAccessed: number }>()
const sessionIdToKey = new Map<string, string>()

function evictStaleSessions() {
  const now = Date.now()
  for (const [key, session] of sessions.entries()) {
    if (now - session.lastAccessed > SESSION_TTL_MS) {
      sessionIdToKey.delete(session.sessionId)
      sessions.delete(key)
    }
  }
  if (sessions.size <= MAX_SESSIONS) return
  const sorted = [...sessions.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)
  const toRemove = sorted.slice(0, sessions.size - MAX_SESSIONS)
  for (const [key, session] of toRemove) {
    sessionIdToKey.delete(session.sessionId)
    sessions.delete(key)
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function subscribeToEventsForever() {
  let reconnectAttempt = 0

  while (true) {
    try {
      const events = await opencode.client.event.subscribe()
      reconnectAttempt = 0

      for await (const event of events.stream) {
        try {
          if (event.type !== "message.part.updated") continue
          const part = event.properties.part
          if (part.type !== "tool") continue

          const sessionKey = sessionIdToKey.get(part.sessionID)
          if (!sessionKey) continue

          const session = sessions.get(sessionKey)
          if (!session) continue

          session.lastAccessed = Date.now()
          await handleToolUpdate(part, session.channel, session.thread)
        } catch (error) {
          console.error("âŒ Failed to process stream event:", error)
        }
      }

      console.warn("âš ï¸ Event stream closed, reconnecting...")
    } catch (error) {
      console.error("âš ï¸ Event stream failed, reconnecting:", error)
    }

    reconnectAttempt += 1
    const backoffMs = Math.min(EVENT_BACKOFF_BASE_MS * 2 ** (reconnectAttempt - 1), EVENT_BACKOFF_MAX_MS)
    await sleep(backoffMs)
  }
}

void subscribeToEventsForever()

async function handleToolUpdate(part: ToolPart, channel: string, thread: string) {
  if (part.state.status !== "completed") return
  const toolMessage = `*${part.tool}* - ${part.state.title}`
  await app.client.chat
    .postMessage({
      channel,
      thread_ts: thread,
      text: toolMessage,
    })
    .catch(() => {})
}

app.use(async ({ next }) => {
  await next()
})

app.message(async ({ message, say }) => {
  console.log("Received message event")

  if (message.subtype || !("text" in message) || !message.text) {
    console.log("⏭️ Skipping message - no text or has subtype")
    return
  }

  console.log("✅ Processing message:", message.text)

  const channel = message.channel
  const thread = (message as any).thread_ts || message.ts
  const sessionKey = `${channel}-${thread}`

  evictStaleSessions()

  let session = sessions.get(sessionKey)
  if (session) {
    session.lastAccessed = Date.now()
  }

  if (!session) {
    console.log("🆕 Creating new opencode session...")
    const { client, server } = opencode

    const createResult = await client.session.create({
      body: { title: `Slack thread ${thread}` },
    })

    if (createResult.error) {
      console.error("❌ Failed to create session:", createResult.error)
      await say({
        text: "Sorry, I had trouble creating a session. Please try again.",
        thread_ts: thread,
      })
      return
    }

    console.log("✅ Created opencode session:", createResult.data.id)

    session = { client, server, sessionId: createResult.data.id, channel, thread, lastAccessed: Date.now() }
    sessions.set(sessionKey, session)
    sessionIdToKey.set(createResult.data.id, sessionKey)
    evictStaleSessions()

    const shareResult = await client.session.share({ path: { id: createResult.data.id } })
    if (!shareResult.error && shareResult.data) {
      const sessionUrl = shareResult.data.share?.url!
      console.log("🔗 Session shared:", sessionUrl)
      await app.client.chat.postMessage({ channel, thread_ts: thread, text: sessionUrl })
    }
  }

  console.log("Sending message to opencode")
  const result = await session.client.session.prompt({
    path: { id: session.sessionId },
    body: { parts: [{ type: "text", text: message.text }] },
  })

  console.log("Opencode response received, error:", !!result.error)

  if (result.error) {
    console.error("❌ Failed to send message:", result.error)
    await say({
      text: "Sorry, I had trouble processing your message. Please try again.",
      thread_ts: thread,
    })
    return
  }

  const response = result.data

  // Build response text
  const responseText =
    response.info?.content ||
    response.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n") ||
    "I received your message but didn't have a response."

  console.log("💬 Sending response:", responseText)

  // Send main response (tool updates will come via live events)
  await say({ text: responseText, thread_ts: thread })
})

app.command("/test", async ({ command, ack, say }) => {
  await ack()
  console.log("🧪 Test command received:", JSON.stringify(command, null, 2))
  await say("🤖 Bot is working! I can hear you loud and clear.")
})

await app.start()
console.log("⚡️ Slack bot is running!")
