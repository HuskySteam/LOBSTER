import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Flag } from "@/flag/flag"
import { Installation } from "@/installation"
import { semver } from "bun"
import { Log } from "@/util/log"

const log = Log.create({ service: "auto-upgrade" })

export async function upgrade() {
  const config = await Config.global()
  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return
  if (semver.order(Installation.VERSION, latest) >= 0) return

  if (config.autoupdate === false || Flag.LOBSTER_DISABLE_AUTOUPDATE) {
    return
  }
  if (config.autoupdate === "notify") {
    await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
    return
  }

  if (method === "unknown") return
  await Installation.upgrade(method, latest)
    .then(() => Bus.publish(Installation.Event.Updated, { version: latest }))
    .catch((e) => log.warn("auto-upgrade failed", { error: e instanceof Error ? e.message : String(e) }))
}
