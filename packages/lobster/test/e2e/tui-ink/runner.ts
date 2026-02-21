#!/usr/bin/env bun

import path from "path"
import fs from "fs/promises"
import { assertCapture, makeUnifiedDiff, normalizeCapture, type AssertionIssue } from "./assertions"
import {
  getScenarios,
  listScenarioIDs,
  type ScenarioDefinition,
  type ScenarioExpectation,
  type ScenarioMode,
  type ScenarioStep,
} from "./scenarios"

type CliOptions = {
  mode: ScenarioMode
  updateSnapshots: boolean
  scenarioFilter: Set<string> | undefined
  widthOverride: number[] | undefined
  listScenarios: boolean
}

type ShellContext = {
  viaWsl: boolean
  packageDirTarget: string
}

type CommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

type CaptureResult = {
  label: string
  artifactRawPath: string
  artifactNormalizedPath: string
  snapshotPath: string
  snapshotStatus: "matched" | "updated" | "missing" | "mismatch"
  errors: string[]
  warnings: string[]
}

type ScenarioResult = {
  scenarioID: string
  width: number
  durationMs: number
  captures: CaptureResult[]
  errors: string[]
  warnings: string[]
  pass: boolean
}

const PACKAGE_DIR = path.resolve(import.meta.dir, "../../..")
const SNAPSHOT_ROOT = path.join(import.meta.dir, "snapshots")
const ARTIFACT_ROOT = path.join(import.meta.dir, "artifacts")
const DEFAULT_TERMINAL_HEIGHT = 42
const INPUT_WARMUP_MS = 1200

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: "all",
    updateSnapshots: false,
    scenarioFilter: undefined,
    widthOverride: undefined,
    listScenarios: false,
  }

  for (const arg of args) {
    if (arg === "--update-snapshots") {
      options.updateSnapshots = true
      continue
    }

    if (arg === "--list") {
      options.listScenarios = true
      continue
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length)
      if (value === "all" || value === "critical" || value === "responsive") {
        options.mode = value
        continue
      }
      throw new Error(`Invalid mode "${value}". Expected one of: all, critical, responsive`)
    }

    if (arg.startsWith("--scenario=")) {
      const value = arg.slice("--scenario=".length).trim()
      if (!value) continue
      const parts = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
      options.scenarioFilter = new Set(parts)
      continue
    }

    if (arg.startsWith("--widths=")) {
      const value = arg.slice("--widths=".length).trim()
      if (!value) continue
      const widths = value
        .split(",")
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((item) => Number.isFinite(item) && item >= 40)
      if (widths.length === 0) throw new Error(`Invalid --widths value "${value}"`)
      options.widthOverride = widths
      continue
    }

    throw new Error(`Unknown argument "${arg}"`)
  }

  return options
}

function bashQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function sanitizeLabel(label: string) {
  return label.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function timestampLabel() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

async function runProcess(argv: string[], options?: { allowFailure?: boolean; timeoutMs?: number }): Promise<CommandResult> {
  const proc = Bun.spawn({
    cmd: argv,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    proc.kill("SIGKILL")
  }, options?.timeoutMs ?? 60_000)

  const [stdoutRaw, stderrRaw, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  clearTimeout(timeout)

  if (timedOut) {
    throw new Error(`Command timed out: ${argv.join(" ")}`)
  }

  if (exitCode !== 0 && !options?.allowFailure) {
    const stderrPreview = stderrRaw.replace(/\0/g, "").trim() || "(empty stderr)"
    throw new Error(`Command failed (${exitCode}): ${argv.join(" ")}\n${stderrPreview}`)
  }

  return {
    stdout: stdoutRaw.replace(/\0/g, ""),
    stderr: stderrRaw.replace(/\0/g, ""),
    exitCode,
  }
}

async function runShell(context: ShellContext, command: string, options?: { allowFailure?: boolean; timeoutMs?: number }) {
  const prefixed = `cd ${bashQuote(context.packageDirTarget)} && ${command}`
  const argv = context.viaWsl ? ["wsl.exe", "bash", "-lc", prefixed] : ["bash", "-lc", prefixed]
  return await runProcess(argv, options)
}

async function resolveShellContext() {
  if (process.platform !== "win32") {
    return {
      viaWsl: false,
      packageDirTarget: PACKAGE_DIR,
    } satisfies ShellContext
  }

  const uname = await runProcess(["wsl.exe", "bash", "-lc", "uname -s"], { allowFailure: true })
  if (uname.exitCode !== 0 || !uname.stdout.toLowerCase().includes("linux")) {
    const detail = [uname.stdout.trim(), uname.stderr.trim()].filter(Boolean).join("\n")
    throw new Error(
      `WSL Linux shell is required on Windows for tmux e2e harness${detail ? `\n${detail}` : ""}`,
    )
  }

  const converted = await runProcess(["wsl.exe", "bash", "-lc", `wslpath -a ${bashQuote(PACKAGE_DIR)}`], {
    allowFailure: false,
  })
  const packageDirTarget = converted.stdout.trim()
  if (!packageDirTarget) throw new Error("Failed to resolve package path in WSL")

  return {
    viaWsl: true,
    packageDirTarget,
  } satisfies ShellContext
}

async function preflight(context: ShellContext) {
  console.log("Running preflight checks...")

  const tmuxCheck = await runShell(context, "command -v tmux", { allowFailure: true })
  if (tmuxCheck.exitCode !== 0) {
    throw new Error("tmux not found in target shell. Install tmux before running this harness.")
  }

  const bunCheck = await runShell(context, "command -v bun", { allowFailure: true })
  if (bunCheck.exitCode !== 0) {
    throw new Error("bun not found in target shell. Install bun before running this harness.")
  }

  const tmuxVersion = (await runShell(context, "tmux -V")).stdout.trim()
  const bunVersion = (await runShell(context, "bun --version")).stdout.trim()
  console.log(`- tmux: ${tmuxVersion}`)
  console.log(`- bun: ${bunVersion}`)
  console.log(`- shell mode: ${context.viaWsl ? "windows->wsl" : "native"}`)
}

function resolveWidths(scenario: ScenarioDefinition, override: number[] | undefined) {
  return override ? [...override] : [...scenario.widths]
}

function mapIssues(issues: AssertionIssue[]) {
  return issues.map((issue) => issue.message)
}

function captureFileBase(width: number, label: string) {
  return `${width}.${sanitizeLabel(label)}`
}

function paneTarget(sessionName: string) {
  return `${sessionName}:0.0`
}

async function capturePane(context: ShellContext, sessionName: string) {
  const pane = paneTarget(sessionName)
  const capture = await runShell(context, `tmux capture-pane -ep -J -S - -t ${bashQuote(pane)}`, {
    timeoutMs: 20_000,
  })
  return capture.stdout
}

function createStartupCommand(runtimeRoot: string, packageDirTarget: string) {
  const entrypoint = `${packageDirTarget}/src/index.ts`
  const projectPath = packageDirTarget
  const envVars: Record<string, string> = {
    TERM: "xterm-256color",
    LOBSTER_TEST_HOME: `${runtimeRoot}/home`,
    LOBSTER_TEST_MANAGED_CONFIG_DIR: `${runtimeRoot}/managed`,
    XDG_DATA_HOME: `${runtimeRoot}/share`,
    XDG_CACHE_HOME: `${runtimeRoot}/cache`,
    XDG_CONFIG_HOME: `${runtimeRoot}/config`,
    XDG_STATE_HOME: `${runtimeRoot}/state`,
    LOBSTER_DISABLE_SHARE: "true",
    LOBSTER_DISABLE_DEFAULT_PLUGINS: "true",
  }

  const assignments = Object.entries(envVars)
    .map(([key, value]) => `${key}=${bashQuote(value)}`)
    .join(" ")

  return `cd /tmp && ${assignments} /root/.bun/bin/bun run --conditions=browser ${bashQuote(entrypoint)} ${bashQuote(projectPath)} --ui ink`
}

async function waitForUIReady(context: ShellContext, sessionName: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    await Bun.sleep(1000)
    const capture = normalizeCapture(await capturePane(context, sessionName))
    if (!capture) continue
    if (capture.includes("Loading...")) continue
    if (capture.includes("Type a message")) return
    if (capture.includes("build |")) return
    if (capture.includes("Commands")) return
    if (capture.includes("Welcome back")) return
  }
}

async function runScenario(
  context: ShellContext,
  scenario: ScenarioDefinition,
  width: number,
  runArtifactDir: string,
  updateSnapshots: boolean,
) {
  const started = Date.now()
  const scenarioDir = path.join(runArtifactDir, scenario.id, String(width))
  await fs.mkdir(scenarioDir, { recursive: true })

  const sessionName = `lobster-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const runtimeRoot = `/tmp/${sessionName}`
  const startup = createStartupCommand(runtimeRoot, context.packageDirTarget)
  await Bun.write(path.join(scenarioDir, "startup.command.txt"), startup + "\n")

  const result: ScenarioResult = {
    scenarioID: scenario.id,
    width,
    durationMs: 0,
    captures: [],
    errors: [],
    warnings: [],
    pass: false,
  }

  try {
    await runShell(
      context,
      [
        `mkdir -p ${bashQuote(runtimeRoot)}`,
        `mkdir -p ${bashQuote(`${runtimeRoot}/home`)}`,
        `mkdir -p ${bashQuote(`${runtimeRoot}/managed`)}`,
        `mkdir -p ${bashQuote(`${runtimeRoot}/share`)}`,
        `mkdir -p ${bashQuote(`${runtimeRoot}/cache`)}`,
        `mkdir -p ${bashQuote(`${runtimeRoot}/config`)}`,
        `mkdir -p ${bashQuote(`${runtimeRoot}/state`)}`,
      ].join(" && "),
    )

    await runShell(
      context,
      `tmux new-session -d -s ${bashQuote(sessionName)} -x ${width} -y ${DEFAULT_TERMINAL_HEIGHT} ${bashQuote(startup)}`,
    )
    await runShell(
      context,
      `tmux pipe-pane -o -t ${bashQuote(paneTarget(sessionName))} ${bashQuote(`cat >> ${runtimeRoot}/pane.log`)}`,
      { allowFailure: true },
    )

    await waitForUIReady(context, sessionName, scenario.startupWaitMs ?? 45_000)
    // Under tmux/WSL, Ink can render before key handlers are fully ready.
    // A short warmup avoids losing the first injected hotkey in e2e runs.
    await Bun.sleep(INPUT_WARMUP_MS)

    for (const step of scenario.steps) {
      if (step.kind === "wait") {
        await Bun.sleep(step.ms)
        continue
      }

      if (step.kind === "keys") {
        const keys = step.keys.map((key) => bashQuote(key)).join(" ")
        await runShell(context, `tmux send-keys -t ${bashQuote(paneTarget(sessionName))} ${keys}`)
        continue
      }

      if (step.kind === "text") {
        await runShell(
          context,
          `tmux send-keys -t ${bashQuote(paneTarget(sessionName))} -l ${bashQuote(step.text)}`,
        )
        continue
      }

      if (step.kind === "capture") {
        const capture = await evaluateCapture({
          context,
          sessionName,
          scenario,
          step,
          width,
          scenarioDir,
          updateSnapshots,
        })
        result.captures.push(capture)
      }
    }

    if (result.captures.length === 0) {
      const capture = await evaluateCapture({
        context,
        sessionName,
        scenario,
        step: { kind: "capture", label: "final", expectation: scenario.finalExpectation },
        width,
        scenarioDir,
        updateSnapshots,
      })
      result.captures.push(capture)
    }

    for (const capture of result.captures) {
      result.errors.push(...capture.errors)
      result.warnings.push(...capture.warnings)
    }

    result.pass = result.errors.length === 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.errors.push(message)
    result.pass = false
  } finally {
    const paneLog = await runShell(context, `cat ${bashQuote(`${runtimeRoot}/pane.log`)}`, {
      allowFailure: true,
      timeoutMs: 20_000,
    })
    if (paneLog.exitCode === 0 && paneLog.stdout.trim().length > 0) {
      await Bun.write(path.join(scenarioDir, "pane.log.txt"), paneLog.stdout)
    }
    await runShell(context, `tmux kill-session -t ${bashQuote(sessionName)}`, { allowFailure: true })
    await runShell(context, `rm -rf ${bashQuote(runtimeRoot)}`, { allowFailure: true })
    result.durationMs = Date.now() - started
  }

  return result
}

async function evaluateCapture(input: {
  context: ShellContext
  sessionName: string
  scenario: ScenarioDefinition
  step: Extract<ScenarioStep, { kind: "capture" }>
  width: number
  scenarioDir: string
  updateSnapshots: boolean
}) {
  const rawCapture = await capturePane(input.context, input.sessionName)
  const normalizedCapture = normalizeCapture(rawCapture)

  const basename = captureFileBase(input.width, input.step.label)
  const rawPath = path.join(input.scenarioDir, `${basename}.raw.txt`)
  const normalizedPath = path.join(input.scenarioDir, `${basename}.normalized.txt`)
  await Bun.write(rawPath, rawCapture)
  await Bun.write(normalizedPath, normalizedCapture)

  const snapshotPath = path.join(SNAPSHOT_ROOT, input.scenario.id, `${basename}.txt`)
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true })

  let snapshotStatus: CaptureResult["snapshotStatus"] = "matched"
  const errors: string[] = []
  const warnings: string[] = []

  const expectation: ScenarioExpectation | undefined = input.step.expectation
  if (expectation) {
    const assertion = assertCapture(normalizedCapture, expectation)
    errors.push(...mapIssues(assertion.errors))
    warnings.push(...mapIssues(assertion.warnings))
  }

  const hasSnapshot = await Bun.file(snapshotPath).exists()
  if (input.updateSnapshots) {
    await Bun.write(snapshotPath, normalizedCapture)
    snapshotStatus = "updated"
  } else if (!hasSnapshot) {
    snapshotStatus = "missing"
    errors.push(`Snapshot missing: ${snapshotPath}. Run with --update-snapshots to create baselines.`)
  } else {
    const expectedSnapshot = await Bun.file(snapshotPath).text()
    if (expectedSnapshot !== normalizedCapture) {
      snapshotStatus = "mismatch"
      errors.push(`Snapshot mismatch: ${snapshotPath}`)
      const diffPath = path.join(input.scenarioDir, `${basename}.diff.txt`)
      const diff = makeUnifiedDiff(expectedSnapshot, normalizedCapture)
      await Bun.write(diffPath, diff)
    }
  }

  return {
    label: input.step.label,
    artifactRawPath: rawPath,
    artifactNormalizedPath: normalizedPath,
    snapshotPath,
    snapshotStatus,
    errors,
    warnings,
  } satisfies CaptureResult
}

function printScenarioList(mode: ScenarioMode) {
  const scenarios = getScenarios(mode)
  console.log(`Scenarios (${mode})`)
  for (const scenario of scenarios) {
    console.log(`- ${scenario.id} [${scenario.category}] widths=${scenario.widths.join(",")}`)
  }
}

function printResult(result: ScenarioResult) {
  const icon = result.pass ? "PASS" : "FAIL"
  console.log(`${icon} ${result.scenarioID} @ ${result.width} (${result.durationMs}ms)`)

  for (const capture of result.captures) {
    console.log(`  - capture: ${capture.label} (${capture.snapshotStatus})`)
    if (capture.errors.length > 0) {
      for (const error of capture.errors) console.log(`    error: ${error}`)
    }
    if (capture.warnings.length > 0) {
      for (const warning of capture.warnings) console.log(`    warn: ${warning}`)
    }
  }

  for (const error of result.errors) console.log(`  error: ${error}`)
  for (const warning of result.warnings) console.log(`  warn: ${warning}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.listScenarios) {
    printScenarioList(options.mode)
    return
  }

  const knownScenarios = new Set(listScenarioIDs())
  for (const selected of options.scenarioFilter ?? []) {
    if (knownScenarios.has(selected)) continue
    throw new Error(`Unknown scenario "${selected}". Use --list to inspect available IDs.`)
  }

  let scenarios = getScenarios(options.mode)
  if (options.scenarioFilter) {
    scenarios = scenarios.filter((scenario) => options.scenarioFilter?.has(scenario.id))
  }

  if (scenarios.length === 0) {
    throw new Error("No scenarios selected")
  }

  const context = await resolveShellContext()
  await preflight(context)

  await fs.mkdir(ARTIFACT_ROOT, { recursive: true })
  await fs.mkdir(SNAPSHOT_ROOT, { recursive: true })

  const runArtifactDir = path.join(ARTIFACT_ROOT, timestampLabel())
  await fs.mkdir(runArtifactDir, { recursive: true })

  console.log(`Artifacts: ${runArtifactDir}`)
  console.log(`Snapshots: ${SNAPSHOT_ROOT}`)

  const results: ScenarioResult[] = []

  for (const scenario of scenarios) {
    const widths = resolveWidths(scenario, options.widthOverride)
    for (const width of widths) {
      const scenarioResult = await runScenario(context, scenario, width, runArtifactDir, options.updateSnapshots)
      results.push(scenarioResult)
      printResult(scenarioResult)
    }
  }

  const passed = results.filter((result) => result.pass).length
  const failed = results.length - passed
  const warnings = results.reduce((count, result) => count + result.warnings.length, 0)

  const summary = {
    mode: options.mode,
    updateSnapshots: options.updateSnapshots,
    total: results.length,
    passed,
    failed,
    warnings,
    results,
  }
  const summaryPath = path.join(runArtifactDir, "summary.json")
  await Bun.write(summaryPath, JSON.stringify(summary, null, 2))

  console.log("")
  console.log(`Completed ${results.length} scenario runs: ${passed} passed, ${failed} failed`)
  console.log(`Summary: ${summaryPath}`)

  if (failed > 0) process.exitCode = 1
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
