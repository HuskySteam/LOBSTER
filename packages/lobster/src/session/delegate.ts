import { PermissionNext } from "@/permission/next"

export namespace DelegateMode {
  const ALLOWED_TOOLS = new Set([
    "task", "sendmessage", "taskcreate", "taskupdate", "tasklist", "taskget",
    "todowrite", "todoread", "question", "plan_enter", "plan_exit",
  ])

  export function isAllowed(tool: string): boolean {
    return ALLOWED_TOOLS.has(tool.toLowerCase())
  }

  export function permissions(): PermissionNext.Ruleset {
    return PermissionNext.fromConfig({
      "*": "deny",
      task: "allow",
      sendmessage: "allow",
      taskcreate: "allow",
      taskupdate: "allow",
      tasklist: "allow",
      taskget: "allow",
      todowrite: "allow",
      todoread: "allow",
      question: "allow",
      plan_enter: "allow",
      plan_exit: "allow",
    })
  }

  export const REMINDER = `<system-reminder>\nYou are in delegate mode. You can only coordinate work via Task, SendMessage, and task management tools. You cannot directly read, write, or edit files or run shell commands.\n</system-reminder>`
}
