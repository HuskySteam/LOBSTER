# Finding Tracker

Date: 2026-02-22

## Summary
- Total findings: 49
- Fixed: 49
- Rejected: 0
- Deferred: 0

## Status by Finding
| ID | Status | Category | Severity | Owner | Location |
|---|---|---|---|---|---|
| A1-001 | fixed | performance | high | session | `packages/lobster/src/session/processor.ts:228` |
| A1-002 | fixed | performance | high | session | `packages/lobster/src/session/message-v2.ts:670` |
| A1-003 | fixed | performance | high | session | `packages/lobster/src/session/index.ts:353` |
| A1-004 | fixed | performance | medium | session | `packages/lobster/src/session/compaction.ts:59` |
| A1-005 | fixed | performance | medium | tool | `packages/lobster/src/tool/task.ts:424` |
| A1-006 | fixed | performance | medium | team | `packages/lobster/src/team/manager.ts:176` |
| A1-007 | fixed | performance | medium | team | `packages/lobster/src/team/manager.ts:336` |
| A2-001 | fixed | performance | high | provider | `packages/lobster/src/provider/transform.ts:219` |
| A2-002 | fixed | performance | medium | provider | `packages/lobster/src/provider/transform.ts:215` |
| A2-003 | fixed | performance | high | provider | `packages/lobster/src/provider/provider.ts:966` |
| A2-004 | fixed | performance | medium | mcp | `packages/lobster/src/mcp/auth.ts:60` |
| A2-005 | fixed | performance | medium | mcp | `packages/lobster/src/mcp/index.ts:574` |
| A2-006 | fixed | quality | high | mcp | `packages/lobster/src/mcp/index.ts:329` |
| A2-007 | fixed | performance | medium | provider | `packages/lobster/src/provider/transform.ts:734` |
| A3-001 | fixed | performance | high | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/routes/session/index.tsx:120` |
| A3-002 | fixed | performance | high | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/routes/session/index.tsx:164` |
| A3-003 | fixed | performance | high | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/routes/session/sidebar.tsx:27` |
| A3-004 | fixed | performance | medium | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/store.ts:201` |
| A3-005 | fixed | performance | medium | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/store.ts:246` |
| A3-006 | fixed | quality | medium | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/sync.ts:132` |
| A4-001 | fixed | performance | high | server | `packages/lobster/src/server/routes/tui.ts:21` |
| A4-002 | fixed | quality | medium | server | `packages/lobster/src/server/routes/session.ts:741` |
| A4-003 | fixed | quality | medium | server | `packages/lobster/src/server/routes/session.ts:772` |
| A4-004 | fixed | quality | medium | acp | `packages/lobster/src/acp/session.ts:8` |
| A4-005 | fixed | performance | medium | acp | `packages/lobster/src/acp/agent.ts:72` |
| A4-006 | fixed | quality | high | lsp | `packages/lobster/src/lsp/index.ts:79` |
| A5-001 | fixed | performance | medium | util | `packages/lobster/src/util/queue.ts:33` |
| A5-002 | fixed | performance | medium | memory | `packages/lobster/src/memory/manager.ts:212` |
| A5-003 | fixed | performance | medium | memory | `packages/lobster/src/memory/manager.ts:133` |
| A5-004 | fixed | performance | medium | storage | `packages/lobster/src/storage/storage.ts:223` |
| A5-005 | fixed | performance | medium | config | `packages/lobster/src/config/config.ts:80` |
| A5-006 | fixed | performance | medium | config | `packages/lobster/src/config/config.ts:187` |
| A6-001 | fixed | performance | high | slack | `packages/slack/src/index.ts:28` |
| A6-002 | fixed | quality | high | slack | `packages/slack/src/index.ts:46` |
| A6-003 | fixed | quality | medium | slack | `packages/slack/src/index.ts:46` |
| A6-004 | fixed | quality | high | sdk | `packages/sdk/js/src/server.ts:42` |
| A6-005 | fixed | quality | medium | sdk | `packages/sdk/js/src/client.ts:8` |
| A6-006 | fixed | performance | medium | sdk | `packages/sdk/js/src/server.ts:42` |
| A7-001 | fixed | security | critical | server | `packages/lobster/src/server/routes/config.ts:36` |
| A7-002 | fixed | security | critical | worktree | `packages/lobster/src/server/routes/experimental.ts:90` |
| A7-003 | fixed | security | high | mcp | `packages/lobster/src/server/routes/mcp.ts:24` |
| A7-004 | fixed | security | high | worktree | `packages/lobster/src/server/routes/experimental.ts:137` |
| A7-005 | fixed | security | high | worktree | `packages/lobster/src/server/routes/experimental.ts:163` |
| A8-001 | fixed | performance | medium | benchmark | `packages/lobster/src/benchmark/benchmark.ts:9` |
| A8-002 | fixed | performance | medium | benchmark | `packages/lobster/src/benchmark/runner.ts:18` |
| A8-003 | fixed | performance | medium | benchmark | `packages/lobster/src/benchmark/runner.ts:111` |
| A8-004 | fixed | quality | medium | test.mcp | `packages/lobster/test/mcp/oauth-browser.test.ts:136` |
| A8-005 | fixed | quality | medium | test.memory | `packages/lobster/test/memory/abort-leak.test.ts:34` |
| A8-006 | fixed | security | high | benchmark | `packages/lobster/src/benchmark/runner.ts:44` |

## Verification Evidence
- `bun run typecheck` (root): pass
- `bun test` targeted lobster suites: pass (243 pass, 0 fail)
- `bun test test/memory/manager.test.ts`: pass
- `bun test test/storage/storage.test.ts`: pass
- `bun test test/team/manager.test.ts`: pass
- `bun test` in `packages/sdk/js`: pass (7 pass, 0 fail)
- `bun run typecheck` in `packages/sdk/js`: pass
- `bun run typecheck` in `packages/slack`: pass
- `bun test` full in `packages/lobster`: pass (1017 pass, 1 skip, 0 fail)
