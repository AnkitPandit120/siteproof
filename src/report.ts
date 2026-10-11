import type { SeoFinding } from "./checks.js";

export interface FindingSummary {
  errors: number;
  warnings: number;
  status: "pass" | "review" | "fail";
}

export interface FindingReport {
  url: string;
  summary: FindingSummary;
  findings: SeoFinding[];
}

export function makeFindingReport(url: string, findings: SeoFinding[]): FindingReport {
  const sorted = [...findings].sort((a, b) => (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1));
  const errors = sorted.filter((finding) => finding.severity === "error").length;
  const warnings = sorted.length - errors;
  return {
    url,
    summary: { errors, warnings, status: errors ? "fail" : warnings ? "review" : "pass" },
    findings: sorted,
  };
}
