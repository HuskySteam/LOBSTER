import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  clearPluginMarketplaceCache,
  dedupeMarketplaceBySpec,
  findMarketplaceMatchesByName,
  getMarketplaceSources,
  isValidMarketplaceSource,
  loadPluginMarketplace,
  normalizeMarketplaceSource,
  pluginSpecName,
} from "../../../src/cli/cmd/tui-ink/component/plugin-marketplace"

describe("tui-ink plugin marketplace", () => {
  const originalFetch = globalThis.fetch
  const originalFetchTimeoutEnv = process.env.LOBSTER_PLUGIN_MARKETPLACE_FETCH_TIMEOUT_MS

  beforeEach(() => {
    clearPluginMarketplaceCache()
  })

  afterEach(() => {
    clearPluginMarketplaceCache()
    globalThis.fetch = originalFetch
    if (originalFetchTimeoutEnv === undefined) {
      delete process.env.LOBSTER_PLUGIN_MARKETPLACE_FETCH_TIMEOUT_MS
    } else {
      process.env.LOBSTER_PLUGIN_MARKETPLACE_FETCH_TIMEOUT_MS = originalFetchTimeoutEnv
    }
  })

  test("validates marketplace source format", () => {
    expect(isValidMarketplaceSource("anthropics/claude-code")).toBe(true)
    expect(isValidMarketplaceSource("Anthropics/Claude-Code")).toBe(true)
    expect(isValidMarketplaceSource("owner/repo-name")).toBe(true)
    expect(isValidMarketplaceSource("owner")).toBe(false)
    expect(isValidMarketplaceSource("owner/repo/path")).toBe(false)
  })

  test("deduplicates marketplace sources and appends default source", () => {
    const sources = getMarketplaceSources(["Foo/Bar", "foo/bar", " bad/source ", "Anthropics/Claude-Code"])
    expect(sources).toEqual(["foo/bar", "bad/source", "anthropics/claude-code"])
  })

  test("normalizes marketplace sources", () => {
    expect(normalizeMarketplaceSource("  Foo/Bar  ")).toBe("foo/bar")
  })

  test("extracts plugin names from specs", () => {
    expect(pluginSpecName("pkg@1.0.0")).toBe("pkg")
    expect(pluginSpecName("github:org/repo/plugins/cool")).toBe("cool")
    expect(pluginSpecName("file://.lobster/plugin/my-plugin.ts")).toBe("my-plugin")
    expect(pluginSpecName("file://.lobster/plugin/feature/index.ts")).toBe("feature")
  })

  test("loads marketplace plugins and derives specs from source field", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("registry/plugins.json")) {
        return new Response(
          JSON.stringify({
            version: 1,
            plugins: [
              {
                name: "registry-plugin",
                npm: "registry-plugin",
                description: "registry item",
                category: "utility",
              },
            ],
          }),
          { status: 200 },
        )
      }

      if (url.includes("anthropics/claude-code")) {
        return new Response(
          JSON.stringify([
            {
              name: "feature-dev",
              description: "marketplace item",
              source: "./plugins/feature-dev",
            },
          ]),
          { status: 200 },
        )
      }

      return new Response("[]", { status: 200 })
    }) as typeof fetch

    const result = await loadPluginMarketplace([])
    expect(result.hadError).toBe(false)
    expect(result.plugins.map((plugin) => plugin.name)).toEqual(["registry-plugin", "feature-dev"])
    expect(result.plugins.find((plugin) => plugin.name === "feature-dev")?.spec)
      .toBe("github:anthropics/claude-code/plugins/feature-dev")
  })

  test("finds duplicate-name marketplace matches and collapses identical specs", () => {
    const matches = findMarketplaceMatchesByName([
      { name: "feature-dev", description: "v1", spec: "github:acme/tools/plugins/feature-dev", source: "tools" },
      { name: "feature-dev", description: "duplicate", spec: "github:acme/tools/plugins/feature-dev", source: "tools2" },
      { name: "feature-dev", description: "v2", spec: "github:other/repo/plugins/feature-dev", source: "repo" },
      { name: "other", description: "x", spec: "other", source: "x" },
    ], "Feature-Dev")
    expect(matches).toHaveLength(2)
    expect(matches.map((item) => item.spec)).toEqual([
      "github:acme/tools/plugins/feature-dev",
      "github:other/repo/plugins/feature-dev",
    ])
  })

  test("deduplicates marketplace entries by spec for display lists", () => {
    const deduped = dedupeMarketplaceBySpec([
      { name: "a", description: "", spec: "pkg/a", source: "one" },
      { name: "a", description: "", spec: "pkg/a", source: "two" },
      { name: "b", description: "", spec: "pkg/b", source: "one" },
    ])
    expect(deduped).toHaveLength(2)
    expect(deduped.map((item) => item.spec)).toEqual(["pkg/a", "pkg/b"])
  })

  test("marks result as error when a source fetch fails", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("registry/plugins.json")) {
        return new Response(JSON.stringify({ version: 1, plugins: [] }), { status: 200 })
      }
      if (url.includes("anthropics/claude-code")) {
        return new Response("upstream error", { status: 500 })
      }
      return new Response("[]", { status: 200 })
    }) as typeof fetch

    const result = await loadPluginMarketplace([])
    expect(result.plugins).toHaveLength(0)
    expect(result.hadError).toBe(true)
  })

  test("aborts slow marketplace requests using timeout", async () => {
    process.env.LOBSTER_PLUGIN_MARKETPLACE_FETCH_TIMEOUT_MS = "5"
    globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) {
          reject(new Error("missing abort signal"))
          return
        }
        if (signal.aborted) {
          reject(new DOMException("aborted", "AbortError"))
          return
        }
        signal.addEventListener(
          "abort",
          () => {
            reject(new DOMException("aborted", "AbortError"))
          },
          { once: true },
        )
      })) as typeof fetch

    const result = await loadPluginMarketplace([])
    expect(result.hadError).toBe(true)
  })
})
