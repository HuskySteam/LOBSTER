import { describe, test, expect, mock, beforeEach } from "bun:test"

// In-memory storage backing
const store = new Map<string, any>()

function storeKey(key: string[]): string {
  return key.join("/")
}

function storePrefix(prefix: string[]): string {
  return prefix.join("/") + "/"
}

mock.module("../../src/storage/storage", () => ({
  Storage: {
    async write(key: string[], content: any) {
      store.set(storeKey(key), structuredClone(content))
    },
    async read<T>(key: string[]): Promise<T> {
      const k = storeKey(key)
      if (!store.has(k)) throw new Error("NotFound: " + k)
      return structuredClone(store.get(k)) as T
    },
    async update<T>(key: string[], fn: (draft: T) => void): Promise<T> {
      const k = storeKey(key)
      if (!store.has(k)) throw new Error("NotFound: " + k)
      const content = structuredClone(store.get(k)) as T
      fn(content)
      store.set(k, structuredClone(content))
      return structuredClone(content) as T
    },
    async remove(key: string[]) {
      store.delete(storeKey(key))
    },
    async list(prefix: string[]) {
      const p = storePrefix(prefix)
      const results: string[][] = []
      for (const key of store.keys()) {
        if (key.startsWith(p)) {
          results.push(key.split("/"))
        }
      }
      results.sort()
      return results
    },
  },
}))

const busEvents: Array<{ type: string; properties: any }> = []

mock.module("../../src/bus", () => ({
  Bus: {
    publish(def: { type: string }, properties: any) {
      busEvents.push({ type: def.type, properties })
    },
  },
}))

// Suppress logging
mock.module("../../src/util/log", () => ({
  Log: {
    create: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
  },
}))

const { TeamManager } = await import("../../src/team/manager")
const { Team } = await import("../../src/team/team")
const { TeamTask } = await import("../../src/team/task")

beforeEach(() => {
  store.clear()
  busEvents.length = 0
})

// ========================================================================
// create()
// ========================================================================
describe("TeamManager.create", () => {
  test("creates team, initializes counter, publishes event", async () => {
    const info = await TeamManager.create({
      name: "alpha",
      leadSessionID: "sess-1",
    })

    expect(info.name).toBe("alpha")
    expect(info.members).toEqual([])
    expect(info.leadSessionID).toBe("sess-1")
    expect(info.time.created).toBeGreaterThan(0)

    // Verify stored
    const stored = store.get("team/alpha")
    expect(stored).toBeDefined()
    expect(stored.name).toBe("alpha")

    // Verify counter initialized
    const counter = store.get("team_counter/alpha")
    expect(counter).toEqual({ next: 1 })

    // Verify event published
    const createdEvents = busEvents.filter((e) => e.type === "team.created")
    expect(createdEvents).toHaveLength(1)
    expect(createdEvents[0].properties.info.name).toBe("alpha")
  })

  test("rejects invalid team names", async () => {
    await expect(
      TeamManager.create({ name: "UPPER", leadSessionID: "s" }),
    ).rejects.toThrow("Invalid team name")

    await expect(
      TeamManager.create({ name: "-starts-hyphen", leadSessionID: "s" }),
    ).rejects.toThrow("Invalid team name")

    await expect(
      TeamManager.create({ name: "", leadSessionID: "s" }),
    ).rejects.toThrow("Invalid team name")

    await expect(
      TeamManager.create({ name: "has spaces", leadSessionID: "s" }),
    ).rejects.toThrow("Invalid team name")

    await expect(
      TeamManager.create({ name: "foo..bar", leadSessionID: "s" }),
    ).rejects.toThrow("Invalid team name")
  })
})

// ========================================================================
// get()
// ========================================================================
describe("TeamManager.get", () => {
  test("returns team when it exists", async () => {
    await TeamManager.create({ name: "beta", leadSessionID: "s1" })
    const team = await TeamManager.get("beta")
    expect(team).toBeDefined()
    expect(team!.name).toBe("beta")
  })

  test("returns undefined for non-existent team", async () => {
    const team = await TeamManager.get("nonexistent")
    expect(team).toBeUndefined()
  })
})

