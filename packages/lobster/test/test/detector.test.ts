import { test, expect, describe } from "bun:test"
import { TestDetector } from "../../src/test/detector"

describe("TestDetector.command", () => {
  test("jest returns npx jest", () => {
    expect(TestDetector.command("jest")).toBe("npx jest")
  })

  test("vitest returns npx vitest run", () => {
    expect(TestDetector.command("vitest")).toBe("npx vitest run")
  })

  test("bun returns bun test", () => {
    expect(TestDetector.command("bun")).toBe("bun test")
  })

  test("pytest returns pytest", () => {
    expect(TestDetector.command("pytest")).toBe("pytest")
  })

  test("go returns go test ./...", () => {
    expect(TestDetector.command("go")).toBe("go test ./...")
  })

  test("unknown returns test", () => {
    expect(TestDetector.command("unknown")).toBe("test")
  })
})
