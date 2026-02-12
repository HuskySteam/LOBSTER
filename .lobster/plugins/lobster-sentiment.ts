import { Plugin } from "@lobster-ai/plugin"

const FRUSTRATION_SIGNALS = [
  "no, that's wrong",
  "that's not what i asked",
  "undo this",
  "revert",
  "stop",
  "you're wrong",
  "this is wrong",
  "not what i wanted",
  "go back",
  "start over",
  "try again",
]

const plugin: Plugin = async (_input) => {
  let frustrationScore = 0

  return {
    "chat.message": async (inp, output) => {
      const text = output.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as any).text?.toLowerCase() ?? "")
        .join(" ")

      const matched = FRUSTRATION_SIGNALS.some((signal) => text.includes(signal))
      if (matched) {
        frustrationScore = Math.min(frustrationScore + 1, 3)
      } else {
        frustrationScore = Math.max(frustrationScore - 0.5, 0)
      }
    },

    "experimental.chat.system.transform": async (_inp, output) => {
      if (frustrationScore >= 1) {
        output.system.push(
          `<system-reminder>\nThe user may be frustrated. Re-read their original request carefully before proceeding. Acknowledge any mistakes and adjust your approach.\n</system-reminder>`
        )
      }
    },
  }
}

export default plugin
