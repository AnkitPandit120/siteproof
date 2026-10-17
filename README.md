# Siteproof

Siteproof is a private beta of a local SEO and GEO audit CLI. It checks page metadata, indexing, robots rules, sitemaps, structured data, social tags, and configured facts against visible page text. Scores include **coverage** so an untested dimension cannot silently become a pass. GEO readiness is a heuristic about machine-readable content, not a promise of placement in AI answers.

## Run locally

Requires Node.js 20 or newer. From this repository:

```sh
npm ci
npm test
node examples/local-demo.mjs
```

To start checking your own site:

```sh
node dist/cli.js init --url https://example.com
node dist/cli.js config validate
node dist/cli.js check /pricing
```

The commands below use the `siteproof` binary after `npm link`; you can also replace `siteproof` with `node dist/cli.js` while working in this repository.

`check` writes a JSON report to standard output. It includes findings, an SEO health score, a GEO readiness score, and coverage for each score. Exit code 0 means no error-level findings; 1 means a failed check or inaccessible input; 2 means invalid CLI usage. Warnings remain in the report even when the exit code is 0.
`collect --json` and `coverage` also emit machine-readable reports with `schemaVersion: 1`.

## Configuration

Edit `siteproof.config.json` to name the pages and facts you want checked:

```json
{
  "siteUrl": "https://example.com",
  "environment": "production",
  "pages": ["/pricing"],
  "routes": [{ "match": "/pricing", "indexable": true, "sitemap": "required" }],
  "facts": { "product": { "value": "Example Pro" } },
  "bindings": [{ "route": "/pricing", "selector": "h1", "fact": "product" }],
  "jsonLdTemplates": [{ "route": "/pricing", "type": "Product", "properties": { "name": "product" } }]
}
```

Use `"environment": "preview"` for a preview host. Preview checks require a `noindex` directive and reject explicitly indexable routes. Siteproof will not generate a preview sitemap. Its preview robots output allows crawling so search engines can read `noindex`; access control for a private preview still belongs at the server or authentication layer.

## Commands

```sh
siteproof collect
siteproof coverage
siteproof inspect /pricing
siteproof check /pricing
siteproof sitemap generate > sitemap.xml
siteproof robots generate > robots.txt
siteproof jsonld preview /pricing
siteproof jsonld write /pricing product.json --reviewed <preview-hash>
```

Generation commands print to standard output except `jsonld write`, which requires a hash from a prior preview and creates a new file without overwriting one. Verify the generated markup against your site before deployment. `robots.txt` is generated only from explicit crawler rules; a `noindex` route does not automatically become `Disallow`.

## Beta limits

Only configured routes and bounded sitemap discovery are checked; Siteproof does not crawl arbitrary links or render JavaScript. Fact verification compares selected visible HTML text with configured values, and complex offers or rich-result eligibility need separate review. Scores show technical readiness, not search rankings. The package is intentionally private and has not been published to npm.
