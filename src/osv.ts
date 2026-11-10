import { errorMessage } from "./guards";

const OSV_BASE_URL = "https://api.osv.dev/v1";
const REQUEST_TIMEOUT_MS = 30_000;

export interface OsvPackage {
  name?: string;
  ecosystem?: string;
  purl?: string;
}

export interface OsvQuery {
  commit?: string;
  version?: string;
  package?: OsvPackage;
}

export class OsvError extends Error {}

export async function queryVulnerabilities(query: OsvQuery): Promise<unknown> {
  return requestJson(`${OSV_BASE_URL}/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
}

export async function queryVulnerabilitiesBatch(
  queries: OsvQuery[],
): Promise<unknown> {
  return requestJson(`${OSV_BASE_URL}/querybatch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queries }),
  });
}

export async function getVulnerability(id: string): Promise<unknown> {
  return requestJson(`${OSV_BASE_URL}/vulns/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OsvError(`failed to send request: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    throw new OsvError(`unexpected status code: ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new OsvError("failed to decode response");
  }
}
