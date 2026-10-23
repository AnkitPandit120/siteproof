import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const server = createServer((request, response) => {
  if (request.url === "/robots.txt") return response.writeHead(404).end();
  if (request.url !== "/pricing") return response.writeHead(404).end();
  response.setHeader("content-type", "text/html");
  response.end('<head><title>Example Pro</title><meta name="description" content="Example Pro pricing"><link rel="canonical" href="' + `http://127.0.0.1:${server.address().port}/pricing` + '"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Example Pro"}</script></head><body><h1>Example Pro</h1></body>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const directory = await mkdtemp(join(tmpdir(), "siteproof-demo-"));
try {
  const config = {
    siteUrl: `http://127.0.0.1:${server.address().port}`,
    facts: { product: { value: "Example Pro" } },
    bindings: [{ route: "/pricing", selector: "h1", fact: "product" }],
  };
  const path = join(directory, "siteproof.config.json");
  await writeFile(path, JSON.stringify(config));
  const child = spawn(process.execPath, [cli, "score", `${config.siteUrl}/pricing`, "--config", path], { stdio: "inherit" });
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) process.exitCode = code ?? 1;
} finally {
  server.close();
  await rm(directory, { recursive: true, force: true });
}
