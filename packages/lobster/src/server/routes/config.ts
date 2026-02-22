import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "../../config/config"
import { Provider } from "../../provider/provider"
import { mapValues } from "remeda"
import { errors } from "../error"
import { Log } from "../../util/log"
import { lazy } from "../../util/lazy"
import { fileURLToPath } from "url"
import { Filesystem } from "../../util/filesystem"
import { Instance } from "../../project/instance"
import { Global } from "../../global"

const log = Log.create({ service: "server" })
const NPM_PACKAGE_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/
const NPM_VERSION_TAG = /^[a-zA-Z0-9._~^*-]+$/

function parseNpmSpecifier(spec: string) {
  const lastAt = spec.lastIndexOf("@")
  if (lastAt <= 0) {
    return {
      pkg: spec,
      version: undefined as string | undefined,
    }
  }
  return {
    pkg: spec.slice(0, lastAt),
    version: spec.slice(lastAt + 1),
  }
}

function isTrustedFilePluginSpecifier(spec: string) {
  try {
    const url = new URL(spec)
    if (url.protocol !== "file:") return false
    const resolved = fileURLToPath(url)
    return (
      Filesystem.contains(Instance.directory, resolved) ||
      Filesystem.contains(Global.Path.cache, resolved) ||
      Filesystem.contains(Global.Path.data, resolved)
    )
  } catch {
    return false
  }
}

function isTrustedPluginSpecifier(spec: string) {
  if (spec.startsWith("github:")) {
    return /^github:[^/\s]+\/[^/\s]+(?:\/[^?#\s]+)*$/.test(spec)
  }

  if (spec.startsWith("https://github.com/")) {
    return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+(?:\/[^?#\s]+)*\/?$/.test(spec)
  }

  if (spec.startsWith("file://")) {
    return isTrustedFilePluginSpecifier(spec)
  }

  const { pkg, version } = parseNpmSpecifier(spec)
  if (!NPM_PACKAGE_NAME.test(pkg)) return false
  if (!version) return true
  return NPM_VERSION_TAG.test(version)
}

export const ConfigRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get configuration",
        description: "Retrieve the current Lobster configuration settings and preferences.",
        operationId: "config.get",
        responses: {
          200: {
            description: "Get config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.get())
      },
    )
    .patch(
      "/",
      describeRoute({
        summary: "Update configuration",
        description: "Update Lobster configuration settings and preferences.",
        operationId: "config.update",
        responses: {
          200: {
            description: "Successfully updated config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        const config = c.req.valid("json")
        const untrustedPlugins = (config.plugin ?? []).filter((specifier) => !isTrustedPluginSpecifier(specifier))
        if (untrustedPlugins.length > 0) {
          return c.json(
            {
              error: `Untrusted plugin specifier: ${untrustedPlugins[0]}`,
            },
            { status: 400 },
          )
        }
        await Config.update(config)
        return c.json(config)
      },
    )
    .get(
      "/providers",
      describeRoute({
        summary: "List config providers",
        description: "Get a list of all configured AI providers and their default models.",
        operationId: "config.providers",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    providers: Provider.Info.array(),
                    default: z.record(z.string(), z.string()),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        using _ = log.time("providers")
        const providers = await Provider.list().then((x) => mapValues(x, (item) => item))
        return c.json({
          providers: Object.values(providers),
          default: mapValues(providers, (item) => {
            const sorted = Provider.sort(Object.values(item.models))
            return sorted[0]?.id
          }),
        })
      },
    ),
)
