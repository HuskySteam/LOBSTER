import { BusEvent } from "@/bus/bus-event"
import path from "path"
import { $ } from "bun"
import z from "zod"
import { NamedError } from "@lobster-ai/util/error"
import { Log } from "../util/log"
import { iife } from "@/util/iife"
import { Flag } from "../flag/flag"

declare global {
  const LOBSTER_VERSION: string
  const LOBSTER_CHANNEL: string
}

export namespace Installation {
  const log = Log.create({ service: "installation" })

  export type Method = Awaited<ReturnType<typeof method>>

  export const Event = {
    Updated: BusEvent.define(
      "installation.updated",
      z.object({
        version: z.string(),
      }),
    ),
    UpdateAvailable: BusEvent.define(
      "installation.update-available",
      z.object({
        version: z.string(),
      }),
    ),
  }

  export const Info = z
    .object({
      version: z.string(),
      latest: z.string(),
    })
    .meta({
      ref: "InstallationInfo",
    })
  export type Info = z.infer<typeof Info>

  export async function info() {
    return {
      version: VERSION,
      latest: await latest(),
    }
  }

  export function isPreview() {
    return CHANNEL !== "latest"
  }

  export function isLocal() {
    return CHANNEL === "local"
  }

  export async function method() {
    if (process.execPath.includes(path.join(".lobster", "bin"))) return "curl"
    if (process.execPath.includes(path.join(".local", "bin"))) return "curl"
    // Windows: AppData\Local\lobster\bin
    if (process.execPath.includes(path.join("AppData", "Local", "lobster", "bin"))) return "github"
    const exec = process.execPath.toLowerCase()

    const checks = [
      {
        name: "npm" as const,
        command: () => $`npm list -g --depth=0`.throws(false).quiet().text(),
      },
      {
        name: "yarn" as const,
        command: () => $`yarn global list`.throws(false).quiet().text(),
      },
      {
        name: "pnpm" as const,
        command: () => $`pnpm list -g --depth=0`.throws(false).quiet().text(),
      },
      {
        name: "bun" as const,
        command: () => $`bun pm ls -g`.throws(false).quiet().text(),
      },
      {
        name: "brew" as const,
        command: () => $`brew list --formula lobster`.throws(false).quiet().text(),
      },
      {
        name: "scoop" as const,
        command: () => $`scoop list lobster`.throws(false).quiet().text(),
      },
      {
        name: "choco" as const,
        command: () => $`choco list --limit-output lobster`.throws(false).quiet().text(),
      },
    ]

    checks.sort((a, b) => {
      const aMatches = exec.includes(a.name)
      const bMatches = exec.includes(b.name)
      if (aMatches && !bMatches) return -1
      if (!aMatches && bMatches) return 1
      return 0
    })

    for (const check of checks) {
      const output = await check.command()
      const installedName =
        check.name === "brew" || check.name === "choco" || check.name === "scoop" ? "lobster" : "lobster-ai"
      if (output.includes(installedName)) {
        return check.name
      }
    }

    return "unknown"
  }

  export const UpgradeFailedError = NamedError.create(
    "UpgradeFailedError",
    z.object({
      stderr: z.string(),
    }),
  )

  async function getBrewFormula() {
    const tapFormula = await $`brew list --formula huskysteam/tap/lobster`.throws(false).quiet().text()
    if (tapFormula.includes("lobster")) return "huskysteam/tap/lobster"
    const coreFormula = await $`brew list --formula lobster`.throws(false).quiet().text()
    if (coreFormula.includes("lobster")) return "lobster"
    return "lobster"
  }

  async function upgradeViaGitHub(target: string) {
    const os = process.platform
    const arch = process.arch
    const isWindows = os === "win32"
    const assetName = isWindows
      ? `lobster-windows-${arch}.zip`
      : os === "darwin"
        ? `lobster-darwin-${arch}.zip`
        : `lobster-linux-${arch}.tar.gz`
    const url = `https://github.com/HuskySteam/LOBSTER/releases/download/v${target}/${assetName}`
    const binDir = path.dirname(process.execPath)
    const tmpDir = path.join(binDir, ".upgrade-tmp")

    // Download asset
    const res = await fetch(url)
    if (!res.ok) throw new UpgradeFailedError({ stderr: `Failed to download ${url}: ${res.status}` })
    const buffer = Buffer.from(await res.arrayBuffer())
    const tmpFile = path.join(tmpDir, assetName)
    await $`mkdir -p ${tmpDir}`
    await Bun.write(tmpFile, buffer)

    // Extract
    if (assetName.endsWith(".tar.gz")) {
      await $`tar -xzf ${tmpFile} -C ${tmpDir}`
    } else {
      if (isWindows) {
        await $`powershell.exe -Command "Expand-Archive -Path '${tmpFile}' -DestinationPath '${tmpDir}' -Force"`.quiet()
      } else {
        await $`unzip -o ${tmpFile} -d ${tmpDir}`.quiet()
      }
    }

    // Replace binary
    const newBin = path.join(tmpDir, isWindows ? "lobster.exe" : "lobster")
    const currentBin = process.execPath
    if (isWindows) {
      // Windows can't replace running exe directly — move old, copy new, schedule cleanup
      const oldBin = currentBin + ".old"
      await $`powershell.exe -Command "Remove-Item -Path '${oldBin}' -Force -ErrorAction SilentlyContinue"`.quiet().nothrow()
      await $`powershell.exe -Command "Move-Item -Path '${currentBin}' -Destination '${oldBin}' -Force"`.quiet()
      await $`powershell.exe -Command "Copy-Item -Path '${newBin}' -Destination '${currentBin}' -Force"`.quiet()
      // Schedule cleanup of old binary after process exits
      await $`powershell.exe -Command "Start-Process -WindowStyle Hidden powershell -ArgumentList '-Command', 'Start-Sleep -Seconds 2; Remove-Item -Path \"${oldBin}\" -Force -ErrorAction SilentlyContinue'"`.quiet().nothrow()
    } else {
      await $`chmod +x ${newBin}`
      await $`mv ${newBin} ${currentBin}`
    }

    // Cleanup
    await $`rm -rf ${tmpDir}`.nothrow().quiet()
  }

