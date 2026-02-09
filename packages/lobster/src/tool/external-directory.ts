import path from "path"
import type { Tool } from "./tool"
import { Instance } from "../project/instance"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
}

/**
 * Validates that a file/directory target is within the project directory,
 * and prompts for permission if it is external.
 *
 * SECURITY NOTE: The `bypass` option skips ALL external directory checks.
 * It should ONLY be used when the caller has already validated the path
 * through another mechanism (e.g., the path was derived from a trusted
 * internal source, not from user/model input). Passing untrusted input
 * with bypass=true allows access to arbitrary filesystem paths.
 */
export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  if (!target) return

  // SECURITY: bypass skips all directory validation. Only use when path
  // is already verified through a trusted mechanism.
  if (options?.bypass) return

  if (Instance.containsPath(target)) return

  const kind = options?.kind ?? "file"
  const parentDir = kind === "directory" ? target : path.dirname(target)
  const glob = path.join(parentDir, "*")

  await ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: {
      filepath: target,
      parentDir,
    },
  })
}
