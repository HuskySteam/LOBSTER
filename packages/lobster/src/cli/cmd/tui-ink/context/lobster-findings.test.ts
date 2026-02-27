import { describe, expect, test } from "bun:test"
import { computeNextFindings, type ReviewFinding } from "./lobster"

function makeFinding(id: string, status: ReviewFinding["status"]): ReviewFinding {
  return {
    id,
    status,
    severity: "medium",
    title: `title-${id}`,
    description: `desc-${id}`,
    agent: "reviewer",
    iteration: 1,
  }
}

describe("computeNextFindings", () => {
  test("updates only the requested finding", () => {
    const current = [makeFinding("a", "open"), makeFinding("b", "open")]

    const next = computeNextFindings(current, "a", "accepted")

    expect(next[0]?.status).toBe("accepted")
    expect(next[1]?.status).toBe("open")
  })

  test("returns original array when finding id does not exist", () => {
    const current = [makeFinding("a", "open"), makeFinding("b", "open")]

    const next = computeNextFindings(current, "missing", "rejected")

    expect(next).toBe(current)
  })

  test("applies sequential updates from the latest computed state", () => {
    const current = [makeFinding("a", "open"), makeFinding("b", "open")]

    const first = computeNextFindings(current, "a", "accepted")
    const second = computeNextFindings(first, "b", "rejected")

    expect(second[0]?.status).toBe("accepted")
    expect(second[1]?.status).toBe("rejected")
  })
})
