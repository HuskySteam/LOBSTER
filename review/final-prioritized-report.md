# Full-Codebase Parallel Review - Final Prioritized Report

Date: 2026-02-21

## Summary
- Review executed with 8 scoped agents across all planned domains.
- Total findings: **49**.
- Priority emphasis applied: **performance > quality > security**.
- Security handled as targeted high-risk surface review.

## Remediation Status (2026-02-22)
- Fixed: **49 / 49**
- Rejected: **0**
- Deferred: **0**
- Per-finding closure details: `review/finding-closure.json`
- Human-readable tracker: `review/finding-tracker.md`

## Coverage
- agent-1: 7 findings
- agent-2: 7 findings
- agent-3: 6 findings
- agent-4: 6 findings
- agent-5: 6 findings
- agent-6: 6 findings
- agent-7: 5 findings
- agent-8: 6 findings

## Validation
- All `agent-*-findings.json` files parse as JSON arrays.
- All findings conform to required enums for `category`, `severity`, `confidence`, and `effort`.
- Verification run (2026-02-22): `bun run typecheck` at repo root and full `bun test` in `packages/lobster` both pass.

## Distribution
### By category
- performance: 31
- quality: 12
- security: 6

### By severity
- critical: 2
- high: 18
- medium: 29

### By effort
- l: 4
- m: 36
- s: 9

## Scoring Model
- Severity points: `critical=100`, `high=80`, `medium=50`, `low=20`
- Confidence multiplier: `high=1.0`, `medium=0.8`, `low=0.6`
- Category weight: `performance=1.5`, `quality=1.35`, `security=1.15`
- Priority score: `severity_points * confidence_multiplier * category_weight`

## Top 20 Backlog
| Rank | Score | ID | Cat | Sev | Effort | Owner | Location |
|---:|---:|---|---|---|---|---|---|
| 1 | 120 | A2-001 | performance | high | m | provider | `packages/lobster/src/provider/transform.ts:219` |
| 2 | 120 | A6-001 | performance | high | s | slack | `packages/slack/src/index.ts:28` |
| 3 | 120 | A1-003 | performance | high | l | session | `packages/lobster/src/session/index.ts:353` |
| 4 | 120 | A1-001 | performance | high | m | session | `packages/lobster/src/session/processor.ts:228` |
| 5 | 120 | A1-002 | performance | high | m | session | `packages/lobster/src/session/message-v2.ts:670` |
| 6 | 115 | A7-001 | security | critical | s | server | `packages/lobster/src/server/routes/config.ts:36` |
| 7 | 115 | A7-002 | security | critical | m | worktree | `packages/lobster/src/server/routes/experimental.ts:90` |
| 8 | 108 | A6-002 | quality | high | s | slack | `packages/slack/src/index.ts:46` |
| 9 | 96 | A3-003 | performance | high | m | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/routes/session/sidebar.tsx:27` |
| 10 | 96 | A3-002 | performance | high | m | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/routes/session/index.tsx:164` |
| 11 | 96 | A4-001 | performance | high | m | server | `packages/lobster/src/server/routes/tui.ts:21` |
| 12 | 96 | A3-001 | performance | high | m | cli.tui-ink | `packages/lobster/src/cli/cmd/tui-ink/routes/session/index.tsx:120` |
| 13 | 96 | A2-003 | performance | high | m | provider | `packages/lobster/src/provider/provider.ts:966` |
| 14 | 92 | A7-003 | security | high | m | mcp | `packages/lobster/src/server/routes/mcp.ts:24` |
| 15 | 86.4 | A4-006 | quality | high | m | lsp | `packages/lobster/src/lsp/index.ts:79` |
| 16 | 86.4 | A6-004 | quality | high | s | sdk | `packages/sdk/js/src/server.ts:42` |
| 17 | 86.4 | A2-006 | quality | high | m | mcp | `packages/lobster/src/mcp/index.ts:329` |
| 18 | 75 | A5-004 | performance | medium | m | storage | `packages/lobster/src/storage/storage.ts:223` |
| 19 | 75 | A1-006 | performance | medium | l | team | `packages/lobster/src/team/manager.ts:176` |
| 20 | 75 | A1-007 | performance | medium | m | team | `packages/lobster/src/team/manager.ts:336` |

