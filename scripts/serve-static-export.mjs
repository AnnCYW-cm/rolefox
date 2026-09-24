import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.cwd(), process.argv[2] ?? "apps/web/out");
const port = Number.parseInt(process.argv[3] ?? "4173", 10);
const host = "127.0.0.1";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

async function resolveFile(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const requestedPath = path.resolve(root, relativePath);

  if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) {
    return undefined;
  }

  const candidates = [requestedPath];
  if (path.extname(requestedPath) === "") {
    candidates.push(`${requestedPath}.html`, path.join(requestedPath, "index.html"));
  }

  for (const candidate of candidates) {
    try {
      const metadata = await stat(candidate);
      if (metadata.isDirectory()) {
        const indexPath = path.join(candidate, "index.html");
        const indexMetadata = await stat(indexPath);
        if (indexMetadata.isFile()) return indexPath;
      }
      if (metadata.isFile()) return candidate;
    } catch {
      // Try the next static-export representation.
    }
  }

  return undefined;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let filePath;
  try {
    filePath = await resolveFile(request.url ?? "/");
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (!filePath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type":
      contentTypes.get(path.extname(filePath).toLowerCase()) ??
      "application/octet-stream",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Serving ${root} at http://${host}:${port}/\n`);
});
