# cf-osv-mcp

Small single-package Worker repo. Keep it that way.

- Run `pnpm run check` before pushing (Biome, `tsc --noEmit`, Vitest). CI runs
  the same checks plus `wrangler deploy --dry-run`.
- Commit signing is preferred; keep commits scoped to one change.
- Never commit secrets or account ids. Auth is the `MCP_AUTH_TOKEN` Worker
  secret; deploy credentials come from the environment or repository secrets.
- `upstream/` is the unmodified Go reference implementation. Do not edit it;
  port behaviour into `src/` instead.
- Tests mock `fetch`; no network access is required.