// ========================================================================
// addMember / removeMember / setMemberStatus
// ========================================================================
describe("TeamManager member operations", () => {
  test("addMember adds a new member", async () => {
    await TeamManager.create({ name: "team1", leadSessionID: "s" })
    const member = await TeamManager.addMember({
      teamName: "team1",
      name: "worker1",
      agentId: "a1",
      agentType: "coder",
    })

    expect(member.name).toBe("worker1")
    expect(member.status).toBe("active")

    const team = await TeamManager.get("team1")
    expect(team!.members).toHaveLength(1)
    expect(team!.members[0].name).toBe("worker1")

    const joinEvents = busEvents.filter((e) => e.type === "team.member.joined")
    expect(joinEvents.length).toBeGreaterThanOrEqual(1)
  })

  test("addMember replaces existing member with same name", async () => {
    await TeamManager.create({ name: "team2", leadSessionID: "s" })
    await TeamManager.addMember({
      teamName: "team2",
      name: "worker1",
      agentId: "a1",
      agentType: "coder",
    })
    await TeamManager.addMember({
      teamName: "team2",
      name: "worker1",
      agentId: "a2",
      agentType: "researcher",
    })

    const team = await TeamManager.get("team2")
    expect(team!.members).toHaveLength(1)
    expect(team!.members[0].agentId).toBe("a2")
    expect(team!.members[0].agentType).toBe("researcher")
  })

  test("addMember rejects invalid member names", async () => {
    await TeamManager.create({ name: "team3", leadSessionID: "s" })
    await expect(
      TeamManager.addMember({
        teamName: "team3",
        name: "BAD_NAME",
        agentId: "a1",
        agentType: "coder",
      }),
    ).rejects.toThrow("Invalid member name")
  })

  test("removeMember removes a member", async () => {
    await TeamManager.create({ name: "team4", leadSessionID: "s" })
    await TeamManager.addMember({
      teamName: "team4",
      name: "worker1",
      agentId: "a1",
      agentType: "coder",
    })
    await TeamManager.addMember({
      teamName: "team4",
      name: "worker2",
      agentId: "a2",
      agentType: "coder",
    })

    await TeamManager.removeMember("team4", "worker1")

    const team = await TeamManager.get("team4")
    expect(team!.members).toHaveLength(1)
    expect(team!.members[0].name).toBe("worker2")
  })

  test("setMemberStatus updates member status", async () => {
    await TeamManager.create({ name: "team5", leadSessionID: "s" })
    await TeamManager.addMember({
      teamName: "team5",
      name: "worker1",
      agentId: "a1",
      agentType: "coder",
    })

    await TeamManager.setMemberStatus("team5", "worker1", "idle")

    const team = await TeamManager.get("team5")
    expect(team!.members[0].status).toBe("idle")

    const statusEvents = busEvents.filter((e) => e.type === "team.member.status")
    expect(statusEvents.length).toBeGreaterThanOrEqual(1)
  })

  test("setMemberStatus does nothing for non-existent member", async () => {
    await TeamManager.create({ name: "team6", leadSessionID: "s" })
    // Should not throw
    await TeamManager.setMemberStatus("team6", "nonexistent", "idle")
  })
})

