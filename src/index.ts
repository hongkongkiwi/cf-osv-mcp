import { isAuthorized } from "./auth";
import type { Env } from "./env";
import { errorResponse, handleRequest, parseJsonRpcRequest } from "./mcp";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export async function handleFetch(
  request: Request,
  env: Env,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === "/health" && request.method === "GET") {
    return json({ ok: true, service: "osv-mcp" });
  }

  if (pathname !== "/mcp") {
    return json({ error: "not_found" }, 404);
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "POST" },
    });
  }

  if (!isAuthorized(request, env.MCP_AUTH_TOKEN)) {
    return json({ error: "unauthorized" }, 401, {
      "www-authenticate": 'Bearer realm="osv-mcp"',
    });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "unsupported_media_type" }, 415);
  }

  const accept = request.headers.get("accept");
  if (
    accept &&
    !accept.includes("application/json") &&
    !accept.includes("text/event-stream") &&
    !accept.includes("*/*")
  ) {
    return json({ error: "not_acceptable" }, 406);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(errorResponse(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(payload)) {
    return json(
      errorResponse(null, -32600, "Batch requests are not supported"),
      400,
    );
  }

  const message = parseJsonRpcRequest(payload);
  if (!message) {
    return json(errorResponse(null, -32600, "Invalid Request"), 400);
  }

  if (!("id" in message)) {
    await handleRequest(message);
    return new Response(null, { status: 202 });
  }

  return json(await handleRequest(message));
}

const worker: ExportedHandler<Env> = { fetch: handleFetch };

export default worker;
