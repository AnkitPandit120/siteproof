export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
  line: number;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface RobotsDecision {
  allowed: boolean;
  rule?: RobotsRule;
}

export interface RobotsReadOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface RobotsResult {
  url: string;
  status: number;
  groups: RobotsGroup[];
  error?: string;
}

export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let hasRules = false;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.split("#", 1)[0].trim();
    const separator = line.indexOf(":");
    if (separator < 0) return;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === "user-agent") {
      if (!value) return;
      if (!current || hasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((name === "allow" || name === "disallow") && current) {
      hasRules = true;
      if (value) current.rules.push({ type: name, path: value, line: index + 1 });
    }
  });
  return groups;
}

function matchingLength(pattern: string, path: string): number {
  const anchored = pattern.endsWith("$");
  const plain = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = plain.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  const regex = new RegExp(`^${escaped}${anchored ? "$" : ""}`);
  return regex.test(path) ? plain.replaceAll("*", "").length : -1;
}

export function checkRobots(groups: RobotsGroup[], userAgent: string, pageUrl: string): RobotsDecision {
  const agent = userAgent.toLowerCase();
  const matches = groups.map((group) => ({
    group,
    specificity: Math.max(...group.agents.map((name) => name === "*" ? 0 : agent.includes(name) ? name.length : -1)),
  })).filter((entry) => entry.specificity >= 0);
  const specificity = Math.max(-1, ...matches.map((entry) => entry.specificity));
  const path = new URL(pageUrl).pathname + new URL(pageUrl).search;
  let winner: RobotsRule | undefined;
  let length = -1;
  for (const { group, specificity: groupSpecificity } of matches) {
    if (groupSpecificity !== specificity) continue;
    for (const rule of group.rules) {
      const score = matchingLength(rule.path, path);
      if (score > length || (score === length && score >= 0 && rule.type === "allow" && winner?.type === "disallow")) {
        winner = rule;
        length = score;
      }
    }
  }
  return { allowed: winner?.type !== "disallow", ...(winner ? { rule: winner } : {}) };
}

export async function readRobots(siteUrl: string, options: RobotsReadOptions = {}): Promise<RobotsResult> {
  const url = new URL("/robots.txt", siteUrl).href;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxBytes = options.maxBytes ?? 500_000;
  if (![timeoutMs, maxBytes].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError("Robots limits must be positive integers");
  }
  try {
    const response = await (options.fetcher ?? fetch)(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 404 || response.status === 410) return { url, status: response.status, groups: [] };
    if (!response.ok) return { url, status: response.status, groups: [], error: `Robots file returned HTTP ${response.status}` };
    const reader = response.body?.getReader();
    if (!reader) return { url, status: response.status, groups: [] };
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) return { url, status: response.status, groups: [], error: `Robots file exceeds ${maxBytes} bytes` };
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { url, status: response.status, groups: parseRobots(new TextDecoder().decode(bytes)) };
  } catch (error) {
    return { url, status: 0, groups: [], error: (error as Error).message };
  }
}
