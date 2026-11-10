import { describe, expect, it } from "vitest";
import { handleFetch } from "../src/index";

const ENV = { MCP_AUTH_TOKEN: "secret-token" };

function post(body: unknown, token?: string): Request {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  });
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return new Request("https://osv-mcp.example/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("handleFetch", () => {
  it("serves an unauthenticated health check", async () => {
    const response = await handleFetch(
      new Request("https://osv-mcp.example/health"),
      ENV,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("returns 404 for unknown paths", async () => {
    const response = await handleFetch(
      new Request("https://osv-mcp.example/nope"),
      ENV,
    );
    expect(response.status).toBe(404);
  });

  it("rejects GET on /mcp", async () => {
    const response = await handleFetch(
      new Request("https://osv-mcp.example/mcp"),
      ENV,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("rejects missing credentials", async () => {
    const response = await handleFetch(
      post({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      ENV,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rejects wrong credentials", async () => {
    const response = await handleFetch(
      post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "wrong"),
      ENV,
    );
    expect(response.status).toBe(401);
  });

  it("rejects a non-JSON content type", async () => {
    const request = new Request("https://osv-mcp.example/mcp", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        authorization: `Bearer ${ENV.MCP_AUTH_TOKEN}`,
      },
      body: "{}",
    });
    const response = await handleFetch(request, ENV);
    expect(response.status).toBe(415);
  });

  it("returns tools for an authenticated client", async () => {
    const response = await handleFetch(
      post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ENV.MCP_AUTH_TOKEN),
      ENV,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: { tools: { name: string }[] };
    };
    expect(body.result.tools).toHaveLength(3);
  });

  it("acknowledges notifications with 202", async () => {
    const response = await handleFetch(
      post(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        ENV.MCP_AUTH_TOKEN,
      ),
      ENV,
    );
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://osv-mcp.example/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.MCP_AUTH_TOKEN}`,
      },
      body: "{",
    });
    const response = await handleFetch(request, ENV);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("rejects batch payloads", async () => {
    const response = await handleFetch(
      post([{ jsonrpc: "2.0", id: 1, method: "ping" }], ENV.MCP_AUTH_TOKEN),
      ENV,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32600);
  });
});
