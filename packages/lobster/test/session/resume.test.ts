import { test, expect, describe } from "bun:test"
import { SessionResume } from "../../src/session/resume"

describe("SessionResume", () => {
  test("lastSession is a function", () => {
    expect(typeof SessionResume.lastSession).toBe("function")
  })

  test("summary is a function", () => {
    expect(typeof SessionResume.summary).toBe("function")
  })

  test("prompt is a function", () => {
    expect(typeof SessionResume.prompt).toBe("function")
  })
})
