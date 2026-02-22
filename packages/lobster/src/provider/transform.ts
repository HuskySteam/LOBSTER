import type { APICallError, ModelMessage } from "ai"
import { mergeDeep, unique } from "remeda"
import type { JSONSchema7 } from "@ai-sdk/provider"
import type { JSONSchema } from "zod/v4/core"
import type { Provider } from "./provider"
import type { ModelsDev } from "./models"
import { iife } from "@/util/iife"

type Modality = NonNullable<ModelsDev.Model["modalities"]>["input"][number]

function mimeToModality(mime: string): Modality | undefined {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.startsWith("video/")) return "video"
  if (mime === "application/pdf") return "pdf"
  return undefined
}

export namespace ProviderTransform {
  const geminiSchemaCache = new WeakMap<object, Map<string, JSONSchema7>>()

  // Maps npm package to the key the AI SDK expects for providerOptions
  function sdkKey(npm: string): string | undefined {
    switch (npm) {
      case "@ai-sdk/github-copilot":
        return "copilot"
      case "@ai-sdk/openai":
      case "@ai-sdk/azure":
        return "openai"
      case "@ai-sdk/amazon-bedrock":
        return "bedrock"
      case "@ai-sdk/anthropic":
      case "@ai-sdk/google-vertex/anthropic":
        return "anthropic"
      case "@ai-sdk/google-vertex":
      case "@ai-sdk/google":
        return "google"
      case "@ai-sdk/gateway":
        return "gateway"
      case "@openrouter/ai-sdk-provider":
        return "openrouter"
    }
    return undefined
  }

