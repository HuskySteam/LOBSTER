import path from "path"
import { UI } from "../cli/ui"
import { EOL } from "os"
import { BunProc } from "@/bun"

interface NpmPackage {
  name: string
  version: string
  description: string
  date: string
}

interface NpmSearchResult {
  objects: Array<{
    package: NpmPackage
  }>
}

export async function search(query: string) {
  const url = `https://registry.npmjs.org/-/v1/search?text=keywords:lobster-plugin+${encodeURIComponent(query)}&size=20`
  const response = await fetch(url)
  if (!response.ok) {
    UI.println(UI.Style.TEXT_DANGER + "Failed to search npm registry." + UI.Style.TEXT_NORMAL)
    return
  }

  const data = (await response.json()) as NpmSearchResult
  if (data.objects.length === 0) {
    UI.println(UI.Style.TEXT_DIM + "No plugins found for: " + query + UI.Style.TEXT_NORMAL)
    return
  }

  UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "Available Plugins" + UI.Style.TEXT_NORMAL)
  UI.println("─".repeat(60))

  for (const obj of data.objects) {
    const pkg = obj.package
    UI.println(
      UI.Style.TEXT_NORMAL_BOLD +
        pkg.name +
        UI.Style.TEXT_DIM +
        " v" +
        pkg.version +
        UI.Style.TEXT_NORMAL,
    )
    if (pkg.description) {
      UI.println("  " + pkg.description)
    }
    UI.println("")
  }

  UI.println(UI.Style.TEXT_DIM + `Found ${data.objects.length} plugin(s)` + UI.Style.TEXT_NORMAL)
}

// Valid npm package name pattern: scoped (@scope/name) or unscoped (name)
const NPM_PACKAGE_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/

export async function install(name: string, directory: string) {
  if (!NPM_PACKAGE_NAME.test(name)) {
    UI.println(
      UI.Style.TEXT_DANGER +
        `Invalid plugin name: "${name}". Must be a valid npm package name.` +
        UI.Style.TEXT_NORMAL,
    )
    return
  }

  const configPath = path.join(directory, "lobster.json")
  const configFile = Bun.file(configPath)

  UI.println(UI.Style.TEXT_HIGHLIGHT + "Installing " + name + "..." + UI.Style.TEXT_NORMAL)

  // Run bun add
  await BunProc.run(["add", name], { cwd: directory })

  // Update lobster.json plugins array
  const config = await configFile.json().catch(() => ({}))
  if (!config.plugin) {
    config.plugin = []
  }
  if (!config.plugin.includes(name)) {
    config.plugin.push(name)
  }
  await Bun.write(configPath, JSON.stringify(config, null, 2) + EOL)

  UI.println(
    UI.Style.TEXT_SUCCESS + "Installed " + name + " and added to lobster.json" + UI.Style.TEXT_NORMAL,
  )
}

export async function list(directory: string) {
  const configPath = path.join(directory, "lobster.json")
  const configPathC = path.join(directory, "lobster.jsonc")
  const configFile = Bun.file(configPath)
  const configFileC = Bun.file(configPathC)

  let config: Record<string, unknown> = {}
  if (await configFile.exists()) {
    config = await configFile.json().catch(() => ({}))
  } else if (await configFileC.exists()) {
    config = await configFileC.json().catch(() => ({}))
  }

  const plugins = (config.plugin ?? []) as string[]

  if (plugins.length === 0) {
    UI.println(UI.Style.TEXT_DIM + "No plugins installed." + UI.Style.TEXT_NORMAL)
    UI.println(
      UI.Style.TEXT_DIM + 'Run "lobster plugin search <query>" to find plugins.' + UI.Style.TEXT_NORMAL,
    )
    return
  }

  UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "Installed Plugins" + UI.Style.TEXT_NORMAL)
  UI.println("─".repeat(40))

  for (const plugin of plugins) {
    // Try to get version from node_modules
    const pkgPath = path.join(directory, "node_modules", plugin, "package.json")
    const pkg = await Bun.file(pkgPath)
      .json()
      .catch(() => null)

    if (pkg) {
      UI.println(
        UI.Style.TEXT_NORMAL_BOLD +
          plugin +
          UI.Style.TEXT_DIM +
          " v" +
          pkg.version +
          UI.Style.TEXT_NORMAL,
      )
      if (pkg.description) {
        UI.println("  " + pkg.description)
      }
    } else {
      UI.println(UI.Style.TEXT_NORMAL_BOLD + plugin + UI.Style.TEXT_NORMAL)
    }
  }

  UI.println("")
  UI.println(UI.Style.TEXT_DIM + `${plugins.length} plugin(s) installed` + UI.Style.TEXT_NORMAL)
}
