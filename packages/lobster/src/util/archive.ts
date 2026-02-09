import { $ } from "bun"
import path from "path"

export namespace Archive {
  export async function extractZip(zipPath: string, destDir: string) {
    if (process.platform === "win32") {
      const winZipPath = path.resolve(zipPath)
      const winDestDir = path.resolve(destDir)
      // $global:ProgressPreference suppresses PowerShell's blue progress bar popup
      // Escape single quotes in paths to prevent PowerShell injection
      const safeZipPath = winZipPath.replace(/'/g, "''")
      const safeDestDir = winDestDir.replace(/'/g, "''")
      const cmd = `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -Path '${safeZipPath}' -DestinationPath '${safeDestDir}' -Force`
      await $`powershell -NoProfile -NonInteractive -Command ${cmd}`.quiet()
    } else {
      await $`unzip -o -q ${zipPath} -d ${destDir}`.quiet()
    }
  }
}
