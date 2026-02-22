import { describe, expect, test } from "bun:test"
import { TeamManager } from "../../src/team/manager"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

function uniqueTeam(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

describe("team.manager", () => {
  test("creates a team, adds a member, and removes the team", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const teamName = uniqueTeam("tm")
        await TeamManager.create({
          name: teamName,
          leadSessionID: "lead-session",
        })

        await TeamManager.addMember({
          teamName,
          name: "worker1",
          agentId: "agent-1",
          agentType: "coder",
        })

        const team = await TeamManager.get(teamName)
        expect(team).toBeDefined()
        expect(team?.members.some((m) => m.name === "worker1")).toBe(true)

        await TeamManager.remove(teamName)
        const removed = await TeamManager.get(teamName)
        expect(removed).toBeUndefined()
      },
    })
  })

  test("maintains reciprocal task dependencies and rejects cycles", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const teamName = uniqueTeam("td")
        await TeamManager.create({
          name: teamName,
          leadSessionID: "lead-session",
        })

        const taskA = await TeamManager.createTask({
          teamName,
          subject: "Task A",
          description: "A",
        })
        const taskB = await TeamManager.createTask({
          teamName,
          subject: "Task B",
          description: "B",
        })
        const taskC = await TeamManager.createTask({
          teamName,
          subject: "Task C",
          description: "C",
        })

        await TeamManager.updateTask(teamName, taskA.id, { addBlocks: [taskB.id] })
        await TeamManager.updateTask(teamName, taskB.id, { addBlocks: [taskC.id] })

        const updatedB = await TeamManager.getTask(teamName, taskB.id)
        const updatedC = await TeamManager.getTask(teamName, taskC.id)
        expect(updatedB?.blockedBy).toContain(taskA.id)
        expect(updatedC?.blockedBy).toContain(taskB.id)

        await expect(
          TeamManager.updateTask(teamName, taskC.id, { addBlocks: [taskA.id] }),
        ).rejects.toThrow("Circular dependency detected")

        await TeamManager.remove(teamName)
      },
    })
  })

  test("routes direct messages to inbox and delivers in time order", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const teamName = uniqueTeam("msg")
        await TeamManager.create({
          name: teamName,
          leadSessionID: "lead-session",
        })
        await TeamManager.addMember({
          teamName,
          name: "alice",
          agentId: "agent-a",
          agentType: "coder",
        })
        await TeamManager.addMember({
          teamName,
          name: "bob",
          agentId: "agent-b",
          agentType: "coder",
        })

        await TeamManager.sendMessage({
          id: `m1-${Date.now()}`,
          teamName,
          sender: "alice",
          recipient: "bob",
          type: "message",
          content: "first",
          time: 1,
        })
        await TeamManager.sendMessage({
          id: `m2-${Date.now()}`,
          teamName,
          sender: "alice",
          recipient: "bob",
          type: "message",
          content: "second",
          time: 2,
        })

        const delivered = await TeamManager.deliverInbox(teamName, "bob")
        expect(delivered.map((m) => m.content)).toEqual(["first", "second"])

        const afterDrain = await TeamManager.deliverInbox(teamName, "bob")
        expect(afterDrain).toEqual([])

        await TeamManager.remove(teamName)
      },
    })
  })
})
