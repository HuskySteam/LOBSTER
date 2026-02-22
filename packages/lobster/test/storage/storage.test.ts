import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Global } from "../../src/global"
import { Storage } from "../../src/storage/storage"

describe("storage.list", () => {
  test("only returns JSON-backed keys for a prefix", async () => {
    const scope = `list-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const prefix = ["cache", scope]
    const dir = path.join(Global.Path.data, "storage", ...prefix)

    await Storage.write([...prefix, "one"], { id: 1 })
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(path.join(dir, "notes.txt"), "ignore me")

    const keys = await Storage.list(prefix)
    expect(keys).toEqual([["cache", scope, "one"]])

    await fs.rm(dir, { recursive: true, force: true })
  })
})
