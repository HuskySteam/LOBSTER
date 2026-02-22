# Notes
- Threat model assumption: server may run without strong password/auth in local/shared environments.
- False-positive caveat: risk severity drops if deployment guarantees strict auth/network isolation.
- Focused surfaces: server mutation endpoints, plugin install path, MCP URL intake, worktree destructive operations.
