import { Storage } from "../storage/storage"
import { Bus } from "../bus"
import { Team } from "./team"
import { TeamTask } from "./task"
import { TeamMessage } from "./message"
import { Log } from "../util/log"
import { ulid } from "ulid"

export namespace TeamManager {
  const log = Log.create({ service: "team.manager" })

  const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/

  function validateName(name: string, label: string) {
    if (!NAME_PATTERN.test(name))
      throw new Error(
        `Invalid ${label}: "${name}". Must be 1-63 lowercase alphanumeric characters or hyphens, starting with alphanumeric.`,
      )
  }

  export async function create(input: {
    name: string
    leadSessionID: string
  }): Promise<Team.Info> {
    validateName(input.name, "team name")
    const info: Team.Info = {
      name: input.name,
      members: [],
      leadSessionID: input.leadSessionID,
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
    await Storage.write(["team", input.name], info)
    await Storage.write(["team_counter", input.name], { next: 1 })
    Bus.publish(Team.Event.Created, { info })
    log.info("team created", { name: input.name })
    return info
  }

  export async function get(teamName: string): Promise<Team.Info | undefined> {
    return Storage.read<Team.Info>(["team", teamName]).catch(() => undefined)
  }

  export async function addMember(input: {
    teamName: string
    name: string
    agentId: string
    agentType: string
  }): Promise<Team.Member> {
    validateName(input.name, "member name")
    const member: Team.Member = {
      name: input.name,
      agentId: input.agentId,
      agentType: input.agentType,
      status: "active",
    }
    const info = await Storage.update<Team.Info>(["team", input.teamName], (draft) => {
      const existing = draft.members.findIndex((m) => m.name === input.name)
      if (existing >= 0) {
        draft.members[existing] = member
      } else {
        draft.members.push(member)
      }
      draft.time.updated = Date.now()
    })
    Bus.publish(Team.Event.MemberJoined, { teamName: input.teamName, member })
    Bus.publish(Team.Event.Updated, { info })
    log.info("member added", { teamName: input.teamName, name: input.name })
    return member
  }

  export async function removeMember(teamName: string, memberName: string) {
    const info = await Storage.update<Team.Info>(["team", teamName], (draft) => {
      draft.members = draft.members.filter((m) => m.name !== memberName)
      draft.time.updated = Date.now()
    })
    Bus.publish(Team.Event.Updated, { info })
    log.info("member removed", { teamName, name: memberName })
  }

  export async function setMemberStatus(
    teamName: string,
    memberName: string,
    status: Team.MemberStatus,
  ) {
    let found = false
    const info = await Storage.update<Team.Info>(["team", teamName], (draft) => {
      const member = draft.members.find((m) => m.name === memberName)
      if (member) {
        member.status = status
        found = true
      }
      draft.time.updated = Date.now()
    }).catch(() => undefined)
    if (!info || !found) {
      log.warn("setMemberStatus: member not found", { teamName, memberName })
      return
    }
    Bus.publish(Team.Event.MemberStatusChanged, { teamName, memberName, status })
    Bus.publish(Team.Event.Updated, { info })
    log.info("member status changed", { teamName, memberName, status })
  }

  export async function getMembers(teamName: string): Promise<Team.Member[]> {
    const team = await get(teamName)
    return team?.members ?? []
  }

  // Task operations

  export async function nextTaskId(teamName: string): Promise<string> {
    const counter = await Storage.update<{ next: number }>(
      ["team_counter", teamName],
      (draft) => {
        draft.next++
      },
    ).catch(async () => {
      // Counter may not exist yet if team creation was interrupted; initialize and retry
      await Storage.write(["team_counter", teamName], { next: 2 })
      return { next: 2 }
    })
    return String(counter.next - 1)
  }

  export async function createTask(input: {
    teamName: string
    subject: string
    description: string
    activeForm?: string
  }): Promise<TeamTask.Info> {
    const id = await nextTaskId(input.teamName)
    const task: TeamTask.Info = {
      id,
      teamName: input.teamName,
      subject: input.subject,
      description: input.description,
      activeForm: input.activeForm,
      status: "pending",
      blocks: [],
      blockedBy: [],
      metadata: {},
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
    await Storage.write(["team_task", input.teamName, id], task)
    Bus.publish(TeamTask.Event.Created, { task })
    log.info("task created", { teamName: input.teamName, id })
    return task
  }

  export async function getTask(
    teamName: string,
    taskId: string,
  ): Promise<TeamTask.Info | undefined> {
    return Storage.read<TeamTask.Info>(["team_task", teamName, taskId]).catch(
      () => undefined,
    )
  }

  async function detectCycle(
    teamName: string,
    fromId: string,
    toId: string,
  ): Promise<boolean> {
    if (fromId === toId) return true
    const visited = new Set<string>()
    const stack = [toId]
    while (stack.length > 0) {
      const current = stack.pop()!
      if (current === fromId) return true
      if (visited.has(current)) continue
      visited.add(current)
      const task = await Storage.read<TeamTask.Info>(["team_task", teamName, current]).catch(() => undefined)
      if (!task) continue
      for (const dep of task.blocks) {
        if (!visited.has(dep)) stack.push(dep)
      }
    }
    return false
  }

  export async function updateTask(
    teamName: string,
    taskId: string,
    updates: {
      status?: TeamTask.Status
      owner?: string
      subject?: string
      description?: string
      activeForm?: string
      metadata?: Record<string, any>
      addBlocks?: string[]
      addBlockedBy?: string[]
    },
  ): Promise<TeamTask.Info> {
    // Circular dependency detection
    if (updates.addBlocks) {
      for (const targetId of updates.addBlocks) {
        if (await detectCycle(teamName, taskId, targetId)) {
          throw new Error(`Circular dependency detected: task ${taskId} cannot block task ${targetId}`)
        }
      }
    }
    if (updates.addBlockedBy) {
      for (const targetId of updates.addBlockedBy) {
        if (await detectCycle(teamName, targetId, taskId)) {
          throw new Error(`Circular dependency detected: task ${taskId} cannot be blocked by task ${targetId}`)
        }
      }
    }

    const task = await Storage.update<TeamTask.Info>(
      ["team_task", teamName, taskId],
      (draft) => {
        if (updates.status) draft.status = updates.status
        if (updates.owner !== undefined) draft.owner = updates.owner
        if (updates.subject) draft.subject = updates.subject
        if (updates.description) draft.description = updates.description
        if (updates.activeForm !== undefined) draft.activeForm = updates.activeForm
        if (updates.metadata) {
          for (const [key, value] of Object.entries(updates.metadata)) {
            if (value === null) {
              delete draft.metadata[key]
            } else {
              draft.metadata[key] = value
            }
          }
        }
        if (updates.addBlocks) {
          for (const id of updates.addBlocks) {
            if (!draft.blocks.includes(id)) draft.blocks.push(id)
          }
        }
        if (updates.addBlockedBy) {
          for (const id of updates.addBlockedBy) {
            if (!draft.blockedBy.includes(id)) draft.blockedBy.push(id)
          }
        }
        draft.time.updated = Date.now()
      },
    )
    Bus.publish(TeamTask.Event.Updated, { task })

    // Update reciprocal dependencies
    if (updates.addBlocks) {
      for (const targetId of updates.addBlocks) {
        await Storage.update<TeamTask.Info>(["team_task", teamName, targetId], (draft) => {
          if (!draft.blockedBy.includes(taskId)) draft.blockedBy.push(taskId)
          draft.time.updated = Date.now()
        }).catch(() => {
          log.warn("addBlocks: target task not found", { teamName, targetId })
        })
      }
    }
    if (updates.addBlockedBy) {
      for (const targetId of updates.addBlockedBy) {
        await Storage.update<TeamTask.Info>(["team_task", teamName, targetId], (draft) => {
          if (!draft.blocks.includes(taskId)) draft.blocks.push(taskId)
          draft.time.updated = Date.now()
        }).catch(() => {
          log.warn("addBlockedBy: target task not found", { teamName, targetId })
        })
      }
    }

    // Auto-unblock dependents when task is completed
    if (updates.status === "completed") {
      await unblockDependents(teamName, taskId)
    }

    return task
  }

  async function unblockDependents(teamName: string, completedTaskId: string) {
    const allKeys = await Storage.list(["team_task", teamName])
    for (const key of allKeys) {
      const id = key[key.length - 1]
      const task = await Storage.read<TeamTask.Info>(key).catch(() => undefined)
      if (!task) continue
      if (!task.blockedBy.includes(completedTaskId)) continue

      const updated = await Storage.update<TeamTask.Info>(key, (draft) => {
        draft.blockedBy = draft.blockedBy.filter((b) => b !== completedTaskId)
        draft.time.updated = Date.now()
      })

      Bus.publish(TeamTask.Event.Updated, { task: updated })
      if (updated.blockedBy.length === 0) {
        Bus.publish(TeamTask.Event.Unblocked, {
          teamName,
          taskId: id,
          unblockedBy: completedTaskId,
        })
      }
    }
  }

  export async function listTasks(teamName: string): Promise<TeamTask.Info[]> {
    const keys = await Storage.list(["team_task", teamName])
    const tasks: TeamTask.Info[] = []
    for (const key of keys) {
      const task = await Storage.read<TeamTask.Info>(key).catch(() => undefined)
      if (task && task.status !== "deleted") tasks.push(task)
    }
    return tasks.sort((a, b) => Number(a.id) - Number(b.id))
  }

  export async function removeAllTasks(teamName: string) {
    const keys = await Storage.list(["team_task", teamName])
    for (const key of keys) {
      await Storage.remove(key)
    }
    await Storage.remove(["team_counter", teamName])
  }

  // Message operations

  export async function sendMessage(message: TeamMessage.Info) {
    // Idempotency check: skip if already sent
    const existing = await Storage.read<TeamMessage.Info>(
      ["team_msglog", message.teamName, message.id],
    ).catch(() => undefined)
    if (existing) {
      log.warn("message already sent, skipping duplicate", { messageId: message.id })
      return
    }

    // Store in message log
    await Storage.write(["team_msglog", message.teamName, message.id], message)

    // Route to recipient inboxes
    if (message.type === "message" || message.type === "shutdown_request") {
      await Storage.write(
        ["team_inbox", message.teamName, message.recipient, message.id],
        message,
      )
    } else if (message.type === "broadcast") {
      const members = await getMembers(message.teamName)
      for (const member of members) {
        if (member.name === message.sender) continue
        await Storage.write(
          ["team_inbox", message.teamName, member.name, message.id],
          message,
        )
      }
    } else if (message.type === "shutdown_response") {
      // Route shutdown response back: find the original request to determine recipient
      const keys = await Storage.list(["team_msglog", message.teamName])
      let recipientName: string | undefined
      for (const key of keys) {
        const msg = await Storage.read<TeamMessage.Info>(key).catch(() => undefined)
        if (
          msg &&
          msg.type === "shutdown_request" &&
          msg.requestId === message.requestId
        ) {
          recipientName = msg.sender
          break
        }
      }
      if (!recipientName) {
        // Fallback: route to team lead
        const team = await get(message.teamName)
        if (team) {
          const lead = team.members.find(
            (m) => m.agentId === team.leadSessionID,
          )
          recipientName = lead?.name
        }
      }
      if (recipientName) {
        await Storage.write(
          ["team_inbox", message.teamName, recipientName, message.id],
          message,
        )
      }
    }

    Bus.publish(TeamMessage.Event.Sent, { message })
    log.info("message sent", {
      teamName: message.teamName,
      type: message.type,
      sender: message.sender,
    })
  }

  export async function deliverInbox(
    teamName: string,
    agentName: string,
  ): Promise<TeamMessage.Info[]> {
    const keys = await Storage.list(["team_inbox", teamName, agentName])
    const messages: TeamMessage.Info[] = []
    const deliveredKeys: (readonly string[])[] = []

    for (const key of keys) {
      const msg = await Storage.read<TeamMessage.Info>(key).catch(
        () => undefined,
      )
      if (msg) {
        messages.push(msg)
        deliveredKeys.push(key)
      }
    }

    const sorted = messages.sort((a, b) => a.time - b.time)

    // Remove from inbox only after all messages have been read successfully
    for (let i = 0; i < deliveredKeys.length; i++) {
      await Storage.remove([...deliveredKeys[i]])
      Bus.publish(TeamMessage.Event.Delivered, {
        teamName,
        recipientName: agentName,
        messageId: messages[i].id,
      })
    }

    return sorted
  }

  export async function remove(teamName: string) {
    await removeAllTasks(teamName)

    // Remove all inboxes
    const inboxKeys = await Storage.list(["team_inbox", teamName])
    for (const key of inboxKeys) {
      await Storage.remove(key)
    }

    // Remove message log
    const msgKeys = await Storage.list(["team_msglog", teamName])
    for (const key of msgKeys) {
      await Storage.remove(key)
    }

    await Storage.remove(["team", teamName])
    Bus.publish(Team.Event.Deleted, { teamName })
    log.info("team removed", { teamName })
  }
}
