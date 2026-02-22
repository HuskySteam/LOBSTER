import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

const runMock = mock(async (): Promise<any[]> => [
  {
    name: "synthetic",
    passed: true,
    time: 100,
    iterations: 1,
    warmupRuns: 0,
    passRate: 1,
    agentMeanMs: 100,
    agentStdDevMs: 0,
    harnessMeanMs: 0,
    harnessStdDevMs: 0,
  },
])
const reportMock = mock(() => {})
const bootstrapMock = mock(async (_directory: string, cb: () => Promise<void>) => {
  await cb()
})

const benchmarkRunnerModuleId = import.meta.resolve("../../src/benchmark/runner.ts")
const bootstrapModuleId = import.meta.resolve("../../src/cli/bootstrap.ts")

mock.module(benchmarkRunnerModuleId, () => ({
  BenchmarkRunner: {
    run: runMock,
    report: reportMock,
  },
}))

mock.module(bootstrapModuleId, () => ({
  bootstrap: bootstrapMock,
}))

const { BenchmarkCommand } = await import("../../src/cli/cmd/benchmark")

beforeEach(() => {
  runMock.mockClear()
  reportMock.mockClear()
  bootstrapMock.mockClear()
  process.exitCode = undefined
})

afterAll(() => {
  mock.restore()
})

describe("cli benchmark command", () => {
  test("passes warmup/run options into BenchmarkRunner.run and sets exitCode=0 on success", async () => {
    runMock.mockResolvedValueOnce([
      {
        name: "case-1",
        passed: true,
        time: 100,
        iterations: 2,
        warmupRuns: 1,
        passRate: 1,
        agentMeanMs: 80,
        agentStdDevMs: 3,
        harnessMeanMs: 20,
        harnessStdDevMs: 2,
      },
    ])

    await BenchmarkCommand.handler({
      warmup: 1,
      runs: 2,
    } as any)

    expect(bootstrapMock).toHaveBeenCalledTimes(1)
    expect(runMock).toHaveBeenCalledTimes(1)
    expect(runMock).toHaveBeenCalledWith({
      warmupRuns: 1,
      measuredRuns: 2,
    })
    expect(reportMock).toHaveBeenCalledTimes(1)
    expect(process.exitCode).toBe(0)
  })

  test("sets exitCode=1 when any benchmark challenge fails", async () => {
    runMock.mockResolvedValueOnce([
      {
        name: "case-fail",
        passed: false,
        time: 100,
        iterations: 1,
        warmupRuns: 0,
        passRate: 0,
        agentMeanMs: 80,
        agentStdDevMs: 0,
        harnessMeanMs: 20,
        harnessStdDevMs: 0,
        error: "failure",
      },
    ])

    await BenchmarkCommand.handler({
      warmup: 0,
      runs: 1,
    } as any)

    expect(process.exitCode).toBe(1)
  })

  test("sanitizes invalid numeric options", async () => {
    await BenchmarkCommand.handler({
      warmup: -3,
      runs: 0,
    } as any)

    expect(runMock).toHaveBeenCalledWith({
      warmupRuns: 0,
      measuredRuns: 1,
    })
  })
})