## Quick Wins (<= 1 day)
- **A6-001** (`packages/slack/src/index.ts`): Always run TTL-based sweep independent of size cap checks.
- **A7-001** (`packages/lobster/src/server/routes/config.ts`): Require privileged auth for config mutation and gate plugin installs to trusted sources.
- **A6-002** (`packages/slack/src/index.ts`): Wrap stream loop in try/catch and recover gracefully.
- **A6-004** (`packages/sdk/js/src/server.ts`): Kill child process on timeout/abort/error paths before reject.
- **A5-001** (`packages/lobster/src/util/queue.ts`): Use index/ring-buffer or pop-based strategy for O(1) dequeue.
- **A2-007** (`packages/lobster/src/provider/transform.ts`): Memoize sanitized schemas by provider/model/schema identity.
- **A4-003** (`packages/lobster/src/server/routes/session.ts`): Await or explicitly catch/log prompt execution failures.
- **A6-005** (`packages/sdk/js/src/client.ts`): Use configurable timeout defaults and preserve abort semantics.

## Medium Refactors (<= 1 sprint)
- **A2-001** (`packages/lobster/src/provider/transform.ts`): Use metadata/mediaType and cache MIME derivation once per part.
- **A1-002** (`packages/lobster/src/session/message-v2.ts`): Stream or paginate storage keys instead of buffering all IDs.
- **A1-001** (`packages/lobster/src/session/processor.ts`): Track a rolling in-memory window of recent tool parts during streaming.
- **A7-002** (`packages/lobster/src/server/routes/experimental.ts`): Treat endpoint as privileged and remove/sandbox arbitrary start command execution.
- **A4-001** (`packages/lobster/src/server/routes/tui.ts`): Add cancellation-aware queue waits that remove pending resolvers on timeout.
- **A3-003** (`packages/lobster/src/cli/cmd/tui-ink/routes/session/sidebar.tsx`): Maintain per-session aggregate counters and narrow selectors.
- **A3-002** (`packages/lobster/src/cli/cmd/tui-ink/routes/session/index.tsx`): Cache per-message line heights and update incrementally.
- **A3-001** (`packages/lobster/src/cli/cmd/tui-ink/routes/session/index.tsx`): Use session-scoped part selectors and memoized derivations.
- **A2-003** (`packages/lobster/src/provider/provider.ts`): Strip IDs earlier before serialization and send payload untouched.
- **A7-003** (`packages/lobster/src/server/routes/mcp.ts`): Require privileged auth and validate/allowlist MCP URLs.

## Strategic Investments (> 1 sprint)
- **A1-003** (`packages/lobster/src/session/index.ts`): Add lightweight indexing and bounded scan windows for search.
- **A1-006** (`packages/lobster/src/team/manager.ts`): Cache adjacency data and run cycle checks over in-memory graph state.
- **A1-004** (`packages/lobster/src/session/compaction.ts`): Maintain incremental candidate metadata for prune decisions.
- **A3-004** (`packages/lobster/src/cli/cmd/tui-ink/store.ts`): Adopt append/truncate buffers and avoid full-collection cloning.

## High-Priority Security Calls
- **A7-001**: Lock down config mutation path that can lead to plugin-driven code execution.
- **A7-002**: Remove or strictly gate worktree `startCommand` shell execution.
- **A7-003**: Protect and validate MCP URL registration path against SSRF.

## Notes on Deduplication
- Findings were merged by root cause where overlap was clear (repeated full-history scans, global part-map invalidation, unauthenticated mutation surfaces).
- Top backlog intentionally favors performance and quality per requested weighting.