// ========================================================================
// Task CRUD
// ========================================================================
describe("TeamManager task CRUD", () => {
  test("createTask creates a task with correct defaults", async () => {
    await TeamManager.create({ name: "t1", leadSessionID: "s" })
    const task = await TeamManager.createTask({
      teamName: "t1",
      subject: "Do something",
      description: "Details here",
      activeForm: "Doing something",
    })

    expect(task.id).toBe("1")
    expect(task.teamName).toBe("t1")
    expect(task.subject).toBe("Do something")
    expect(task.description).toBe("Details here")
    expect(task.activeForm).toBe("Doing something")
    expect(task.status).toBe("pending")
    expect(task.blocks).toEqual([])
    expect(task.blockedBy).toEqual([])
    expect(task.metadata).toEqual({})
    expect(task.time.created).toBeGreaterThan(0)

    const createdEvents = busEvents.filter((e) => e.type === "team.task.created")
    expect(createdEvents.length).toBeGreaterThanOrEqual(1)
  })

  test("getTask returns task or undefined", async () => {
    await TeamManager.create({ name: "t2", leadSessionID: "s" })
    const task = await TeamManager.createTask({
      teamName: "t2",
      subject: "Task",
      description: "Desc",
    })

    const found = await TeamManager.getTask("t2", task.id)
    expect(found).toBeDefined()
    expect(found!.subject).toBe("Task")

    const missing = await TeamManager.getTask("t2", "999")
    expect(missing).toBeUndefined()
  })

  test("updateTask modifies fields", async () => {
    await TeamManager.create({ name: "t3", leadSessionID: "s" })
    const task = await TeamManager.createTask({
      teamName: "t3",
      subject: "Original",
      description: "Desc",
    })

    const updated = await TeamManager.updateTask("t3", task.id, {
      status: "in_progress",
      owner: "worker1",
      subject: "Updated",
      description: "New desc",
      metadata: { priority: "high" },
    })

    expect(updated.status).toBe("in_progress")
    expect(updated.owner).toBe("worker1")
    expect(updated.subject).toBe("Updated")
    expect(updated.metadata.priority).toBe("high")
  })

  test("updateTask with metadata null deletes key", async () => {
    await TeamManager.create({ name: "t3b", leadSessionID: "s" })
    const task = await TeamManager.createTask({
      teamName: "t3b",
      subject: "Meta test",
      description: "Desc",
    })

    await TeamManager.updateTask("t3b", task.id, {
      metadata: { key1: "val1", key2: "val2" },
    })

    const updated = await TeamManager.updateTask("t3b", task.id, {
      metadata: { key1: null },
    })

    expect(updated.metadata.key1).toBeUndefined()
    expect(updated.metadata.key2).toBe("val2")
  })

  test("listTasks returns sorted tasks excluding deleted", async () => {
    await TeamManager.create({ name: "t4", leadSessionID: "s" })
    await TeamManager.createTask({ teamName: "t4", subject: "Task 1", description: "d" })
    await TeamManager.createTask({ teamName: "t4", subject: "Task 2", description: "d" })
    const task3 = await TeamManager.createTask({ teamName: "t4", subject: "Task 3", description: "d" })

    await TeamManager.updateTask("t4", task3.id, { status: "deleted" })

    const tasks = await TeamManager.listTasks("t4")
    expect(tasks).toHaveLength(2)
    expect(tasks[0].subject).toBe("Task 1")
    expect(tasks[1].subject).toBe("Task 2")
  })
})

// ========================================================================
// Dependency updates (addBlocks / addBlockedBy)
// ========================================================================
describe("TeamManager task dependencies", () => {
  test("addBlocks creates reciprocal blockedBy on target", async () => {
    await TeamManager.create({ name: "d1", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "d1", subject: "A", description: "d" })
    const taskB = await TeamManager.createTask({ teamName: "d1", subject: "B", description: "d" })

    await TeamManager.updateTask("d1", taskA.id, { addBlocks: [taskB.id] })

    const a = await TeamManager.getTask("d1", taskA.id)
    const b = await TeamManager.getTask("d1", taskB.id)

    expect(a!.blocks).toContain(taskB.id)
    expect(b!.blockedBy).toContain(taskA.id)
  })

  test("addBlockedBy creates reciprocal blocks on target", async () => {
    await TeamManager.create({ name: "d2", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "d2", subject: "A", description: "d" })
    const taskB = await TeamManager.createTask({ teamName: "d2", subject: "B", description: "d" })

    await TeamManager.updateTask("d2", taskB.id, { addBlockedBy: [taskA.id] })

    const a = await TeamManager.getTask("d2", taskA.id)
    const b = await TeamManager.getTask("d2", taskB.id)

    expect(b!.blockedBy).toContain(taskA.id)
    expect(a!.blocks).toContain(taskB.id)
  })

  test("does not add duplicate dependencies", async () => {
    await TeamManager.create({ name: "d3", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "d3", subject: "A", description: "d" })
    const taskB = await TeamManager.createTask({ teamName: "d3", subject: "B", description: "d" })

    await TeamManager.updateTask("d3", taskA.id, { addBlocks: [taskB.id] })
    await TeamManager.updateTask("d3", taskA.id, { addBlocks: [taskB.id] })

    const a = await TeamManager.getTask("d3", taskA.id)
    expect(a!.blocks.filter((id: string) => id === taskB.id)).toHaveLength(1)
  })
})

