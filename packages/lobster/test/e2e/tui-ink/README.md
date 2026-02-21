# TUI Ink E2E Harness

This harness runs interactive Ink TUI scenarios in `tmux` and validates:

- command/hotkey flows (`critical` mode)
- full dialog matrix open/close behavior for slash commands
- hotkey-driven dialog open/close behavior with prompt leak checks
- empty-state keybind behavior (for example session-list `Ctrl+D` / `Ctrl+R`) does not leak into dialog inputs
- responsive behavior across widths `80, 100, 120` (`responsive` mode)
- snapshot drift and visual-regression text diffs

## Commands

From repo root:

```bash
bun run --cwd packages/lobster test:e2e:tui-ink
bun run --cwd packages/lobster test:e2e:tui-ink:critical
bun run --cwd packages/lobster test:e2e:tui-ink:responsive
bun run --cwd packages/lobster test:e2e:tui-ink:update-snapshots
```

To inspect available scenario IDs:

```bash
bun run --cwd packages/lobster ./test/e2e/tui-ink/runner.ts --mode=all --list
```

## Notes

- On Windows, the harness runs commands in WSL and requires `tmux` + `bun` inside WSL.
- Artifacts are written to `packages/lobster/test/e2e/tui-ink/artifacts/<timestamp>/`.
- Snapshot baselines are read from `packages/lobster/test/e2e/tui-ink/snapshots/`.
- If baseline files are missing, run `test:e2e:tui-ink:update-snapshots` once to initialize.