  export async function upgrade(method: Method, target: string) {
    if (method === "github") {
      await upgradeViaGitHub(target)
      log.info("upgraded via github", { target })
      await $`${process.execPath} --version`.nothrow().quiet().text()
      return
    }

    let cmd
    switch (method) {
      case "curl":
        cmd = $`curl -fsSL https://raw.githubusercontent.com/HuskySteam/LOBSTER/main/install.sh | bash`.env({
          ...process.env,
          VERSION: target,
        })
        break
      case "npm":
        cmd = $`npm install -g lobster-ai@${target}`
        break
      case "pnpm":
        cmd = $`pnpm install -g lobster-ai@${target}`
        break
      case "bun":
        cmd = $`bun install -g lobster-ai@${target}`
        break
      case "brew": {
        const formula = await getBrewFormula()
        cmd = $`brew upgrade ${formula}`.env({
          HOMEBREW_NO_AUTO_UPDATE: "1",
          ...process.env,
        })
        break
      }
      case "yarn":
        cmd = $`yarn global add lobster-ai@${target}`
        break
      case "choco":
        cmd = $`choco upgrade lobster --version=${target} --yes`
        break
      case "scoop":
        cmd = $`scoop update lobster`
        break
      default:
        throw new Error(`Unknown method: ${method}`)
    }
    const result = await cmd.quiet().throws(false)
    if (result.exitCode !== 0) {
      let stderr = result.stderr.toString("utf8")
      if (method === "choco" && !stderr.trim()) {
        stderr = result.stdout.toString("utf8")
      }
      if (method === "choco") {
        stderr = stderr + "\nHint: choco requires an elevated (Administrator) command shell"
      }
      throw new UpgradeFailedError({
        stderr: stderr,
      })
    }
    log.info("upgraded", {
      method,
      target,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    })
    await $`${process.execPath} --version`.nothrow().quiet().text()
  }

  export const VERSION = typeof LOBSTER_VERSION === "string" ? LOBSTER_VERSION : "local"
  export const CHANNEL = typeof LOBSTER_CHANNEL === "string" ? LOBSTER_CHANNEL : "local"
  export const USER_AGENT = `lobster/${CHANNEL}/${VERSION}/${Flag.LOBSTER_CLIENT}`

  export async function latest(installMethod?: Method) {
    const detectedMethod = installMethod || (await method())

    if (detectedMethod === "brew") {
      const formula = await getBrewFormula()
      if (formula === "lobster") {
        return fetch("https://formulae.brew.sh/api/formula/lobster.json")
          .then((res) => {
            if (!res.ok) throw new Error(res.statusText)
            return res.json()
          })
          .then((data: any) => data.versions.stable)
      }
    }

    if (detectedMethod === "npm" || detectedMethod === "bun" || detectedMethod === "pnpm") {
      const registry = await iife(async () => {
        const r = (await $`npm config get registry`.quiet().nothrow().text()).trim()
        const reg = r || "https://registry.npmjs.org"
        return reg.endsWith("/") ? reg.slice(0, -1) : reg
      })
      const channel = CHANNEL
      return fetch(`${registry}/lobster-ai/${channel}`)
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.version)
    }

    if (detectedMethod === "choco") {
      return fetch(
        "https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20%27lobster%27%20and%20IsLatestVersion&$select=Version",
        { headers: { Accept: "application/json;odata=verbose" } },
      )
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.d.results[0].Version)
    }

    if (detectedMethod === "scoop") {
      return fetch("https://raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/lobster.json", {
        headers: { Accept: "application/json" },
      })
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.version)
    }

    return fetch("https://api.github.com/repos/HuskySteam/LOBSTER/releases/latest")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data: any) => data.tag_name.replace(/^v/, ""))
  }
}