// ========================================================================
// Circular dependency detection
// ========================================================================
describe("TeamManager circular dependency detection", () => {
  test("rejects self-blocking", async () => {
    await TeamManager.create({ name: "c1", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "c1", subject: "A", description: "d" })

    await expect(
      TeamManager.updateTask("c1", taskA.id, { addBlocks: [taskA.id] }),
    ).rejects.toThrow("Circular dependency detected")
  })

  test("rejects direct cycle A->B->A", async () => {
    await TeamManager.create({ name: "c2", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "c2", subject: "A", description: "d" })
    const taskB = await TeamManager.createTask({ teamName: "c2", subject: "B", description: "d" })

    await TeamManager.updateTask("c2", taskA.id, { addBlocks: [taskB.id] })

    await expect(
      TeamManager.updateTask("c2", taskB.id, { addBlocks: [taskA.id] }),
    ).rejects.toThrow("Circular dependency detected")
  })

  test("rejects indirect cycle A->B->C->A", async () => {
    await TeamManager.create({ name: "c3", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "c3", subject: "A", description: "d" })
    const taskB = await TeamManager.createTask({ teamName: "c3", subject: "B", description: "d" })
    const taskC = await TeamManager.createTask({ teamName: "c3", subject: "C", description: "d" })

    await TeamManager.updateTask("c3", taskA.id, { addBlocks: [taskB.id] })
    await TeamManager.updateTask("c3", taskB.id, { addBlocks: [taskC.id] })

    await expect(
      TeamManager.updateTask("c3", taskC.id, { addBlocks: [taskA.id] }),
    ).rejects.toThrow("Circular dependency detected")
  })

  test("rejects cycle via addBlockedBy", async () => {
    await TeamManager.create({ name: "c4", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "c4", subject: "A", description: "d" })
    const taskB = await TeamManager.createTask({ teamName: "c4", subject: "B", description: "d" })

    await TeamManager.updateTask("c4", taskA.id, { addBlocks: [taskB.id] })

    await expect(
      TeamManager.updateTask("c4", taskA.id, { addBlockedBy: [taskB.id] }),
    ).rejects.toThrow("Circular dependency detected")
  })
})

// ========================================================================
// Auto-unblock on completion
// ========================================================================
describe("TeamManager auto-unblock on completion", () => {
  test("completing a task unblocks dependents", async () => {
    await TeamManager.create({ name: "u1", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "u1", subject: "A", description: "d" })
    const taskB = await TeamManager.createTask({ teamName: "u1", subject: "B", description: "d" })

    await TeamManager.updateTask("u1", taskA.id, { addBlocks: [taskB.id] })

    // Verify B is blocked
    const bBefore = await TeamManager.getTask("u1", taskB.id)
    expect(bBefore!.blockedBy).toContain(taskA.id)

    // Complete A
    await TeamManager.updateTask("u1", taskA.id, { status: "completed" })

    // B should be unblocked
    const bAfter = await TeamManager.getTask("u1", taskB.id)
    expect(bAfter!.blockedBy).not.toContain(taskA.id)

    const unblockedEvents = busEvents.filter((e) => e.type === "team.task.unblocked")
    expect(unblockedEvents.length).toBeGreaterThanOrEqual(1)
  })

  test("completing a task only removes itself from blockedBy", async () => {
    await TeamManager.create({ name: "u2", leadSessionID: "s" })
    const taskA = await TeamManager.createTask({ teamName: "u2", subject: "A", description: "d" })
    const taskB = await TeamManager.createTask({ teamName: "u2", subject: "B", description: "d" })
    const taskC = await TeamManager.createTask({ teamName: "u2", subject: "C", description: "d" })

    // C is blocked by both A and B
    await TeamManager.updateTask("u2", taskA.id, { addBlocks: [taskC.id] })
    await TeamManager.updateTask("u2", taskB.id, { addBlocks: [taskC.id] })

    // Complete A
    await TeamManager.updateTask("u2", taskA.id, { status: "completed" })

    const c = await TeamManager.getTask("u2", taskC.id)
    expect(c!.blockedBy).not.toContain(taskA.id)
    expect(c!.blockedBy).toContain(taskB.id)

    // The unblocked event should NOT fire because C still has blockers
    const unblockedEvents = busEvents.filter(
      (e) => e.type === "team.task.unblocked" && e.properties.taskId === taskC.id,
    )
    expect(unblockedEvents).toHaveLength(0)
  })
})

// ========================================================================
// nextTaskId
// ========================================================================
describe("TeamManager.nextTaskId", () => {
  test("counter increments with each call", async () => {
    await TeamManager.create({ name: "n1", leadSessionID: "s" })

    const id1 = await TeamManager.nextTaskId("n1")
    const id2 = await TeamManager.nextTaskId("n1")
    const id3 = await TeamManager.nextTaskId("n1")

    expect(id1).toBe("1")
    expect(id2).toBe("2")
    expect(id3).toBe("3")
  })

  test("fallback initialization when counter missing", async () => {
    // Don't create the team normally - manually set up team without counter
    store.set("team/n2", { name: "n2", members: [], leadSessionID: "s", time: { created: 0, updated: 0 } })
    // No counter key set

    const id = await TeamManager.nextTaskId("n2")
    // Fallback initializes to { next: 2 } and returns "1"
    expect(id).toBe("1")

    // Next call should work from the fallback state
    const id2 = await TeamManager.nextTaskId("n2")
    expect(id2).toBe("2")
  })
})

