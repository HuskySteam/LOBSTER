/** @jsxImportSource react */
import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, type ReactNode } from "react"
import { useAppStore } from "../store"
import { useArgs } from "./args"
import { Provider } from "@/provider/provider"
import path from "path"
import { Global } from "@/global"

interface ModelRef {
  providerID: string
  modelID: string
}

interface LocalContextValue {
  agent: {
    list: () => Array<{ name: string; description?: string; native?: boolean }>
    current: () => { name: string; description?: string; native?: boolean }
    set: (name: string) => void
    move: (direction: 1 | -1) => void
  }
  model: {
    current: () => ModelRef | undefined
    set: (model: ModelRef) => void
    parsed: () => { provider: string; model: string }
  }
}

const LocalContext = createContext<LocalContextValue | undefined>(undefined)

export function LocalProvider(props: { children: ReactNode }) {
  const args = useArgs()
  const providers = useAppStore((s) => s.provider)
  const providerDefaults = useAppStore((s) => s.provider_default)
  const agents = useAppStore((s) => s.agent)
  const config = useAppStore((s) => s.config)

  // Agent state
  const visibleAgents = useMemo(
    () => agents.filter((x) => (x as any).mode !== "subagent" && !(x as any).hidden),
    [agents],
  )
  const [agentName, setAgentName] = useState(() => visibleAgents[0]?.name ?? "default")

  const agentCtx = useMemo(() => {
    const list = () => visibleAgents
    const current = () => visibleAgents.find((x) => x.name === agentName) ?? visibleAgents[0] ?? { name: "default" }
    const set = (name: string) => setAgentName(name)
    const move = (direction: 1 | -1) => {
      const idx = visibleAgents.findIndex((x) => x.name === agentName)
      let next = idx + direction
      if (next < 0) next = visibleAgents.length - 1
      if (next >= visibleAgents.length) next = 0
      const value = visibleAgents[next]
      if (value) setAgentName(value.name)
    }
    return { list, current, set, move }
  }, [visibleAgents, agentName])

  // Model state
  const [modelOverride, setModelOverride] = useState<ModelRef | undefined>()

  function isModelValid(model: ModelRef) {
    const provider = providers.find((x) => x.id === model.providerID)
    return !!provider?.models[model.modelID]
  }

  const currentModel = useMemo(() => {
    // Priority: explicit override > agent model > args > config > first available
    if (modelOverride && isModelValid(modelOverride)) return modelOverride

    const agent = agentCtx.current()
    if ((agent as any).model) {
      const am = (agent as any).model as ModelRef
      if (isModelValid(am)) return am
    }

    if (args.model) {
      const parsed = Provider.parseModel(args.model)
      if (isModelValid(parsed)) return parsed
    }

    if ((config as any).model) {
      const parsed = Provider.parseModel((config as any).model)
      if (isModelValid(parsed)) return parsed
    }

    const provider = providers[0]
    if (!provider) return undefined
    const defaultModel = providerDefaults[provider.id]
    const firstModel = Object.values(provider.models)[0]
    const modelID = defaultModel ?? firstModel?.id
    if (!modelID) return undefined
    return { providerID: provider.id, modelID }
  }, [modelOverride, agentCtx, args.model, config, providers, providerDefaults])

  const modelCtx = useMemo(() => {
    const current = () => currentModel
    const set = (model: ModelRef) => setModelOverride(model)
    const parsed = () => {
      if (!currentModel) return { provider: "No provider", model: "No model" }
      const provider = providers.find((x) => x.id === currentModel.providerID)
      const info = provider?.models[currentModel.modelID]
      return {
        provider: provider?.name ?? currentModel.providerID,
        model: info?.name ?? currentModel.modelID,
      }
    }
    return { current, set, parsed }
  }, [currentModel, providers])

  const value = useMemo(() => ({ agent: agentCtx, model: modelCtx }), [agentCtx, modelCtx])

  return <LocalContext.Provider value={value}>{props.children}</LocalContext.Provider>
}

export function useLocal() {
  const ctx = useContext(LocalContext)
  if (!ctx) throw new Error("useLocal must be used within LocalProvider")
  return ctx
}
