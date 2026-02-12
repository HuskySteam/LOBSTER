import path from "path"
import fs from "fs/promises"
import { Global } from "@/global"
import { Log } from "@/util/log"
import { Config } from "@/config/config"

export namespace Scratchpad {
  const log = Log.create({ service: "scratchpad" })

  export function dir(sessionID: string): string {
    return path.join(Global.Path.data, "scratchpad", sessionID)
  }

  export async function create(sessionID: string): Promise<string | undefined> {
    const config = await Config.get()
    if (config.experimental?.scratchpad === false) return undefined
    const scratchDir = dir(sessionID)
    await fs.mkdir(scratchDir, { recursive: true })
    log.info("created scratchpad", { path: scratchDir })
    return scratchDir
  }

  export async function cleanup(sessionID: string): Promise<void> {
    const config = await Config.get()
    if (config.experimental?.scratchpad_cleanup === false) return
    const scratchDir = dir(sessionID)
    await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => {})
    log.info("cleaned up scratchpad", { path: scratchDir })
  }
}