// ========================================================================
// sendMessage
// ========================================================================
describe("TeamManager.sendMessage", () => {
  test("routes DM to recipient inbox", async () => {
    await TeamManager.create({ name: "m1", leadSessionID: "s" })

    await TeamManager.sendMessage({
      id: "msg-1",
      teamName: "m1",
      sender: "alice",
      recipient: "bob",
      type: "message",
      content: "hello",
      time: Date.now(),
    } as any)

    // Message log should exist
    expect(store.has("team_msglog/m1/msg-1")).toBe(true)
    // Inbox for bob should exist
    expect(store.has("team_inbox/m1/bob/msg-1")).toBe(true)

    const sentEvents = busEvents.filter((e) => e.type === "team.message.sent")
    expect(sentEvents.length).toBeGreaterThanOrEqual(1)
  })

  test("routes broadcast to all members except sender", async () => {
    await TeamManager.create({ name: "m2", leadSessionID: "s" })
    await TeamManager.addMember({ teamName: "m2", name: "alice", agentId: "a1", agentType: "coder" })
    await TeamManager.addMember({ teamName: "m2", name: "bob", agentId: "a2", agentType: "coder" })
    await TeamManager.addMember({ teamName: "m2", name: "charlie", agentId: "a3", agentType: "coder" })

    await TeamManager.sendMessage({
      id: "msg-2",
      teamName: "m2",
      sender: "alice",
      type: "broadcast",
      content: "hello all",
      time: Date.now(),
    } as any)

    // Bob and Charlie should have inbox messages, but not Alice
    expect(store.has("team_inbox/m2/bob/msg-2")).toBe(true)
    expect(store.has("team_inbox/m2/charlie/msg-2")).toBe(true)
    expect(store.has("team_inbox/m2/alice/msg-2")).toBe(false)
  })

  test("routes shutdown_request to recipient", async () => {
    await TeamManager.create({ name: "m3", leadSessionID: "s" })

    await TeamManager.sendMessage({
      id: "msg-3",
      teamName: "m3",
      sender: "lead",
      recipient: "worker",
      type: "shutdown_request",
      requestId: "req-1",
      content: "shutting down",
      time: Date.now(),
    } as any)

    expect(store.has("team_inbox/m3/worker/msg-3")).toBe(true)
  })

  test("routes shutdown_response back to original requester", async () => {
    await TeamManager.create({ name: "m4", leadSessionID: "s" })

    // First, send a shutdown_request
    await TeamManager.sendMessage({
      id: "msg-4a",
      teamName: "m4",
      sender: "lead",
      recipient: "worker",
      type: "shutdown_request",
      requestId: "req-2",
      content: "shutdown please",
      time: Date.now(),
    } as any)

    // Then, send a shutdown_response
    await TeamManager.sendMessage({
      id: "msg-4b",
      teamName: "m4",
      sender: "worker",
      type: "shutdown_response",
      requestId: "req-2",
      approve: true,
      content: "ok",
      time: Date.now(),
    } as any)

    // Should route to lead's inbox
    expect(store.has("team_inbox/m4/lead/msg-4b")).toBe(true)
  })

  test("idempotency: skips duplicate message", async () => {
    await TeamManager.create({ name: "m5", leadSessionID: "s" })

    const msg = {
      id: "msg-5",
      teamName: "m5",
      sender: "alice",
      recipient: "bob",
      type: "message" as const,
      content: "hello",
      time: Date.now(),
    }

    await TeamManager.sendMessage(msg as any)
    const eventCountBefore = busEvents.filter((e) => e.type === "team.message.sent").length

    // Send same message again
    await TeamManager.sendMessage(msg as any)
    const eventCountAfter = busEvents.filter((e) => e.type === "team.message.sent").length

    // No additional event should be published
    expect(eventCountAfter).toBe(eventCountBefore)
  })
})

