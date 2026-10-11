import type { PageMetadata } from "./page.js";

export interface StructuredDataFinding {
  code: "json_ld_empty" | "json_ld_invalid_json" | "json_ld_invalid_root" | "json_ld_invalid_graph" | "json_ld_missing_type" | "json_ld_missing_context";
  severity: "error" | "warning";
  block: number;
  path: string;
  message: string;
}

export interface StructuredDataNode {
  block: number;
  path: string;
  types: string[];
  id?: string;
}

export interface StructuredDataResult {
  blocks: number;
  nodes: StructuredDataNode[];
  findings: StructuredDataFinding[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function schemaContext(value: unknown): boolean {
  if (typeof value === "string") return /^https?:\/\/schema\.org\/?$/i.test(value);
  if (Array.isArray(value)) return value.some(schemaContext);
  if (record(value)) return schemaContext(value["@vocab"]);
  return false;
}

export function checkStructuredData(page: PageMetadata): StructuredDataResult {
  const nodes: StructuredDataNode[] = [];
  const findings: StructuredDataFinding[] = [];
  const add = (code: StructuredDataFinding["code"], severity: StructuredDataFinding["severity"], block: number, path: string, message: string): void => {
    findings.push({ code, severity, block, path, message });
  };

  function visit(value: unknown, block: number, path: string, inheritedContext: boolean, depth: number): void {
    if (depth > 32) {
      add("json_ld_invalid_graph", "error", block, path, "JSON-LD graph is too deeply nested");
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, block, `${path}[${index}]`, inheritedContext, depth + 1));
      return;
    }
    if (!record(value)) {
      add("json_ld_invalid_root", "error", block, path, "JSON-LD entries must be objects");
      return;
    }

    const context = inheritedContext || schemaContext(value["@context"]);
    const rawTypes = value["@type"];
    const types = typeof rawTypes === "string" ? [rawTypes] :
      Array.isArray(rawTypes) && rawTypes.every((type) => typeof type === "string") ? rawTypes : [];
    if (rawTypes !== undefined && types.length === 0) {
      add("json_ld_missing_type", "error", block, path, "Use a nonempty @type string or list of strings");
    } else if (types.length) {
      nodes.push({ block, path, types, ...(typeof value["@id"] === "string" ? { id: value["@id"] } : {}) });
      if (!context) add("json_ld_missing_context", "warning", block, path, "Declare a schema.org @context for this node");
    }

    const graph = value["@graph"];
    if (graph !== undefined) {
      if (!Array.isArray(graph)) add("json_ld_invalid_graph", "error", block, `${path}.@graph`, "@graph must be an array");
      else graph.forEach((item, index) => visit(item, block, `${path}.@graph[${index}]`, context, depth + 1));
    } else if (rawTypes === undefined) {
      add("json_ld_missing_type", "error", block, path, "Add @type or a typed @graph node");
    }
  }

  page.jsonLd.forEach((source, index) => {
    const block = index + 1;
    if (!source.trim()) {
      add("json_ld_empty", "error", block, "$", "JSON-LD script is empty");
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(source);
    } catch (error) {
      add("json_ld_invalid_json", "error", block, "$", `JSON-LD is not valid JSON: ${(error as Error).message}`);
      return;
    }
    visit(data, block, "$", false, 0);
  });

  return { blocks: page.jsonLd.length, nodes, findings };
}