  function normalizeMessages(
    msgs: ModelMessage[],
    model: Provider.Model,
    _options: Record<string, unknown>,
  ): ModelMessage[] {
    // Anthropic rejects messages with empty content - filter out empty string messages
    // and remove empty text/reasoning parts from array content
    if (model.api.npm === "@ai-sdk/anthropic") {
      let nextMsgs: ModelMessage[] | undefined
      for (let msgIndex = 0; msgIndex < msgs.length; msgIndex++) {
        const msg = msgs[msgIndex]
        let nextMsg: ModelMessage | undefined = msg
        if (typeof msg.content === "string") {
          if (msg.content === "") {
            nextMsg = undefined
          }
        } else if (Array.isArray(msg.content)) {
          let nextContent: any[] | undefined
          for (let partIndex = 0; partIndex < msg.content.length; partIndex++) {
            const part = msg.content[partIndex]
            const isEmptyText = (part.type === "text" || part.type === "reasoning") && part.text === ""
            if (isEmptyText) {
              nextContent ??= msg.content.slice(0, partIndex)
              continue
            }
            if (nextContent) nextContent.push(part)
          }
          if (nextContent) {
            if (nextContent.length === 0) {
              nextMsg = undefined
            } else {
              nextMsg = { ...msg, content: nextContent as any }
            }
          }
        }

        if (!nextMsg) {
          nextMsgs ??= msgs.slice(0, msgIndex)
          continue
        }
        if (nextMsg !== msg) {
          nextMsgs ??= msgs.slice(0, msgIndex)
        }
        if (nextMsgs) nextMsgs.push(nextMsg)
      }
      if (nextMsgs) {
        msgs = nextMsgs
      }
    }

    if (model.api.npm === "@ai-sdk/anthropic" || model.api.id.includes("claude")) {
      let nextMsgs: ModelMessage[] | undefined
      for (let msgIndex = 0; msgIndex < msgs.length; msgIndex++) {
        const msg = msgs[msgIndex]
        let nextMsg = msg
        if ((msg.role === "assistant" || msg.role === "tool") && Array.isArray(msg.content)) {
          let nextContent: any[] | undefined
          for (let partIndex = 0; partIndex < msg.content.length; partIndex++) {
            const part = msg.content[partIndex]
            if (
              (part.type === "tool-call" || part.type === "tool-result") &&
              "toolCallId" in part &&
              typeof part.toolCallId === "string"
            ) {
              const normalizedId = part.toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_")
              if (normalizedId !== part.toolCallId) {
                nextContent ??= msg.content.slice(0, partIndex)
                nextContent.push({
                  ...part,
                  toolCallId: normalizedId,
                } as any)
                continue
              }
            }
            if (nextContent) nextContent.push(part)
          }
          if (nextContent) {
            nextMsg = {
              ...msg,
              content: nextContent as any,
            }
          }
        }
        if (nextMsg !== msg) {
          nextMsgs ??= msgs.slice(0, msgIndex)
        }
        if (nextMsgs) nextMsgs.push(nextMsg)
      }
      return nextMsgs ?? msgs
    }
    if (
      model.api.npm === "@ai-sdk/mistral" ||
      model.providerID === "mistral" ||
      model.api.id.toLowerCase().includes("mistral") ||
      model.api.id.toLocaleLowerCase().includes("devstral")
    ) {
      const result: ModelMessage[] = []
      let changed = false
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i]
        const nextMsg = msgs[i + 1]
        let current = msg

        if ((msg.role === "assistant" || msg.role === "tool") && Array.isArray(msg.content)) {
          let nextContent: any[] | undefined
          for (let partIndex = 0; partIndex < msg.content.length; partIndex++) {
            const part = msg.content[partIndex]
            if (
              (part.type === "tool-call" || part.type === "tool-result") &&
              "toolCallId" in part &&
              typeof part.toolCallId === "string"
            ) {
              // Mistral requires alphanumeric tool call IDs with exactly 9 characters
              // Use xxHash32 to avoid collisions from simple truncation
              const hash = Bun.hash.xxHash32(part.toolCallId).toString(36)
              const normalizedId = hash
                .replace(/[^a-zA-Z0-9]/g, "")
                .substring(0, 9)
                .padEnd(9, "0")
              if (normalizedId !== part.toolCallId) {
                nextContent ??= msg.content.slice(0, partIndex)
                nextContent.push({
                  ...part,
                  toolCallId: normalizedId,
                } as any)
                continue
              }
            }
            if (nextContent) nextContent.push(part)
          }
          if (nextContent) {
            current = {
              ...msg,
              content: nextContent as any,
            }
            changed = true
          }
        }

        result.push(current)

        // Fix message sequence: tool messages cannot be followed by user messages
        if (msg.role === "tool" && nextMsg?.role === "user") {
          result.push({
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Done.",
              },
            ],
          })
          changed = true
        }
      }
      return changed ? result : msgs
    }

    if (typeof model.capabilities.interleaved === "object" && model.capabilities.interleaved.field) {
      const field = model.capabilities.interleaved.field
      const providerKey = sdkKey(model.api.npm) ?? "openaiCompatible"
      let nextMsgs: ModelMessage[] | undefined
      for (let msgIndex = 0; msgIndex < msgs.length; msgIndex++) {
        const msg = msgs[msgIndex]
        let nextMsg = msg
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          let reasoningText = ""
          let filteredContent: any[] | undefined
          for (let partIndex = 0; partIndex < msg.content.length; partIndex++) {
            const part = msg.content[partIndex] as any
            if (part.type === "reasoning") {
              filteredContent ??= msg.content.slice(0, partIndex)
              reasoningText += part.text ?? ""
              continue
            }
            if (filteredContent) filteredContent.push(part)
          }

          if (filteredContent && reasoningText) {
            nextMsg = {
              ...msg,
              content: filteredContent as any,
              providerOptions: {
                ...msg.providerOptions,
                [providerKey]: {
                  ...(msg.providerOptions as any)?.[providerKey],
                  [field]: reasoningText,
                },
              },
            }
          } else if (filteredContent) {
            nextMsg = {
              ...msg,
              content: filteredContent as any,
            }
          }
        }
        if (nextMsg !== msg) {
          nextMsgs ??= msgs.slice(0, msgIndex)
        }
        if (nextMsgs) nextMsgs.push(nextMsg)
      }
      return nextMsgs ?? msgs
    }

    return msgs
  }

  function applyCaching(msgs: ModelMessage[], providerID: string): ModelMessage[] {
    const system = msgs.filter((msg) => msg.role === "system").slice(0, 2)
    const final = msgs.filter((msg) => msg.role !== "system").slice(-2)

    const providerOptions = {
      anthropic: {
        cacheControl: { type: "ephemeral" },
      },
      openrouter: {
        cacheControl: { type: "ephemeral" },
      },
      bedrock: {
        cachePoint: { type: "default" },
      },
      openaiCompatible: {
        cache_control: { type: "ephemeral" },
      },
      copilot: {
        copilot_cache_control: { type: "ephemeral" },
      },
    }

    for (const msg of unique([...system, ...final])) {
      const useMessageLevelOptions = providerID === "anthropic" || providerID.includes("bedrock")
      const shouldUseContentOptions = !useMessageLevelOptions && Array.isArray(msg.content) && msg.content.length > 0

      if (shouldUseContentOptions) {
        const lastContent = msg.content[msg.content.length - 1]
        if (lastContent && typeof lastContent === "object") {
          lastContent.providerOptions = mergeDeep(lastContent.providerOptions ?? {}, providerOptions)
          continue
        }
      }

      msg.providerOptions = mergeDeep(msg.providerOptions ?? {}, providerOptions)
    }

    return msgs
  }

  function parseDataUrlImage(image: unknown): { mime?: string; isBase64: boolean; payload: string } | undefined {
    if (typeof image !== "string") return undefined
    if (!image.startsWith("data:")) return undefined
    const commaIndex = image.indexOf(",")
    if (commaIndex === -1) return undefined
    const metadata = image.slice("data:".length, commaIndex)
    const semicolonIndex = metadata.indexOf(";")
    const mime = semicolonIndex === -1 ? metadata : metadata.slice(0, semicolonIndex)
    return {
      mime: mime || undefined,
      isBase64: metadata.includes(";base64"),
      payload: image.slice(commaIndex + 1),
    }
  }

  function partMime(part: any): string | undefined {
    if (typeof part.mediaType === "string" && part.mediaType) return part.mediaType
    const metadata = part.metadata
    if (metadata && typeof metadata === "object") {
      if (typeof metadata.mediaType === "string" && metadata.mediaType) return metadata.mediaType
      if (typeof metadata.mimeType === "string" && metadata.mimeType) return metadata.mimeType
    }
    if (part.type === "image") {
      return parseDataUrlImage(part.image)?.mime
    }
    return undefined
  }

  function unsupportedParts(msgs: ModelMessage[], model: Provider.Model): ModelMessage[] {
    let nextMsgs: ModelMessage[] | undefined
    for (let msgIndex = 0; msgIndex < msgs.length; msgIndex++) {
      const msg = msgs[msgIndex]
      if (msg.role !== "user" || !Array.isArray(msg.content)) {
        if (nextMsgs) nextMsgs.push(msg)
        continue
      }

      let nextContent: typeof msg.content | undefined
      for (let partIndex = 0; partIndex < msg.content.length; partIndex++) {
        const part = msg.content[partIndex] as any
        if (part.type !== "file" && part.type !== "image") {
          if (nextContent) nextContent.push(part)
          continue
        }

        // Check for empty base64 image data only when we have a data URL.
        if (part.type === "image") {
          const parsed = parseDataUrlImage(part.image)
          if (parsed?.isBase64 && parsed.payload.length === 0) {
            nextContent ??= msg.content.slice(0, partIndex)
            nextContent.push({
              type: "text" as const,
              text: "ERROR: Image file is empty or corrupted. Please provide a valid image.",
            })
            continue
          }
        }

        const mime = partMime(part)
        if (!mime) {
          if (nextContent) nextContent.push(part)
          continue
        }
        const modality = mimeToModality(mime)
        if (!modality || model.capabilities.input[modality]) {
          if (nextContent) nextContent.push(part)
          continue
        }

        nextContent ??= msg.content.slice(0, partIndex)
        const name = part.type === "file" && part.filename ? `"${part.filename}"` : modality
        nextContent.push({
          type: "text" as const,
          text: `ERROR: Cannot read ${name} (this model does not support ${modality} input). Inform the user.`,
        })
      }

      if (!nextContent) {
        if (nextMsgs) nextMsgs.push(msg)
        continue
      }

      nextMsgs ??= msgs.slice(0, msgIndex)
      nextMsgs.push({
        ...msg,
        content: nextContent,
      })
    }

    return nextMsgs ?? msgs
  }

  export function message(msgs: ModelMessage[], model: Provider.Model, options: Record<string, unknown>) {
    msgs = unsupportedParts(msgs, model)
    msgs = normalizeMessages(msgs, model, options)
    if (
      model.providerID === "anthropic" ||
      model.api.id.includes("anthropic") ||
      model.api.id.includes("claude") ||
      model.id.includes("anthropic") ||
      model.id.includes("claude") ||
      model.api.npm === "@ai-sdk/anthropic"
    ) {
      msgs = applyCaching(msgs, model.providerID)
    }

    // Remap providerOptions keys from stored providerID to expected SDK key
    const key = sdkKey(model.api.npm)
    if (key && key !== model.providerID && model.api.npm !== "@ai-sdk/azure") {
      const remap = (opts: Record<string, any> | undefined) => {
        if (!opts) return opts
        if (!(model.providerID in opts)) return opts
        const result = { ...opts }
        result[key] = result[model.providerID]
        delete result[model.providerID]
        return result
      }

      let nextMsgs: ModelMessage[] | undefined
      for (let msgIndex = 0; msgIndex < msgs.length; msgIndex++) {
        const msg = msgs[msgIndex]
        const remappedMessageOptions = remap(msg.providerOptions)
        let nextMsg = msg as ModelMessage

        if (Array.isArray(msg.content)) {
          let nextContent: any[] | undefined
          for (let partIndex = 0; partIndex < msg.content.length; partIndex++) {
            const part = msg.content[partIndex] as any
            const remappedPartOptions = remap(part.providerOptions)
            if (remappedPartOptions !== part.providerOptions) {
              nextContent ??= msg.content.slice(0, partIndex)
              nextContent.push({
                ...part,
                providerOptions: remappedPartOptions,
              })
              continue
            }
            if (nextContent) nextContent.push(part)
          }

          if (nextContent || remappedMessageOptions !== msg.providerOptions) {
              nextMsg = {
                ...msg,
                providerOptions: remappedMessageOptions,
                content: (nextContent ?? msg.content) as any,
              } as typeof msg
          }
        } else if (remappedMessageOptions !== msg.providerOptions) {
          nextMsg = {
            ...msg,
            providerOptions: remappedMessageOptions,
          } as typeof msg
        }

        if (nextMsg !== msg) {
          nextMsgs ??= msgs.slice(0, msgIndex)
        }
        if (nextMsgs) nextMsgs.push(nextMsg)
      }
      if (nextMsgs) msgs = nextMsgs
    }

    return msgs
  }

  export function temperature(model: Provider.Model) {
    const id = model.id.toLowerCase()
    if (id.includes("qwen")) return 0.55
    if (id.includes("claude")) return undefined
    if (id.includes("gemini")) return 1.0
    if (id.includes("glm-4.6")) return 1.0
    if (id.includes("glm-4.7")) return 1.0
    if (id.includes("minimax-m2")) return 1.0
    if (id.includes("kimi-k2")) {
      // kimi-k2-thinking & kimi-k2.5 && kimi-k2p5
      if (id.includes("thinking") || id.includes("k2.") || id.includes("k2p")) {
        return 1.0
      }
      return 0.6
    }
    return undefined
  }

  export function topP(model: Provider.Model) {
    const id = model.id.toLowerCase()
    if (id.includes("qwen")) return 1
    if (id.includes("minimax-m2") || id.includes("kimi-k2.5") || id.includes("kimi-k2p5") || id.includes("gemini")) {
      return 0.95
    }
    return undefined
  }

  export function topK(model: Provider.Model) {
    const id = model.id.toLowerCase()
    if (id.includes("minimax-m2")) {
      if (id.includes("m2.1")) return 40
      return 20
    }
    if (id.includes("gemini")) return 64
    return undefined
  }

  const WIDELY_SUPPORTED_EFFORTS = ["low", "medium", "high"]
  const OPENAI_EFFORTS = ["none", "minimal", ...WIDELY_SUPPORTED_EFFORTS, "xhigh"]

  export function variants(model: Provider.Model): Record<string, Record<string, any>> {
    if (!model.capabilities.reasoning) return {}

    const id = model.id.toLowerCase()
    if (
      id.includes("deepseek") ||
      id.includes("minimax") ||
      id.includes("glm") ||
      id.includes("mistral") ||
      id.includes("kimi") ||
      // TODO: Remove this after models.dev data is fixed to use "kimi-k2.5" instead of "k2p5"
      id.includes("k2p5")
    )
      return {}

    // see: https://docs.x.ai/docs/guides/reasoning#control-how-hard-the-model-thinks
    if (id.includes("grok") && id.includes("grok-3-mini")) {
      if (model.api.npm === "@openrouter/ai-sdk-provider") {
        return {
          low: { reasoning: { effort: "low" } },
          high: { reasoning: { effort: "high" } },
        }
      }
      return {
        low: { reasoningEffort: "low" },
        high: { reasoningEffort: "high" },
      }
    }
    if (id.includes("grok")) return {}

    switch (model.api.npm) {
      case "@openrouter/ai-sdk-provider":
        if (!model.id.includes("gpt") && !model.id.includes("gemini-3")) return {}
        return Object.fromEntries(OPENAI_EFFORTS.map((effort) => [effort, { reasoning: { effort } }]))

      // TODO: YOU CANNOT SET max_tokens if this is set!!!
      case "@ai-sdk/gateway":
        return Object.fromEntries(OPENAI_EFFORTS.map((effort) => [effort, { reasoningEffort: effort }]))

      case "@ai-sdk/github-copilot":
        if (model.id.includes("gemini")) {
          // currently github copilot only returns thinking
          return {}
        }
        if (model.id.includes("claude")) {
          return {
            thinking: { thinking_budget: 4000 },
          }
        }
        const copilotEfforts = iife(() => {
          if (id.includes("5.1-codex-max") || id.includes("5.2") || id.includes("5.3"))
            return [...WIDELY_SUPPORTED_EFFORTS, "xhigh"]
          return WIDELY_SUPPORTED_EFFORTS
        })
        return Object.fromEntries(
          copilotEfforts.map((effort) => [
            effort,
            {
              reasoningEffort: effort,
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            },
          ]),
        )

      case "@ai-sdk/cerebras":
      // https://v5.ai-sdk.dev/providers/ai-sdk-providers/cerebras
      case "@ai-sdk/togetherai":
      // https://v5.ai-sdk.dev/providers/ai-sdk-providers/togetherai
      case "@ai-sdk/xai":
      // https://v5.ai-sdk.dev/providers/ai-sdk-providers/xai
      case "@ai-sdk/deepinfra":
      // https://v5.ai-sdk.dev/providers/ai-sdk-providers/deepinfra
      case "@ai-sdk/openai-compatible":
        return Object.fromEntries(WIDELY_SUPPORTED_EFFORTS.map((effort) => [effort, { reasoningEffort: effort }]))

      case "@ai-sdk/azure":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/azure
        if (id === "o1-mini") return {}
        const azureEfforts = ["low", "medium", "high"]
        if (id.includes("gpt-5-") || id === "gpt-5") {
          azureEfforts.unshift("minimal")
        }
        return Object.fromEntries(
          azureEfforts.map((effort) => [
            effort,
            {
              reasoningEffort: effort,
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            },
          ]),
        )
      case "@ai-sdk/openai":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/openai
        if (id === "gpt-5-pro") return {}
        const openaiEfforts = iife(() => {
          if (id.includes("codex")) {
            if (id.includes("5.2") || id.includes("5.3")) return [...WIDELY_SUPPORTED_EFFORTS, "xhigh"]
            return WIDELY_SUPPORTED_EFFORTS
          }
          const arr = [...WIDELY_SUPPORTED_EFFORTS]
          if (id.includes("gpt-5-") || id === "gpt-5") {
            arr.unshift("minimal")
          }
          if (model.release_date >= "2025-11-13") {
            arr.unshift("none")
          }
          if (model.release_date >= "2025-12-04") {
            arr.push("xhigh")
          }
          return arr
        })
        return Object.fromEntries(
          openaiEfforts.map((effort) => [
            effort,
            {
              reasoningEffort: effort,
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            },
          ]),
        )

      case "@ai-sdk/anthropic":
      // https://v5.ai-sdk.dev/providers/ai-sdk-providers/anthropic
      case "@ai-sdk/google-vertex/anthropic":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/google-vertex#anthropic-provider
        return {
          high: {
            thinking: {
              type: "enabled",
              budgetTokens: Math.min(16_000, Math.floor(model.limit.output / 2 - 1)),
            },
          },
          max: {
            thinking: {
              type: "enabled",
              budgetTokens: Math.min(31_999, model.limit.output - 1),
            },
          },
        }

      case "@ai-sdk/amazon-bedrock":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock
        // For Anthropic models on Bedrock, use reasoningConfig with budgetTokens
        if (model.api.id.includes("anthropic")) {
          return {
            high: {
              reasoningConfig: {
                type: "enabled",
                budgetTokens: 16000,
              },
            },
            max: {
              reasoningConfig: {
                type: "enabled",
                budgetTokens: 31999,
              },
            },
          }
        }

        // For Amazon Nova models, use reasoningConfig with maxReasoningEffort
        return Object.fromEntries(
          WIDELY_SUPPORTED_EFFORTS.map((effort) => [
            effort,
            {
              reasoningConfig: {
                type: "enabled",
                maxReasoningEffort: effort,
              },
            },
          ]),
        )

      case "@ai-sdk/google-vertex":
      // https://v5.ai-sdk.dev/providers/ai-sdk-providers/google-vertex
      case "@ai-sdk/google":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai
        if (id.includes("2.5")) {
          return {
            high: {
              thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 16000,
              },
            },
            max: {
              thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 24576,
              },
            },
          }
        }
        return Object.fromEntries(
          ["low", "high"].map((effort) => [
            effort,
            {
              includeThoughts: true,
              thinkingLevel: effort,
            },
          ]),
        )

      case "@ai-sdk/mistral":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/mistral
        return {}

      case "@ai-sdk/cohere":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/cohere
        return {}

      case "@ai-sdk/groq":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/groq
        const groqEffort = ["none", ...WIDELY_SUPPORTED_EFFORTS]
        return Object.fromEntries(
          groqEffort.map((effort) => [
            effort,
            {
              includeThoughts: true,
              thinkingLevel: effort,
            },
          ]),
        )

      case "@ai-sdk/perplexity":
        // https://v5.ai-sdk.dev/providers/ai-sdk-providers/perplexity
        return {}

      case "@mymediset/sap-ai-provider":
      case "@jerome-benoit/sap-ai-provider-v2":
        if (model.api.id.includes("anthropic")) {
          return {
            high: {
              thinking: {
                type: "enabled",
                budgetTokens: 16000,
              },
            },
            max: {
              thinking: {
                type: "enabled",
                budgetTokens: 31999,
              },
            },
          }
        }
        return Object.fromEntries(WIDELY_SUPPORTED_EFFORTS.map((effort) => [effort, { reasoningEffort: effort }]))
    }
    return {}
  }

  export function options(input: {
    model: Provider.Model
    sessionID: string
    providerOptions?: Record<string, any>
  }): Record<string, any> {
    const result: Record<string, any> = {}

    // openai and providers using openai package should set store to false by default.
    if (
      input.model.providerID === "openai" ||
      input.model.api.npm === "@ai-sdk/openai" ||
      input.model.api.npm === "@ai-sdk/github-copilot"
    ) {
      result["store"] = false
    }

    if (input.model.api.npm === "@openrouter/ai-sdk-provider") {
      result["usage"] = {
        include: true,
      }
      if (input.model.api.id.includes("gemini-3")) {
        result["reasoning"] = { effort: "high" }
      }
    }

    if (
      input.model.providerID === "baseten"
    ) {
      result["chat_template_args"] = { enable_thinking: true }
    }

    if (["zai", "zhipuai"].includes(input.model.providerID) && input.model.api.npm === "@ai-sdk/openai-compatible") {
      result["thinking"] = {
        type: "enabled",
        clear_thinking: false,
      }
    }

    if (input.model.providerID === "openai" || input.providerOptions?.setCacheKey) {
      result["promptCacheKey"] = input.sessionID
    }

    if (input.model.api.npm === "@ai-sdk/google" || input.model.api.npm === "@ai-sdk/google-vertex") {
      result["thinkingConfig"] = {
        includeThoughts: true,
      }
      if (input.model.api.id.includes("gemini-3")) {
        result["thinkingConfig"]["thinkingLevel"] = "high"
      }
    }

    // Enable thinking by default for kimi-k2.5/k2p5 models using anthropic SDK
    const modelId = input.model.api.id.toLowerCase()
    if (
      (input.model.api.npm === "@ai-sdk/anthropic" || input.model.api.npm === "@ai-sdk/google-vertex/anthropic") &&
      (modelId.includes("k2p5") || modelId.includes("kimi-k2.5") || modelId.includes("kimi-k2p5"))
    ) {
      result["thinking"] = {
        type: "enabled",
        budgetTokens: Math.min(16_000, Math.floor(input.model.limit.output / 2 - 1)),
      }
    }

    if (input.model.api.id.includes("gpt-5") && !input.model.api.id.includes("gpt-5-chat")) {
      if (!input.model.api.id.includes("gpt-5-pro")) {
        result["reasoningEffort"] = "medium"
      }

      // Only set textVerbosity for non-chat gpt-5.x models
      // Chat models (e.g. gpt-5.2-chat-latest) only support "medium" verbosity
      if (
        input.model.api.id.includes("gpt-5.") &&
        !input.model.api.id.includes("codex") &&
        !input.model.api.id.includes("-chat") &&
        input.model.providerID !== "azure"
      ) {
        result["textVerbosity"] = "low"
      }

    }

    if (input.model.providerID === "venice") {
      result["promptCacheKey"] = input.sessionID
    }

    return result
  }

  export function smallOptions(model: Provider.Model) {
    if (
      model.providerID === "openai" ||
      model.api.npm === "@ai-sdk/openai" ||
      model.api.npm === "@ai-sdk/github-copilot"
    ) {
      if (model.api.id.includes("gpt-5")) {
        if (model.api.id.includes("5.")) {
          return { store: false, reasoningEffort: "low" }
        }
        return { store: false, reasoningEffort: "minimal" }
      }
      return { store: false }
    }
    if (model.providerID === "google") {
      // gemini-3 uses thinkingLevel, gemini-2.5 uses thinkingBudget
      if (model.api.id.includes("gemini-3")) {
        return { thinkingConfig: { thinkingLevel: "minimal" } }
      }
      return { thinkingConfig: { thinkingBudget: 0 } }
    }
    if (model.providerID === "openrouter") {
      if (model.api.id.includes("google")) {
        return { reasoning: { enabled: false } }
      }
      return { reasoningEffort: "minimal" }
    }
    return {}
  }

  export function providerOptions(model: Provider.Model, options: { [x: string]: any }) {
    const key = sdkKey(model.api.npm) ?? model.providerID
    return { [key]: options }
  }

  export function maxOutputTokens(
    npm: string,
    options: Record<string, any>,
    modelLimit: number,
    globalLimit: number,
  ): number {
    const modelCap = modelLimit || globalLimit
    const standardLimit = Math.min(modelCap, globalLimit)

    if (npm === "@ai-sdk/anthropic" || npm === "@ai-sdk/google-vertex/anthropic") {
      const thinking = options?.["thinking"]
      const budgetTokens = typeof thinking?.["budgetTokens"] === "number" ? thinking["budgetTokens"] : 0
      const enabled = thinking?.["type"] === "enabled"
      if (enabled && budgetTokens > 0) {
        // Return text tokens so that text + thinking <= model cap, preferring 32k text when possible.
        if (budgetTokens + standardLimit <= modelCap) {
          return standardLimit
        }
        return modelCap - budgetTokens
      }
    }

    return standardLimit
  }

  export function schema(model: Provider.Model, schema: JSONSchema.BaseSchema | JSONSchema7): JSONSchema7 {
    /*
    if (["openai", "azure"].includes(providerID)) {
      if (schema.type === "object" && schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          if (schema.required?.includes(key)) continue
          schema.properties[key] = {
            anyOf: [
              value as JSONSchema.JSONSchema,
              {
                type: "null",
              },
            ],
          }
        }
      }
    }
    */

    // Convert integer enums to string enums for Google/Gemini
    if (model.providerID === "google" || model.api.id.includes("gemini")) {
      const cacheKey = `${model.providerID}:${model.api.id}`
      if (schema && typeof schema === "object") {
        const perModel = geminiSchemaCache.get(schema as object)
        const cached = perModel?.get(cacheKey)
        if (cached) return cached
      }

      const sanitizeGemini = (obj: any): any => {
        if (obj === null || typeof obj !== "object") {
          return obj
        }

        if (Array.isArray(obj)) {
          return obj.map(sanitizeGemini)
        }

        const result: any = {}
        for (const [key, value] of Object.entries(obj)) {
          if (key === "enum" && Array.isArray(value)) {
            // Convert all enum values to strings
            result[key] = value.map((v) => String(v))
            // If we have integer type with enum, change type to string and note the conversion
            if (result.type === "integer" || result.type === "number") {
              const originalType = result.type
              result.type = "string"
              const note = `(Converted from ${originalType} enum to string for Gemini compatibility)`
              result.description = result.description ? `${result.description} ${note}` : note
            }
          } else if (typeof value === "object" && value !== null) {
            result[key] = sanitizeGemini(value)
          } else {
            result[key] = value
          }
        }

        // Filter required array to only include fields that exist in properties
        if (result.type === "object" && result.properties && Array.isArray(result.required)) {
          result.required = result.required.filter((field: any) => field in result.properties)
        }

        if (result.type === "array") {
          if (result.items == null) {
            result.items = {}
          }
          // Ensure items has at least a type if it's an empty object
          // This handles nested arrays like { type: "array", items: { type: "array", items: {} } }
          if (typeof result.items === "object" && !Array.isArray(result.items) && !result.items.type) {
            result.items.type = "string"
          }
        }

        // Remove properties/required from non-object types (Gemini rejects these)
        if (result.type && result.type !== "object") {
          delete result.properties
          delete result.required
        }

        return result
      }

      const sanitized = sanitizeGemini(schema) as JSONSchema7
      if (schema && typeof schema === "object") {
        const key = schema as object
        const existing = geminiSchemaCache.get(key)
        if (existing) {
          existing.set(cacheKey, sanitized)
        } else {
          geminiSchemaCache.set(key, new Map([[cacheKey, sanitized]]))
        }
      }
      schema = sanitized
    }

    return schema as JSONSchema7
  }

  export function error(providerID: string, error: APICallError) {
    let message = error.message
    if (providerID.includes("github-copilot") && error.statusCode === 403) {
      return "Please reauthenticate with the copilot provider to ensure your credentials work properly with Lobster."
    }
    if (providerID.includes("github-copilot") && message.includes("The requested model is not supported")) {
      return (
        message +
        "\n\nMake sure the model is enabled in your copilot settings: https://github.com/settings/copilot/features"
      )
    }

    return message
  }
}
