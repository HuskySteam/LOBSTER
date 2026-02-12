import os from "os"
import { $ } from "bun"
import { Instance } from "../project/instance"
import PROMPT from "./prompt/prompt.txt"
import type { Provider } from "@/provider/provider"
import { OutputStyle } from "./output-style"
import { Scratchpad } from "./scratchpad"
import { Config } from "../config/config"
import { PromptRegistry } from "./prompt-registry"
import SECTION_SYSTEM from "./prompt/sections/system.txt"
import SECTION_DOING_TASKS from "./prompt/sections/doing-tasks.txt"
import SECTION_TONE from "./prompt/sections/tone.txt"
import SECTION_TOOLS from "./prompt/sections/tools.txt"
import SECTION_ACTIONS from "./prompt/sections/actions-with-care.txt"
import SECTION_GIT from "./prompt/sections/git.txt"
import SECTION_SECURITY from "./prompt/sections/security.txt"

export namespace SystemPrompt {
  function initRegistry() {
    if (PromptRegistry.list().length === 0) {
      PromptRegistry.register("system", SECTION_SYSTEM)
      PromptRegistry.register("doing-tasks", SECTION_DOING_TASKS)
      PromptRegistry.register("tone", SECTION_TONE)
      PromptRegistry.register("tools", SECTION_TOOLS)
      PromptRegistry.register("actions-with-care", SECTION_ACTIONS)
      PromptRegistry.register("git", SECTION_GIT)
      PromptRegistry.register("security", SECTION_SECURITY)
    }
  }

  export function instructions() {
    initRegistry()
    return PromptRegistry.assemble()
  }

  export function provider(_model: Provider.Model) {
    initRegistry()
    return [PromptRegistry.assemble()]
  }

  export async function environment(model: Provider.Model) {
    const project = Instance.project
    const today = new Date().toISOString().split("T")[0]

    // Git info for environment
    let gitBranchLine = ""
    if (project.vcs === "git") {
      const [branch, status] = await Promise.all([
        $`git branch --show-current`
          .cwd(Instance.worktree)
          .quiet()
          .nothrow()
          .text()
          .then((x) => x.trim())
          .catch(() => ""),
        $`git status --porcelain`
          .cwd(Instance.worktree)
          .quiet()
          .nothrow()
          .text()
          .then((x) => x.trim())
          .catch(() => ""),
      ])
      if (branch) {
        gitBranchLine = `  - Current git branch: ${branch} (${status ? "dirty" : "clean"})`
      }
    }

    const lines = [
      `# Environment`,
      `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}.`,
      ``,
      `Here is useful information about the environment you are running in:`,
      `- Primary working directory: ${Instance.directory}`,
      `  - Is a git repository: ${project.vcs === "git" ? "yes" : "no"}`,
      ...(gitBranchLine ? [gitBranchLine] : []),
      `- Platform: ${process.platform}`,
      `- OS Version: ${process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux"} ${os.release()}`,
      `- The current date is: ${today}`,
    ]

    const config = await Config.get()
    if (config.experimental?.scratchpad !== false) {
      const scratchDir = Scratchpad.dir("*")
      lines.push(`- Scratchpad directory: ${scratchDir.replace("*", "<sessionID>")} (for temporary files, no permission prompts needed)`)
    }

    const styleInstruction = await OutputStyle.instruction()
    if (styleInstruction) {
      lines.push(``, `# Response Style`, styleInstruction)
    }

    return [lines.join("\n")]
  }
}
