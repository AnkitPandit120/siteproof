export type RequiredTag = "title" | "description" | "canonical" | "ogImage";
export type SitemapSetting = "required" | "excluded" | "optional";

export interface RouteRule {
  match: string;
  indexable?: boolean;
  sitemap?: SitemapSetting;
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

export interface JsonLdTemplate {
  route: string;
  type: string;
  properties: Record<string, string>;
}

export interface RobotsConfigGroup {
  userAgents: string[];
  allow?: string[];
  disallow?: string[];
}

export interface SiteproofConfig {
  siteUrl: string;
  environment?: "production" | "preview";
  pages?: string[];
  sitemapUrl?: string;
  routes?: RouteRule[];
  facts?: Record<string, Fact>;
  bindings?: FactBinding[];
  jsonLdTemplates?: JsonLdTemplate[];
  robotsRules?: RobotsConfigGroup[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; config: SiteproofConfig }
  | { ok: false; issues: ValidationIssue[] };

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validRoute(value: unknown): value is string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.includes("//") &&
    !/[?#\s\\]/.test(value) &&
    (!value.includes("*") || (value.endsWith("/**") && value.indexOf("*") === value.length - 2));
}

function unknownKeys(
  object: RecordValue,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) issues.push({ path: `${path}.${key}`, message: "Unknown setting" });
  }
}