// ========================================================================
// deliverInbox
// ========================================================================
describe("TeamManager.deliverInbox", () => {
  test("delivers and removes messages from inbox", async () => {
    await TeamManager.create({ name: "i1", leadSessionID: "s" })

    // Manually place messages in inbox
    store.set("team_inbox/i1/bob/msg-a", {
      id: "msg-a",
      teamName: "i1",
      sender: "alice",
      recipient: "bob",
      type: "message",
      content: "first",
      time: 1000,
    })
    store.set("team_inbox/i1/bob/msg-b", {
      id: "msg-b",
      teamName: "i1",
      sender: "alice",
      recipient: "bob",
      type: "message",
      content: "second",
      time: 2000,
    })

    const messages = await TeamManager.deliverInbox("i1", "bob")

    expect(messages).toHaveLength(2)
    // Should be sorted by time
    expect(messages[0].content).toBe("first")
    expect(messages[1].content).toBe("second")

    // Inbox should be cleared
    expect(store.has("team_inbox/i1/bob/msg-a")).toBe(false)
    expect(store.has("team_inbox/i1/bob/msg-b")).toBe(false)

    const deliveredEvents = busEvents.filter((e) => e.type === "team.message.delivered")
    expect(deliveredEvents).toHaveLength(2)
  })

  test("returns empty array when no messages", async () => {
    await TeamManager.create({ name: "i2", leadSessionID: "s" })
    const messages = await TeamManager.deliverInbox("i2", "nobody")
    expect(messages).toEqual([])
  })
})

// ========================================================================
// remove
// ========================================================================
describe("TeamManager.remove", () => {
  test("cleans up team, tasks, inboxes, and message log", async () => {
    await TeamManager.create({ name: "r1", leadSessionID: "s" })
    await TeamManager.addMember({ teamName: "r1", name: "worker", agentId: "a1", agentType: "coder" })
    await TeamManager.createTask({ teamName: "r1", subject: "Task", description: "d" })

    // Place some inbox and msglog entries
    store.set("team_inbox/r1/worker/msg-x", { id: "msg-x" })
    store.set("team_msglog/r1/msg-x", { id: "msg-x" })

    await TeamManager.remove("r1")

    // Team should be gone
    expect(store.has("team/r1")).toBe(false)
    // Counter should be gone
    expect(store.has("team_counter/r1")).toBe(false)
    // Tasks should be gone
    const taskKeys = [...store.keys()].filter((k) => k.startsWith("team_task/r1/"))
    expect(taskKeys).toHaveLength(0)
    // Inbox should be gone
    const inboxKeys = [...store.keys()].filter((k) => k.startsWith("team_inbox/r1/"))
    expect(inboxKeys).toHaveLength(0)
    // Message log should be gone
    const msgKeys = [...store.keys()].filter((k) => k.startsWith("team_msglog/r1/"))
    expect(msgKeys).toHaveLength(0)

    const deletedEvents = busEvents.filter((e) => e.type === "team.deleted")
    expect(deletedEvents.length).toBeGreaterThanOrEqual(1)
  })
})

// ========================================================================
// Name validation
// ========================================================================
describe("TeamManager name validation", () => {
  test("accepts valid names", async () => {
    await TeamManager.create({ name: "valid-name", leadSessionID: "s" })
    const team = await TeamManager.get("valid-name")
    expect(team).toBeDefined()
  })

  test("accepts single character names", async () => {
    await TeamManager.create({ name: "a", leadSessionID: "s" })
    const team = await TeamManager.get("a")
    expect(team).toBeDefined()
  })

  test("accepts numeric-start names", async () => {
    await TeamManager.create({ name: "1team", leadSessionID: "s" })
    const team = await TeamManager.get("1team")
    expect(team).toBeDefined()
  })

  test("rejects names with special characters", async () => {
    const bad = [
      "foo/bar",
      "foo\\bar",
      "hello world",
      "name@domain",
      "../etc",
      "name.ext",
      "UPPER",
      "_underscore",
    ]

    for (const name of bad) {
      await expect(
        TeamManager.create({ name, leadSessionID: "s" }),
      ).rejects.toThrow(/Invalid team name/)
    }
  })

  test("rejects empty and too-long names", async () => {
    await expect(
      TeamManager.create({ name: "", leadSessionID: "s" }),
    ).rejects.toThrow("Invalid team name")

    const longName = "a".repeat(64)
    await expect(
      TeamManager.create({ name: longName, leadSessionID: "s" }),
    ).rejects.toThrow("Invalid team name")
  })
})
