import { isRecord, readString } from "./guards";
import {
  getVulnerability,
  queryVulnerabilities,
  queryVulnerabilitiesBatch,
} from "./osv";
import type { OsvQuery } from "./osv";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

export interface ToolResult {
  text: string;
  isError?: boolean;
}

type Args = Record<string, unknown>;

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const QUERY_PROPERTIES = {
  commit: {
    type: "string",
    description:
      "The commit hash to query for. If specified, version should not be set.",
  },
  version: {
    type: "string",
    description:
      "The version string to query for. If specified, commit should not be set.",
  },
  package_name: {
    type: "string",
    description: "The name of the package.",
  },
  ecosystem: {
    type: "string",
    description: "The ecosystem for this package (e.g., PyPI, npm, Go).",
  },
  purl: {
    type: "string",
    description:
      "The package URL for this package. If purl is used, package_name and ecosystem should not be set.",
  },
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "query_vulnerability",
    description:
      "Query for vulnerabilities affecting a specific package version or commit",
    inputSchema: { type: "object", properties: QUERY_PROPERTIES, required: [] },
    annotations: ANNOTATIONS,
  },
  {
    name: "query_vulnerabilities_batch",
    description:
      "Query for vulnerabilities affecting multiple packages or commits at once",
    inputSchema: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          description: "Array of query objects",
          items: { type: "object", properties: QUERY_PROPERTIES },
        },
      },
      required: ["queries"],
    },
    annotations: ANNOTATIONS,
  },
  {
    name: "get_vulnerability",
    description: "Get details for a specific vulnerability by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The OSV vulnerability ID" },
      },
      required: ["id"],
    },
    annotations: ANNOTATIONS,
  },
];

export async function runTool(
  name: string,
  args: Args,
): Promise<ToolResult | undefined> {
  switch (name) {
    case "query_vulnerability":
      return runQueryVulnerability(args);
    case "query_vulnerabilities_batch":
      return runQueryVulnerabilitiesBatch(args);
    case "get_vulnerability":
      return runGetVulnerability(args);
    default:
      return undefined;
  }
}

async function runQueryVulnerability(args: Args): Promise<ToolResult> {
  const { query, error } = buildQuery(args);
  if (error) {
    return { text: error, isError: true };
  }
  if (!query) {
    return { text: "Invalid query", isError: true };
  }
  try {
    return { text: format(await queryVulnerabilities(query)) };
  } catch (error) {
    return {
      text: `Failed to query OSV API: ${messageOf(error)}`,
      isError: true,
    };
  }
}

async function runQueryVulnerabilitiesBatch(args: Args): Promise<ToolResult> {
  const raw = args.queries;
  if (!Array.isArray(raw)) {
    return {
      text: "Invalid 'queries' parameter: must be array",
      isError: true,
    };
  }

  const queries: OsvQuery[] = [];
  for (const [index, item] of raw.entries()) {
    if (!isRecord(item)) {
      return { text: `Invalid query at index ${index}`, isError: true };
    }
    const { query, error } = buildQuery(item, index);
    if (error) {
      return { text: error, isError: true };
    }
    if (query) {
      queries.push(query);
    }
  }

  try {
    return { text: format(await queryVulnerabilitiesBatch(queries)) };
  } catch (error) {
    return {
      text: `Failed to query OSV API: ${messageOf(error)}`,
      isError: true,
    };
  }
}

async function runGetVulnerability(args: Args): Promise<ToolResult> {
  const id = readString(args, "id");
  if (!id) {
    return { text: "Vulnerability ID is required", isError: true };
  }
  try {
    return { text: format(await getVulnerability(id)) };
  } catch (error) {
    return {
      text: `Failed to get vulnerability: ${messageOf(error)}`,
      isError: true,
    };
  }
}

// Mirrors the upstream Go validation. Batch queries skip the final
// "one of purl, package+ecosystem, or commit" requirement.
function buildQuery(
  args: Args,
  index?: number,
): { query?: OsvQuery; error?: string } {
  const commit = readString(args, "commit");
  const version = readString(args, "version");
  const packageName = readString(args, "package_name");
  const ecosystem = readString(args, "ecosystem");
  const purl = readString(args, "purl");
  const suffix = index === undefined ? "" : ` in query ${index}`;

  if (commit && version) {
    return { error: `Both commit and version cannot be specified${suffix}` };
  }
  if (purl && (packageName || ecosystem)) {
    return {
      error: `If purl is specified, package_name and ecosystem should not be specified${suffix}`,
    };
  }
  if (index === undefined && !purl && (!packageName || !ecosystem) && !commit) {
    return {
      error:
        "Either purl, or both package_name and ecosystem, or commit must be specified",
    };
  }

  const query: OsvQuery = {};
  if (commit) {
    query.commit = commit;
  }
  if (version) {
    query.version = version;
  }
  if (purl) {
    query.package = { purl };
  } else if (packageName && ecosystem) {
    query.package = { name: packageName, ecosystem };
  }
  return { query };
}

function format(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
