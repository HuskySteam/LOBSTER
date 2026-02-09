#!/usr/bin/env pwsh
#Requires -Version 5.1

$ErrorActionPreference = "Stop"

$Repo = "HuskySteam/LOBSTER"
$BinaryName = "lobster.exe"
$InstallDir = Join-Path $env:LOCALAPPDATA "lobster\bin"

# ─── Colors ──────────────────────────────────────────────────────
function Write-Colored {
    param([string]$Text, [ConsoleColor]$Color = "White")
    Write-Host $Text -ForegroundColor $Color -NoNewline
}

function Write-Line {
    param([string]$Text, [ConsoleColor]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "  " -NoNewline
    Write-Colored "|" Cyan
    Write-Host ""
    Write-Host "  " -NoNewline
    Write-Colored "+-" Cyan
    Write-Host " $Message" -ForegroundColor White
}

function Write-Info {
    param([string]$Message)
    Write-Host "  " -NoNewline
    Write-Colored "|" Cyan
    Write-Host "  $Message"
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  " -NoNewline
    Write-Colored "|" Cyan
    Write-Host "  " -NoNewline
    Write-Colored "[OK] " Green
    Write-Host "$Message"
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  " -NoNewline
    Write-Colored "|" Cyan
    Write-Host "  " -NoNewline
    Write-Colored "[!!] " Yellow
    Write-Host "$Message"
}

function Write-Err {
    param([string]$Message)
    Write-Host "  " -NoNewline
    Write-Colored "|" Cyan
    Write-Host "  " -NoNewline
    Write-Colored "[FAIL] " Red
    Write-Host "$Message"
    Write-Host "  " -NoNewline
    Write-Line "|" Red
    exit 1
}

function Show-Banner {
    Write-Host ""
    Write-Line "  +============================================================+" Red
    Write-Line "  |                                                            |" Red
    Write-Host "  " -NoNewline; Write-Colored "|" Red
    Write-Host "   " -NoNewline
    Write-Colored "██╗      ██████╗ ██████╗ ███████╗████████╗███████╗██████╗" White
    Write-Line "  |" Red
    Write-Host "  " -NoNewline; Write-Colored "|" Red
    Write-Host "   " -NoNewline
    Write-Colored "██║     ██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗" White
    Write-Line " |" Red
    Write-Host "  " -NoNewline; Write-Colored "|" Red
    Write-Host "   " -NoNewline
    Write-Colored "██║     ██║   ██║██████╔╝███████╗   ██║   █████╗  ██████╔╝" White
    Write-Line " |" Red
    Write-Host "  " -NoNewline; Write-Colored "|" Red
    Write-Host "   " -NoNewline
    Write-Colored "██║     ██║   ██║██╔══██╗╚════██║   ██║   ██╔══╝  ██╔══██╗" White
    Write-Line " |" Red
    Write-Host "  " -NoNewline; Write-Colored "|" Red
    Write-Host "   " -NoNewline
    Write-Colored "███████╗╚██████╔╝██████╔╝███████║   ██║   ███████╗██║  ██║" White
    Write-Line " |" Red
    Write-Host "  " -NoNewline; Write-Colored "|" Red
    Write-Host "   " -NoNewline
    Write-Colored "╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝" White
    Write-Line "|" Red
    Write-Line "  |                                                            |" Red
    Write-Host "  " -NoNewline; Write-Colored "|" Red
    Write-Host "   " -NoNewline
    Write-Colored "AI-Powered Coding Agent with a Development Team" DarkGray
    Write-Line "        |" Red
    Write-Line "  |                                                            |" Red
    Write-Line "  +============================================================+" Red
    Write-Host ""
    Write-Host "  " -NoNewline
    Write-Colored "+-" Cyan
    Write-Line " Installer" White
    Write-Host "  " -NoNewline
    Write-Line "|" Cyan
}

# ─── Detect Architecture ────────────────────────────────────────
function Get-Arch {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($arch -ne "AMD64") {
        Write-Err "Unsupported architecture: $arch. Only Windows x64 (AMD64) is supported."
    }
    return "x64"
}

# ─── Archive Name ────────────────────────────────────────────────
function Get-ArchiveName {
    param([string]$Arch)
    if ($env:LOBSTER_BASELINE -eq "1") {
        return "lobster-windows-${Arch}-baseline.zip"
    }
    return "lobster-windows-${Arch}.zip"
}

# ─── Version ─────────────────────────────────────────────────────
function Get-Version {
    if ($env:LOBSTER_VERSION) {
        return $env:LOBSTER_VERSION
    }
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "lobster-installer" }
        $tag = $release.tag_name
        if ($tag -match "^v(.+)$") { return $Matches[1] }
        return $tag
    }
    catch {
        Write-Err "Could not determine latest version. Set `$env:LOBSTER_VERSION manually."
    }
}

