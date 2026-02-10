import { Log } from "../util/log"

export namespace AgentState {
  const log = Log.create({ service: "agent.state" })

  export type Mode = "build" | "plan"

  export interface State {
    mode: Mode
    agentName: string
    planFile?: string
    enteredAt: number
  }

  // In-memory state per session
  const sessions = new Map<string, State>()

  export function get(sessionID: string): State | undefined {
    return sessions.get(sessionID)
  }

  export function set(sessionID: string, state: State): void {
    sessions.set(sessionID, state)
    log.info("state set", { sessionID, mode: state.mode, agent: state.agentName })
  }

  export function transition(sessionID: string, mode: Mode, agentName: string, planFile?: string): State {
    const prev = sessions.get(sessionID)
    const next: State = {
      mode,
      agentName,
      planFile: planFile ?? prev?.planFile,
      enteredAt: Date.now(),
    }
    sessions.set(sessionID, next)
    log.info("state transition", { sessionID, from: prev?.mode, to: mode, agent: agentName })
    return next
  }

  export function clear(sessionID: string): void {
    sessions.delete(sessionID)
  }

  export function isInPlanMode(sessionID: string): boolean {
    return sessions.get(sessionID)?.mode === "plan"
  }
}
