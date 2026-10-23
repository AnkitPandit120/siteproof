export type RequiredTag = "title" | "description" | "canonical" | "ogImage";

export interface RouteRule {
  match: string;
  indexable?: boolean;
  required?: RequiredTag[];
}

export interface Fact {
  value: string | number | boolean;
  currency?: string;
  billingPeriod?: "month" | "year";
  unit?: string;
}

export interface FactBinding {
  route: string;
  selector: string;
  fact: string;
}

export interface SiteproofConfig {
  siteUrl: string;
  environment?: "production" | "preview";
  routes?: RouteRule[];
  facts?: Record<string, Fact>;
  bindings?: FactBinding[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; config: SiteproofConfig }
  | { ok: false; issues: ValidationIssue[] };

type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function routePath(value: unknown, wildcard = false): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.includes("//") &&
    !/[?#\s\\]/.test(value) && (!value.includes("*") ||
      (wildcard && value.endsWith("/**") && value.indexOf("*") === value.length - 2));
}

function unknownKeys(value: RecordValue, allowed: string[], path: string, issues: ValidationIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push({ path: `${path}.${key}`, message: "Unknown setting" });
  }
}

export function validateConfig(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!record(input)) return { ok: false, issues: [{ path: "$", message: "Configuration must be an object" }] };
  unknownKeys(input, ["siteUrl", "environment", "routes", "facts", "bindings"], "$", issues);

  if (typeof input.siteUrl !== "string") {
    issues.push({ path: "$.siteUrl", message: "Must be an HTTP or HTTPS site origin" });
  } else {
    try {
      const url = new URL(input.siteUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
          url.pathname !== "/" || url.search || url.hash) {
        issues.push({ path: "$.siteUrl", message: "Must be an HTTP or HTTPS origin without a path, query, fragment, or credentials" });
      }
    } catch {
      issues.push({ path: "$.siteUrl", message: "Must be a valid HTTP or HTTPS URL" });
    }
  }
  if (input.environment !== undefined && !["production", "preview"].includes(String(input.environment))) {
    issues.push({ path: "$.environment", message: "Must be production or preview" });
  }

  if (input.routes !== undefined) {
    if (!Array.isArray(input.routes)) {
      issues.push({ path: "$.routes", message: "Must be an array" });
    } else {
      const matches = new Set<string>();
      input.routes.forEach((route: unknown, index: number) => {
        const path = `$.routes[${index}]`;
        if (!record(route)) {
          issues.push({ path, message: "Must be an object" });
          return;
        }
        unknownKeys(route, ["match", "indexable", "required"], path, issues);
        if (!routePath(route.match, true)) {
          issues.push({ path: `${path}.match`, message: "Must be a path such as /pricing or /blog/**" });
        } else if (matches.has(route.match)) {
          issues.push({ path: `${path}.match`, message: "Duplicate route rule" });
        } else matches.add(route.match);
        if (route.indexable !== undefined && typeof route.indexable !== "boolean")
          issues.push({ path: `${path}.indexable`, message: "Must be true or false" });
        if (input.environment === "preview" && route.indexable === true)
          issues.push({ path: `${path}.indexable`, message: "Preview routes cannot be indexable" });
        if (route.required !== undefined) {
          if (!Array.isArray(route.required) || route.required.some((tag: unknown) =>
            !["title", "description", "canonical", "ogImage"].includes(String(tag)))) {
            issues.push({ path: `${path}.required`, message: "Must list supported metadata fields" });
          } else if (new Set(route.required).size !== route.required.length) {
            issues.push({ path: `${path}.required`, message: "Must not repeat metadata fields" });
          }
        }
      });
    }
  }

  if (input.facts !== undefined) {
    if (!record(input.facts)) {
      issues.push({ path: "$.facts", message: "Must be an object keyed by fact name" });
    } else {
      for (const [name, fact] of Object.entries(input.facts)) {
        const path = `$.facts.${name}`;
        if (!name.trim()) issues.push({ path, message: "Fact name cannot be empty" });
        if (!record(fact)) {
          issues.push({ path, message: "Must be an object with a value" });
          continue;
        }
        unknownKeys(fact, ["value", "currency", "billingPeriod", "unit"], path, issues);
        if (!["string", "number", "boolean"].includes(typeof fact.value) ||
            (typeof fact.value === "number" && !Number.isFinite(fact.value)))
          issues.push({ path: `${path}.value`, message: "Must be a string, finite number, or boolean" });
        if (fact.currency !== undefined &&
            (typeof fact.currency !== "string" || !/^[A-Z]{3}$/.test(fact.currency) || typeof fact.value !== "number"))
          issues.push({ path: `${path}.currency`, message: "Must be a three-letter currency code on a numeric fact" });
        if (fact.billingPeriod !== undefined && !["month", "year"].includes(String(fact.billingPeriod)))
          issues.push({ path: `${path}.billingPeriod`, message: "Must be month or year" });
        if (fact.unit !== undefined &&
            (typeof fact.unit !== "string" || !/^[\p{L}][\p{L}\p{N} -]{0,49}$/u.test(fact.unit.trim()) ||
              typeof fact.value !== "number" || fact.currency !== undefined))
          issues.push({ path: `${path}.unit`, message: "Must be a short unit on a numeric non-currency fact" });
      }
    }
  }

  if (input.bindings !== undefined) {
    if (!Array.isArray(input.bindings)) {
      issues.push({ path: "$.bindings", message: "Must be an array" });
    } else {
      input.bindings.forEach((binding: unknown, index: number) => {
        const path = `$.bindings[${index}]`;
        if (!record(binding)) {
          issues.push({ path, message: "Must be an object" });
          return;
        }
        unknownKeys(binding, ["route", "selector", "fact"], path, issues);
        if (!routePath(binding.route)) issues.push({ path: `${path}.route`, message: "Must be a single page path" });
        if (typeof binding.selector !== "string" || !binding.selector.trim())
          issues.push({ path: `${path}.selector`, message: "Must be a nonempty CSS selector" });
        if (typeof binding.fact !== "string" || !binding.fact.trim() ||
            !record(input.facts) || !(binding.fact in input.facts))
          issues.push({ path: `${path}.fact`, message: "Must name a configured fact" });
      });
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, config: input as unknown as SiteproofConfig };
}
