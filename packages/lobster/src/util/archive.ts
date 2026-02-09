import { $ } from "bun"
import path from "path"

export namespace Archive {
  export async function extractZip(zipPath: string, destDir: string) {
    if (process.platform === "win32") {
      const winZipPath = path.resolve(zipPath)
      const winDestDir = path.resolve(destDir)
      // $global:ProgressPreference suppresses PowerShell's blue progress bar popup
      // Use -LiteralPath to avoid PowerShell wildcard/injection issues with special characters in paths
      const cmd = `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -LiteralPath '${winZipPath.replace(/'/g, "''")}' -DestinationPath '${winDestDir.replace(/'/g, "''")}' -Force`
      await $`powershell -NoProfile -NonInteractive -Command ${cmd}`.quiet()
    } else {
      await $`unzip -o -q ${zipPath} -d ${destDir}`.quiet()
    }
  }
}
