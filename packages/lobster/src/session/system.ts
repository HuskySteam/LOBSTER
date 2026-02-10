import { Instance } from "../project/instance"
import PROMPT from "./prompt/prompt.txt"
import type { Provider } from "@/provider/provider"

export namespace SystemPrompt {
  export function instructions() {
    return PROMPT.trim()
  }

  export function provider(_model: Provider.Model) {
    return [PROMPT]
  }

  export async function environment(model: Provider.Model) {
    const project = Instance.project
    return [
      [
        `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
        `Here is some useful information about the environment you are running in:`,
        `<env>`,
        `  Working directory: ${Instance.directory}`,
        `  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
        `  Platform: ${process.platform}`,
        `  Today's date: ${new Date().toDateString()}`,
        `</env>`,
      ].join("\n"),
    ]
  }
}
