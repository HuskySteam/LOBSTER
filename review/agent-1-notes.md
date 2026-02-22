# Notes
- Hotspots checked: `session/processor.ts`, `session/message-v2.ts`, `session/index.ts`, `session/compaction.ts`, `team/manager.ts`, `tool/task.ts`.
- Assumptions: long-running sessions and larger team graphs are common enough for O(n) history scans to matter.
- Possible false positives: some costs are bounded in small repos/sessions, but scale risk remains clear.
