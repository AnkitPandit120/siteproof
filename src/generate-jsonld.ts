import type { SiteproofConfig } from "./config.js";
import { checkFactBindings } from "./facts.js";

export interface JsonLdPreview {
  route: string;
  json: string | null;
  verifiedFacts: string[];
  errors: string[];
}

export function previewJsonLd(html: string, route: string, config: SiteproofConfig): JsonLdPreview {
  const templates = config.jsonLdTemplates?.filter((template) => template.route === route) ?? [];
  const errors: string[] = [];
  if (!templates.length) errors.push(`No JSON-LD template is configured for ${route}`);
  const result = checkFactBindings(html, new URL(route, config.siteUrl).href, config);
  const names = new Set(templates.flatMap((template) => Object.values(template.properties)));
  for (const name of names) {
    const bindings = result.bindings.filter((binding) => binding.fact === name);
    if (bindings.length !== 1 || bindings[0].status !== "pass") {
      errors.push(`Fact ${name} is not verified against visible page content`);
    }
  }
  if (errors.length) return { route, json: null, verifiedFacts: [], errors };

  const nodes = templates.map((template) => ({
    "@type": template.type,
    ...Object.fromEntries(Object.entries(template.properties).map(([property, name]) => [property, config.facts![name].value])),
  }));
  const document = nodes.length === 1 ? { "@context": "https://schema.org", ...nodes[0] } :
    { "@context": "https://schema.org", "@graph": nodes };
  return { route, json: `${JSON.stringify(document, null, 2)}\n`, verifiedFacts: [...names], errors };
}
