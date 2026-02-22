import { afterAll, beforeEach, expect, mock, test } from "bun:test"

let streamableStartCalls = 0
let streamableFailuresBeforeSuccess = 0
let sseStartCalls = 0
let listToolsCalls = 0
let currentToolName = "ping"
let toolsChangedHandler: (() => Promise<void> | void) | undefined

mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTP {
    constructor(_url: URL) {}
    async start() {
      streamableStartCalls++
      if (streamableStartCalls <= streamableFailuresBeforeSuccess) {
        throw new Error("ECONNRESET simulated transient failure")
      }
    }
    async finishAuth(_code: string) {}
  },
}))

mock.module("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class MockSSE {
    constructor(_url: URL) {}
    async start() {
      sseStartCalls++
      throw new Error("SSE transport should not be used in this test")
    }
  },
}))

mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    setNotificationHandler(_schema: unknown, handler: () => Promise<void> | void) {
      toolsChangedHandler = handler
    }

    async connect(transport: { start: () => Promise<void> }) {
      await transport.start()
    }

    async listTools() {
      listToolsCalls++
      return {
        tools: [
          {
            name: currentToolName,
            description: `Tool ${currentToolName}`,
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      }
    }

    async listPrompts() {
      return { prompts: [] }
    }

    async listResources() {
      return { resources: [] }
    }

    async callTool() {
      return {
        content: [],
        isError: false,
      }
    }

    async close() {}
  },
}))

class MockUnauthorizedError extends Error {}
mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: MockUnauthorizedError,
}))

beforeEach(() => {
  streamableStartCalls = 0
  streamableFailuresBeforeSuccess = 0
  sseStartCalls = 0
  listToolsCalls = 0
  currentToolName = "ping"
  toolsChangedHandler = undefined
})

afterAll(() => {
  mock.restore()
})

const { MCP } = await import("../../src/mcp/index")
const { Instance } = await import("../../src/project/instance")
const { tmpdir } = await import("../fixture/fixture")

test("MCP create retries transient remote connect failures with backoff", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/lobster.json`,
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      streamableFailuresBeforeSuccess = 1

      const added = await MCP.add("retry-server", {
        type: "remote",
        url: "https://example.com/mcp",
      })

      const statusMap = added.status as Record<string, { status: string }>
      expect(statusMap["retry-server"]?.status).toBe("connected")
      expect(streamableStartCalls).toBe(2)
      expect(sseStartCalls).toBe(0)
    },
  })
})

test("MCP tools() reuses cached converted tools within TTL", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/lobster.json`,
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await MCP.add("cache-server", {
        type: "remote",
        url: "https://example.com/mcp",
      })

      const first = await MCP.tools()
      const firstKey = Object.keys(first)[0]
      expect(firstKey).toContain("cache-server_ping")
      expect(listToolsCalls).toBe(2) // 1 from create() validation + 1 from first tools()

      const second = await MCP.tools()
      expect(listToolsCalls).toBe(2)
      expect(second[firstKey]).toBe(first[firstKey])
    },
  })
})

test("MCP tools cache invalidates when tool list changed notification arrives", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/lobster.json`,
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await MCP.add("notify-server", {
        type: "remote",
        url: "https://example.com/mcp",
      })

      const first = await MCP.tools()
      expect(Object.keys(first)[0]).toContain("notify-server_ping")
      expect(listToolsCalls).toBe(2) // 1 from create() validation + 1 from first tools()

      currentToolName = "pong"
      await toolsChangedHandler?.()

      const second = await MCP.tools()
      expect(Object.keys(second)[0]).toContain("notify-server_pong")
      expect(listToolsCalls).toBe(3)
    },
  })
})
