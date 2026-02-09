import path from "path"
import os from "os"
import fs from "fs/promises"
import { Log } from "../util/log"
import { Config } from "../config/config"
import { Env } from "../env"

export namespace VoiceInput {
  const log = Log.create({ service: "voice" })

  export interface RecordOptions {
    duration: number
    device?: string
  }

  export interface TranscribeOptions {
    model: string
    apiKey: string
    language?: string
  }

  function tempFile(): string {
    const name = `lobster-voice-${Date.now()}.wav`
    return path.join(os.tmpdir(), name)
  }

  function recordCommand(outFile: string, duration: number): string[] {
    if (process.platform === "win32") {
      // Use ffmpeg on Windows (sox doesn't support default audio device well on Windows)
      return ["ffmpeg", "-y", "-f", "dshow", "-i", "audio=default", "-t", String(duration), "-ar", "16000", "-ac", "1", outFile]
    }
    if (process.platform === "darwin") {
      // macOS: sox works well with coreaudio
      return ["sox", "-d", "-t", "wav", "-r", "16000", "-c", "1", outFile, "trim", "0", String(duration)]
    }
    // Linux: sox with ALSA/PulseAudio default
    return ["sox", "-d", "-t", "wav", "-r", "16000", "-c", "1", outFile, "trim", "0", String(duration)]
  }

  export async function record(options: RecordOptions): Promise<{ file: string; buffer: Buffer }> {
    // Clamp duration to valid range [1, 120] seconds
    const duration = Math.max(1, Math.min(120, options.duration))
    const outFile = tempFile()
    const cmd = recordCommand(outFile, duration)
    const tool = cmd[0]

    log.info("recording", { cmd: cmd.join(" "), duration })

    // Check if the recording tool is available
    const which = Bun.which(tool)
    if (!which) {
      throw new Error(
        `"${tool}" not found. Please install it:\n` +
          (process.platform === "win32"
            ? "  Windows: Install ffmpeg from https://ffmpeg.org/download.html"
            : process.platform === "darwin"
              ? "  macOS: brew install sox"
              : "  Linux: sudo apt install sox / sudo pacman -S sox"),
      )
    }

    const proc = Bun.spawn({
      cmd,
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      log.error("recording failed", { exitCode, stderr })
      throw new Error(`Recording failed (exit code ${exitCode}): ${stderr}`)
    }

    const file = Bun.file(outFile)
    const exists = await file.exists()
    if (!exists) {
      throw new Error("Recording failed: output file was not created")
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    log.info("recorded", { size: buffer.length, file: outFile })

    return { file: outFile, buffer }
  }

  export async function transcribe(audioBuffer: Buffer, options: TranscribeOptions): Promise<string> {
    log.info("transcribing", { model: options.model, size: audioBuffer.length })

    const formData = new FormData()
    formData.append("file", new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" }), "audio.wav")
    formData.append("model", options.model)
    if (options.language) {
      formData.append("language", options.language)
    }

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const body = await response.text()
      log.error("transcription failed", { status: response.status, body })
      throw new Error(`Whisper API error (${response.status}): ${body}`)
    }

    const result = (await response.json()) as { text: string }
    log.info("transcribed", { text: result.text.slice(0, 100) })
    return result.text
  }

  export async function resolveApiKey(): Promise<string> {
    // 1. Check voice-specific config
    const config = await Config.get()
    const voiceConfig = config.voice
    if (voiceConfig?.apiKey) return voiceConfig.apiKey

    // 2. Check OpenAI provider config
    const openaiProvider = config.provider?.["openai"]
    if (openaiProvider?.options?.apiKey) return openaiProvider.options.apiKey as string

    // 3. Check environment variable
    const envKey = Env.get("OPENAI_API_KEY")
    if (envKey) return envKey

    throw new Error(
      "No OpenAI API key found. Set it via:\n" +
        '  - OPENAI_API_KEY environment variable\n' +
        '  - lobster.json: { "provider": { "openai": { "options": { "apiKey": "..." } } } }\n' +
        '  - lobster.json: { "voice": { "apiKey": "..." } }',
    )
  }

  export async function listen(options: RecordOptions & Partial<TranscribeOptions>): Promise<string> {
    const apiKey = options.apiKey ?? (await resolveApiKey())
    const model = options.model ?? "whisper-1"

    const { buffer, file } = await record(options)

    try {
      const text = await transcribe(buffer, { model, apiKey })
      return text
    } finally {
      // Clean up temp file
      await fs.unlink(file).catch(() => {})
    }
  }
}
