import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest, parseJsonRpcRequest } from "../src/mcp";

interface ToolPayload {
  content: { type: string; text: string }[];
  isError?: boolean;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseJsonRpcRequest", () => {
  it("accepts a valid request", () => {
    expect(
      parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "ping" }),
    ).toBeDefined();
  });

  it("rejects a wrong version", () => {
    expect(
      parseJsonRpcRequest({ jsonrpc: "1.0", id: 1, method: "ping" }),
    ).toBeUndefined();
  });

  it("rejects a missing method", () => {
    expect(parseJsonRpcRequest({ jsonrpc: "2.0", id: 1 })).toBeUndefined();
  });
});

describe("initialize", () => {
  it("echoes a supported protocol version", async () => {
    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    expect(response?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "osv-mcp" },
    });
  });

  it("falls back on an unsupported protocol version", async () => {
    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    expect(response?.result).toMatchObject({ protocolVersion: "2025-06-18" });
  });
});

describe("dispatch", () => {
  it("lists the three tools", async () => {
    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    const result = response?.result as { tools: { name: string }[] };
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "query_vulnerability",
      "query_vulnerabilities_batch",
      "get_vulnerability",
    ]);
  });

  it("acknowledges notifications", async () => {
    expect(
      await handleRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).toBeNull();
  });

  it("rejects unknown methods", async () => {
    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/list",
    });
    expect(response?.error?.code).toBe(-32601);
  });

  it("rejects an unknown tool", async () => {
    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "drop_tables", arguments: {} },
    });
    expect(response?.error?.code).toBe(-32602);
  });
});

describe("tools", () => {
  it("returns validation failures as tool errors", async () => {
    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "query_vulnerability", arguments: { version: "1.0.0" } },
    });
    const result = response?.result as ToolPayload;
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("must be specified");
  });

  it("rejects commit and version together", async () => {
    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "query_vulnerability",
        arguments: { commit: "abc", version: "1.0.0" },
      },
    });
    const result = response?.result as ToolPayload;
    expect(result.content[0]?.text).toContain("Both commit and version");
  });

  it("queries OSV and returns formatted JSON", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ vulns: [{ id: "GHSA-test" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "query_vulnerability",
        arguments: {
          package_name: "lodash",
          ecosystem: "npm",
          version: "4.17.15",
        },
      },
    });

    const result = response?.result as ToolPayload;
    expect(result.content[0]?.text).toContain("GHSA-test");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.osv.dev/v1/query",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends batch queries to the batch endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "query_vulnerabilities_batch",
        arguments: {
          queries: [{ package_name: "lodash", ecosystem: "npm" }],
        },
      },
    });

    const result = response?.result as ToolPayload;
    expect(result.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.osv.dev/v1/querybatch",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("maps OSV HTTP failures to tool errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    const response = await handleRequest({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "get_vulnerability", arguments: { id: "GHSA-x" } },
    });

    const result = response?.result as ToolPayload;
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("500");
  });

  it("encodes vulnerability ids in the URL", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await handleRequest({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "get_vulnerability", arguments: { id: "GHSA/../x" } },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.osv.dev/v1/vulns/GHSA%2F..%2Fx",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
