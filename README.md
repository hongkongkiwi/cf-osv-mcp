# cf-osv-mcp

Authenticated MCP server for [OSV](https://osv.dev/) vulnerability lookups, running
on Cloudflare Workers. It is a TypeScript port of
[StacklokLabs/osv-mcp](https://github.com/StacklokLabs/osv-mcp), which only ships a
Go SSE/streamable-HTTP server.

The Worker is stateless: every tool call is a read-only request to `api.osv.dev`.
There is no database, no Durable Object, and no session store.

## Endpoint

After deploying, the Worker is reachable at your `workers.dev` subdomain:

```
https://<worker-name>.<your-subdomain>.workers.dev/mcp
```

- `POST /mcp` streamable HTTP, one JSON-RPC message per request, JSON responses.
- `GET /health` unauthenticated liveness probe.
- Auth is a bearer token (`MCP_AUTH_TOKEN`, Worker secret). Missing or wrong
  credentials return `401` with a `WWW-Authenticate: Bearer` header. Set the
  secret to any high-entropy string; the server fails closed when it is unset.

## Tools

| Tool | Purpose |
| --- | --- |
| `query_vulnerability` | Vulnerabilities for one package version, purl, or commit |
| `query_vulnerabilities_batch` | The same for several packages or commits in one call |
| `get_vulnerability` | Full record for one OSV or GHSA id |

Input handling and validation mirror the upstream Go implementation.

## Client configuration

```json
{
  "mcpServers": {
    "osv": {
      "type": "http",
      "url": "https://<worker-name>.<your-subdomain>.workers.dev/mcp",
      "headers": { "Authorization": "Bearer <token>" },
      "timeoutMs": 30000
    }
  }
}
```

## Local development

```bash
pnpm install
echo 'MCP_AUTH_TOKEN=local-dev-token' > .dev.vars
pnpm dev
pnpm run check
```

## Deploy

`wrangler.toml` deliberately has no account id and no secrets. Provide both from
the environment:

```bash
export CLOUDFLARE_ACCOUNT_ID=<your-account-id>
export CLOUDFLARE_API_TOKEN=<scoped-token>
pnpm deploy
pnpm exec wrangler secret put MCP_AUTH_TOKEN
```

The `Deploy` workflow is manual by default and only runs from `main`. To deploy
automatically on every push to `main`, set the repository variable
`AUTO_DEPLOY` to `true` and add the repository secrets `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID`. Set `WORKER_URL` (for example
`https://osv-mcp.example.workers.dev`) to enable the anonymous-request smoke
test. The job skips cleanly while `AUTO_DEPLOY` is unset, so the public template
never deploys itself.

As an alternative to GitHub Actions minutes, Cloudflare Workers Builds can build
and deploy on push from Cloudflare's own infrastructure (6,000 build minutes per
month on Workers Paid, 3,000 on Free, then $0.005 per minute). Connect the
Worker to the repository under **Settings** > **Builds** in the Cloudflare
dashboard, set the build command to `pnpm install --frozen-lockfile && pnpm run
check` and the deploy command to `pnpm exec wrangler deploy`. Workers Builds
authenticates with its own build token, so no `CLOUDFLARE_API_TOKEN` secret is
needed there.


## Provenance

`upstream/` keeps the reference Go implementation unmodified (Apache-2.0) at the
commit recorded in `upstream/COMMIT`. See `NOTICE`. This project is not
affiliated with StacklokLabs or Google.
