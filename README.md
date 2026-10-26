# Siteproof

Siteproof scores a single website page for **SEO** and **GEO** technical readiness. Its CLI prints only two numbers:

```text
SEO 90/100
GEO 65/100
```

It does not predict search rankings, AI citations, or traffic. The score is a repeatable technical check of the HTML response, metadata, crawler access, structured data, and optionally facts bound to visible page text.

## Run it

Requires Node.js 20 or newer. Install the beta package, then score your running site:

```sh
npm install --save-dev siteproof-seo@beta
npx siteproof score http://localhost:3000/
npx siteproof score http://localhost:3000/pricing
```

Use `--json` when another program needs the two numbers:

```sh
npx siteproof score http://localhost:3000/ --json
# {"seo":90,"geo":65}
```

For facts you want checked against visible HTML, supply a config file:

```json
{
  "siteUrl": "http://localhost:3000",
  "facts": { "product": { "value": "Example Pro" } },
  "bindings": [{ "route": "/pricing", "selector": "h1", "fact": "product" }]
}
```

```sh
npx siteproof score http://localhost:3000/pricing --config siteproof.config.json
```

The target URL must have the same origin as `siteUrl` in the config. You can omit the config entirely for a basic score. A preview site can set `"environment": "preview"`; Siteproof then expects a `noindex` directive.

## How the scores work

Both scores range from 0 to 100. SEO measures page response, title, description, canonical, indexing, robots access, social metadata, and structured data. GEO measures page access, description, structured data, and verified on-page facts. **Checks that cannot run receive zero weight in the displayed score.** For example, if facts are not configured, GEO cannot earn the 35 points reserved for verified facts. This avoids reporting a complete-looking `100/100` based on partial coverage.

A successful command returns exit code 0 even when a score is low. Invalid arguments return 2; unreadable pages or invalid configuration return 1. The CLI no longer generates files or prints audit findings. The library exports `scoreSite(url, config?)` for the same two-number result.

To run the repository checks and a local example:

```sh
npm ci
npm test
node examples/local-demo.mjs
```

This beta is configured for the `beta` npm tag. The GitHub source repository remains private. The package is marked `UNLICENSED`; no open-source license is granted.
