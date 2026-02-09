import { $, semver } from "bun"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  LOBSTER_CHANNEL: process.env["LOBSTER_CHANNEL"] || process.env["OPENCODE_CHANNEL"],
  LOBSTER_BUMP: process.env["LOBSTER_BUMP"] || process.env["OPENCODE_BUMP"],
  LOBSTER_VERSION: process.env["LOBSTER_VERSION"] || process.env["OPENCODE_VERSION"],
  LOBSTER_RELEASE: process.env["LOBSTER_RELEASE"] || process.env["OPENCODE_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.LOBSTER_CHANNEL) return env.LOBSTER_CHANNEL
  if (env.LOBSTER_BUMP) return "latest"
  if (env.LOBSTER_VERSION && !env.LOBSTER_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim())
})()
const IS_PREVIEW = CHANNEL !== "latest" && CHANNEL !== "main"

const lobsterPkgPath = path.resolve(import.meta.dir, "../../../packages/lobster/package.json")
const lobsterPkg = await Bun.file(lobsterPkgPath).json()

const VERSION = await (async () => {
  if (env.LOBSTER_VERSION) return env.LOBSTER_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  // No LOBSTER_BUMP: local build — use package.json version
  if (!env.LOBSTER_BUMP) return lobsterPkg.version
  // CI build with LOBSTER_BUMP: bump from latest GitHub release
  const version = await fetch("https://api.github.com/repos/HuskySteam/LOBSTER/releases/latest")
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
    .then((data: any) => data.tag_name.replace(/^v/, ""))
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.LOBSTER_BUMP.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

const team = [
  "actions-user",
  "lobster",
  "rekram1-node",
  "thdxr",
  "kommander",
  "jayair",
  "fwang",
  "adamdotdevin",
  "iamdavidhill",
  "lobster-agent[bot]",
  "R44VC0RP",
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.LOBSTER_RELEASE
  },
  get team() {
    return team
  },
}
console.log("lobster script", JSON.stringify(Script, null, 2))