# ─── Progress Bar ────────────────────────────────────────────────
function Show-Progress {
    param([int]$Percent)
    $width = 30
    $filled = [Math]::Floor($Percent * $width / 100)
    $empty = $width - $filled
    $bar = ("█" * $filled) + ("░" * $empty)
    Write-Host "`r  " -NoNewline
    Write-Colored "|" Cyan
    Write-Host "  [" -NoNewline
    Write-Colored $bar.Substring(0, $filled) Green
    Write-Colored $bar.Substring($filled) DarkGray
    Write-Host "] $Percent%" -NoNewline
}

# ─── Main ────────────────────────────────────────────────────────
function Install-Lobster {
    Show-Banner

    # Step 1: Detect system
    Write-Step "Detecting system"
    $arch = Get-Arch
    Write-Ok "Platform: windows $arch"

    # Step 2: Resolve version
    Write-Step "Resolving version"
    $version = Get-Version
    Write-Ok "Version: v$version"

    # Step 3: Download
    Write-Step "Downloading"
    $archive = Get-ArchiveName -Arch $arch
    $url = "https://github.com/$Repo/releases/download/v${version}/$archive"
    Write-Info $archive

    $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "lobster-install-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    try {
        $tmpFile = Join-Path $tmpDir $archive
        try {
            # Download with progress
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $url -OutFile $tmpFile -UseBasicParsing
            $ProgressPreference = 'Continue'
        }
        catch {
            Write-Err "Download failed. Check https://github.com/$Repo/releases"
        }
        Write-Ok "Downloaded"

        # Step 4: Install
        Write-Step "Installing"
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }
        Write-Info "-> $InstallDir"
        Expand-Archive -Path $tmpFile -DestinationPath $InstallDir -Force
        Write-Ok "Binary installed"
    }
    finally {
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Step 5: PATH
    Write-Step "Configuring PATH"
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$InstallDir*") {
        $newPath = "$InstallDir;$currentPath"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Ok "Added to user PATH"
    } else {
        Write-Ok "Already in PATH"
    }
    if ($env:Path -notlike "*$InstallDir*") {
        $env:Path = "$InstallDir;$env:Path"
    }

    # Done
    Write-Host ""
    Write-Host "  " -NoNewline
    Write-Colored "|" Cyan
    Write-Host ""

    $binaryPath = Join-Path $InstallDir $BinaryName
    if (Test-Path $binaryPath) {
        Write-Host "  " -NoNewline
        Write-Colored "+-" Green
        Write-Line " Installation complete!" Green
        Write-Host ""
        Write-Line "  +------------------------------------------+" DarkGray
        Write-Line "  |                                          |" DarkGray
        Write-Host "  " -NoNewline; Write-Colored "|" DarkGray
        Write-Host "   LOBSTER " -NoNewline -ForegroundColor White
        Write-Host "v$version" -NoNewline -ForegroundColor Cyan
        Write-Line " installed successfully   |" DarkGray
        Write-Line "  |                                          |" DarkGray
        Write-Host "  " -NoNewline; Write-Colored "|" DarkGray
        Write-Host "   Run " -NoNewline
        Write-Colored "lobster" Cyan
        Write-Line " to get started             |" DarkGray
        Write-Line "  |                                          |" DarkGray
        Write-Line "  +------------------------------------------+" DarkGray
        Write-Host ""

        try {
            $versionOutput = & $binaryPath --version 2>&1
            Write-Info "Installed: $versionOutput"
        }
        catch {
            Write-Info "Installed: v$version"
        }

        Write-Host ""
        Write-Warn "Restart your terminal for PATH changes to take effect."
        Write-Host ""
    }
    else {
        Write-Err "Installation failed - binary not found at $binaryPath"
    }
}

Install-Lobster
