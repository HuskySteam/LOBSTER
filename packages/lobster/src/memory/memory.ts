import z from "zod"
import { BusEvent } from "@/bus/bus-event"

export namespace Memory {
  export const Category = z.enum(["pattern", "preference", "convention", "error", "note"])
  export type Category = z.infer<typeof Category>

  export const Entry = z.object({
    id: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    sourceSessionID: z.string(),
    category: Category,
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Entry = z.infer<typeof Entry>

  export const Event = {
    Created: BusEvent.define(
      "memory.created",
      z.object({
        entry: Entry,
      }),
    ),
    Deleted: BusEvent.define(
      "memory.deleted",
      z.object({
        id: z.string(),
      }),
    ),
  }
}
