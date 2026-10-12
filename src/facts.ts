import { load } from "cheerio";
import type { Fact, SiteproofConfig } from "./config.js";

export interface FactFinding {
  code: "fact_selector_invalid" | "fact_selector_missing" | "fact_selector_multiple" | "fact_value_mismatch" | "fact_value_ambiguous" | "fact_page_unavailable";
  severity: "error" | "warning";
  fact: string;
  selector: string;
  message: string;
  expected?: string;
  observed?: string;
}

export interface FactBindingResult {
  fact: string;
  selector: string;
  status: "pass" | "fail" | "not_checked";
  observed?: string;
}

export interface FactCheckResult {
  bindings: FactBindingResult[];
  findings: FactFinding[];
}

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function expectedText(fact: Fact): string {
  return [String(fact.value), fact.currency, fact.unit, fact.billingPeriod ? `per ${fact.billingPeriod}` : undefined].filter(Boolean).join(" ");
}

function compareFact(observed: string, fact: Fact): "match" | "mismatch" | "ambiguous" {
  if (typeof fact.value !== "number") return observed === String(fact.value) ? "match" : "mismatch";
  const values = observed.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (values.length > 1) return "ambiguous";
  if (values.length !== 1 || Number(values[0].replaceAll(",", "")) !== fact.value) return "mismatch";
  if (fact.currency) {
    const symbols: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
    if (!observed.includes(fact.currency) && !(symbols[fact.currency] && observed.includes(symbols[fact.currency]))) return "mismatch";
  }
  if (fact.billingPeriod) {
    const period = fact.billingPeriod === "month" ? /(?:\/\s*(?:mo|month)|per\s+month|monthly)/i : /(?:\/\s*(?:yr|year)|per\s+year|yearly|annually)/i;
    if (!period.test(observed)) return "mismatch";
  }
  if (fact.unit) {
    const unit = fact.unit.toLowerCase().trim();
    const actual = observed.toLowerCase();
    const variants = unit.endsWith("s") ? [unit, unit.slice(0, -1)] : [unit, `${unit}s`];
    if (!variants.some((variant) => new RegExp(`(^|[^\\p{L}\\p{N}])${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(actual))) return "mismatch";
  }
  return "match";
}

export function checkFactBindings(html: string, pageUrl: string, config: SiteproofConfig): FactCheckResult {
  const bindings: FactBindingResult[] = [];
  const findings: FactFinding[] = [];
  const path = new URL(pageUrl).pathname;
  const relevant = (config.bindings ?? []).filter((binding) => binding.route === path);
  if (!relevant.length) return { bindings, findings };
  const $ = load(html);
  for (const binding of relevant) {
    const fact = config.facts?.[binding.fact];
    if (!fact) continue;
    const base = { fact: binding.fact, selector: binding.selector };
    if (!html) {
      bindings.push({ ...base, status: "not_checked" });
      findings.push({ ...base, code: "fact_page_unavailable", severity: "warning", message: "Page HTML was unavailable, so this fact was not checked" });
      continue;
    }
    let elements;
    try {
      elements = $(binding.selector);
    } catch {
      bindings.push({ ...base, status: "fail" });
      findings.push({ ...base, code: "fact_selector_invalid", severity: "error", message: "Fact binding has an invalid CSS selector" });
      continue;
    }
    if (!elements.length) {
      bindings.push({ ...base, status: "fail" });
      findings.push({ ...base, code: "fact_selector_missing", severity: "error", message: "Fact selector matched no elements", expected: expectedText(fact) });
      continue;
    }
    if (elements.length > 1) {
      bindings.push({ ...base, status: "fail" });
      findings.push({ ...base, code: "fact_selector_multiple", severity: "error", message: "Fact selector must match exactly one element", expected: expectedText(fact), observed: `${elements.length} elements` });
      continue;
    }
    const observed = normalized(elements.text());
    const comparison = compareFact(observed, fact);
    if (comparison !== "match") {
      bindings.push({ ...base, status: "fail", observed });
      findings.push({ ...base, code: comparison === "ambiguous" ? "fact_value_ambiguous" : "fact_value_mismatch", severity: "error", message: comparison === "ambiguous" ? "Selected text contains multiple numbers; bind the fact to one value" : "Visible page fact differs from the configured fact", expected: expectedText(fact), observed });
    } else {
      bindings.push({ ...base, status: "pass", observed });
    }
  }
  return { bindings, findings };
}
