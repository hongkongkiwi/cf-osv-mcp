import { isRecord } from "./guards";
import { TOOL_DEFINITIONS, runTool } from "./tools";

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

const SUPPORTED_PROTOCOL_VERSIONS = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
];
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

export function parseJsonRpcRequest(
  value: unknown,
): JsonRpcRequest | undefined {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    return undefined;
  }
  if (typeof value.method !== "string") {
    return undefined;
  }

  const id = value.id;
  if (
    id !== undefined &&
    id !== null &&
    typeof id !== "string" &&
    typeof id !== "number"
  ) {
    return undefined;
  }

  const request: JsonRpcRequest = { jsonrpc: "2.0", method: value.method };
  if (id !== undefined) {
    request.id = id;
  }
  if ("params" in value) {
    request.params = value.params;
  }
  return request;
}

export async function handleRequest(
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  switch (request.method) {
    case "initialize":
      return { jsonrpc: "2.0", id, result: initializeResult(request.params) };
    case "notifications/initialized":
      return null;
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOL_DEFINITIONS } };
    case "tools/call":
      return callTool(id, request.params);
    default:
      return errorResponse(id, -32601, `Method not found: ${request.method}`);
  }
}

export function errorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function callTool(
  id: JsonRpcId,
  params: unknown,
): Promise<JsonRpcResponse> {
  if (!isRecord(params) || typeof params.name !== "string") {
    return errorResponse(id, -32602, "Invalid params: tool name is required");
  }

  const args = isRecord(params.arguments) ? params.arguments : {};
  const result = await runTool(params.name, args);
  if (!result) {
    return errorResponse(id, -32602, `Unknown tool: ${params.name}`);
  }

  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: result.text }],
      ...(result.isError ? { isError: true } : {}),
    },
  };
}

function initializeResult(params: unknown): Record<string, unknown> {
  const requested =
    isRecord(params) && typeof params.protocolVersion === "string"
      ? params.protocolVersion
      : "";
  const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : DEFAULT_PROTOCOL_VERSION;

  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "osv-mcp", version: "1.0.0" },
  };
}