export function validateConfig(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: "$", message: "Configuration must be an object" }] };
  }

  unknownKeys(input, ["siteUrl", "environment", "pages", "sitemapUrl", "routes", "facts", "bindings", "robotsRules", "jsonLdTemplates"], "$", issues);

  if (input.environment !== undefined && input.environment !== "production" && input.environment !== "preview") {
    issues.push({ path: "$.environment", message: "Must be production or preview" });
  }

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

  if (input.pages !== undefined) {
    if (!Array.isArray(input.pages)) {
      issues.push({ path: "$.pages", message: "Must be an array of page paths" });
    } else {
      input.pages.forEach((page: unknown, index: number) => {
        if (!validRoute(page) || (typeof page === "string" && page.includes("*"))) {
          issues.push({ path: `$.pages[${index}]`, message: "Must be a single page path" });
        }
      });
      if (new Set(input.pages).size !== input.pages.length) {
        issues.push({ path: "$.pages", message: "Must not repeat page paths" });
      }
    }
  }

  if (input.sitemapUrl !== undefined &&
      (typeof input.sitemapUrl !== "string" || !validRoute(input.sitemapUrl) || input.sitemapUrl.includes("*"))) {
    issues.push({ path: "$.sitemapUrl", message: "Must be a single sitemap path" });
  }

  if (input.routes !== undefined) {
    if (!Array.isArray(input.routes)) {
      issues.push({ path: "$.routes", message: "Must be an array" });
    } else {
      const matches = new Set<string>();
      input.routes.forEach((route: unknown, index: number) => {
        const path = `$.routes[${index}]`;
        if (!isRecord(route)) {
          issues.push({ path, message: "Must be an object" });
          return;
        }
        unknownKeys(route, ["match", "indexable", "sitemap", "required"], path, issues);
        if (!validRoute(route.match)) {
          issues.push({ path: `${path}.match`, message: "Must be a path such as /pricing or /blog/**" });
        } else if (matches.has(route.match)) {
          issues.push({ path: `${path}.match`, message: "Duplicate route rule" });
        } else {
          matches.add(route.match);
        }
        if (route.indexable !== undefined && typeof route.indexable !== "boolean") {
          issues.push({ path: `${path}.indexable`, message: "Must be true or false" });
        }
        if (route.sitemap !== undefined && !["required", "excluded", "optional"].includes(String(route.sitemap))) {
          issues.push({ path: `${path}.sitemap`, message: "Must be required, excluded, or optional" });
        }
        if (route.indexable === false && route.sitemap === "required") {
          issues.push({ path, message: "A noindex route cannot be required in the sitemap" });
        }
        if (input.environment === "preview" && route.indexable === true) {
          issues.push({ path: `${path}.indexable`, message: "Preview routes cannot be indexable" });
        }
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
    if (!isRecord(input.facts)) {
      issues.push({ path: "$.facts", message: "Must be an object keyed by fact name" });
    } else {
      for (const [name, fact] of Object.entries(input.facts)) {
        const path = `$.facts.${name}`;
        if (!name.trim()) issues.push({ path, message: "Fact name cannot be empty" });
        if (!isRecord(fact)) {
          issues.push({ path, message: "Must be an object with a value" });
          continue;
        }
        unknownKeys(fact, ["value", "currency", "billingPeriod", "unit"], path, issues);
        if (!["string", "number", "boolean"].includes(typeof fact.value) ||
            (typeof fact.value === "number" && !Number.isFinite(fact.value))) {
          issues.push({ path: `${path}.value`, message: "Must be a string, finite number, or boolean" });
        }
        if (fact.currency !== undefined &&
            (typeof fact.currency !== "string" || !/^[A-Z]{3}$/.test(fact.currency) || typeof fact.value !== "number")) {
          issues.push({ path: `${path}.currency`, message: "Must be a three-letter currency code on a numeric fact" });
        }
        if (fact.billingPeriod !== undefined && !["month", "year"].includes(String(fact.billingPeriod))) {
          issues.push({ path: `${path}.billingPeriod`, message: "Must be month or year" });
        }
        if (fact.unit !== undefined &&
            (typeof fact.unit !== "string" || !/^[\p{L}][\p{L}\p{N} -]{0,49}$/u.test(fact.unit.trim()) || typeof fact.value !== "number" || fact.currency !== undefined)) {
          issues.push({ path: `${path}.unit`, message: "Must be a short unit on a numeric non-currency fact" });
        }
      }
    }
  }

  if (input.bindings !== undefined) {
    if (!Array.isArray(input.bindings)) {
      issues.push({ path: "$.bindings", message: "Must be an array" });
    } else {
      input.bindings.forEach((binding: unknown, index: number) => {
        const path = `$.bindings[${index}]`;
        if (!isRecord(binding)) {
          issues.push({ path, message: "Must be an object" });
          return;
        }
        unknownKeys(binding, ["route", "selector", "fact"], path, issues);
        if (!validRoute(binding.route) || (typeof binding.route === "string" && binding.route.includes("*"))) {
          issues.push({ path: `${path}.route`, message: "Must be a single page path" });
        }
        if (typeof binding.selector !== "string" || !binding.selector.trim()) {
          issues.push({ path: `${path}.selector`, message: "Must be a nonempty CSS selector" });
        }
        if (typeof binding.fact !== "string" || !binding.fact.trim() ||
            !isRecord(input.facts) || !(binding.fact in input.facts)) {
          issues.push({ path: `${path}.fact`, message: "Must name a configured fact" });
        }
      });
    }
  }

  if (input.robotsRules !== undefined) {
    if (!Array.isArray(input.robotsRules)) {
      issues.push({ path: "$.robotsRules", message: "Must be an array of crawler rule groups" });
    } else {
      input.robotsRules.forEach((group: unknown, index: number) => {
        const path = `$.robotsRules[${index}]`;
        if (!isRecord(group)) {
          issues.push({ path, message: "Must be an object" });
          return;
        }
        unknownKeys(group, ["userAgents", "allow", "disallow"], path, issues);
        if (!Array.isArray(group.userAgents) || !group.userAgents.length ||
            group.userAgents.some((agent: unknown) => typeof agent !== "string" || !/^(?:\*|[A-Za-z][A-Za-z0-9_-]{0,99})$/.test(agent))) {
          issues.push({ path: `${path}.userAgents`, message: "List one or more valid crawler names" });
        }
        for (const field of ["allow", "disallow"] as const) {
          if (group[field] !== undefined &&
              (!Array.isArray(group[field]) || group[field].some((rule: unknown) =>
                typeof rule !== "string" || !rule.startsWith("/") || /[\r\n#]/.test(rule)))) {
            issues.push({ path: `${path}.${field}`, message: "Must list path rules starting with /" });
          }
        }
      });
    }
  }

  if (input.jsonLdTemplates !== undefined) {
    if (!Array.isArray(input.jsonLdTemplates)) {
      issues.push({ path: "$.jsonLdTemplates", message: "Must be an array" });
    } else {
      input.jsonLdTemplates.forEach((template: unknown, index: number) => {
        const path = `$.jsonLdTemplates[${index}]`;
        if (!isRecord(template)) {
          issues.push({ path, message: "Must be an object" });
          return;
        }
        unknownKeys(template, ["route", "type", "properties"], path, issues);
        if (!validRoute(template.route) || (typeof template.route === "string" && template.route.includes("*")))
          issues.push({ path: `${path}.route`, message: "Must be a single page path" });
        if (typeof template.type !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(template.type))
          issues.push({ path: `${path}.type`, message: "Must be a schema.org type name" });
        if (!isRecord(template.properties) || !Object.keys(template.properties).length) {
          issues.push({ path: `${path}.properties`, message: "Map at least one schema property to a fact" });
        } else {
          for (const [property, fact] of Object.entries(template.properties)) {
            if (!/^[A-Za-z][A-Za-z0-9]*$/.test(property) || ["constructor", "prototype"].includes(property))
              issues.push({ path: `${path}.properties.${property}`, message: "Must be a simple schema property name" });
            if (typeof fact !== "string" || !isRecord(input.facts) || !(fact in input.facts) ||
                !Array.isArray(input.bindings) || !input.bindings.some((binding: unknown) =>
                  isRecord(binding) && binding.route === template.route && binding.fact === fact))
              issues.push({ path: `${path}.properties.${property}`, message: "Must name a fact bound to this route" });
          }
        }
      });
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, config: input as unknown as SiteproofConfig };
}
