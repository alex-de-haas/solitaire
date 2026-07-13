import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { createServer } from "node:http";

const root = resolve(process.argv[2] || "dist");
const port = Number(process.env.PORT || process.env.HOSTY_PORT_HTTP || 4173);
const host = process.env.HOST || "127.0.0.1";
const appId = process.env.HOSTY_APP_ID || "com.haas.solitaire";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", appId, version: "0.1.0" });
    return;
  }

  let requestedPath;
  try {
    requestedPath = decodeURIComponent(url.pathname);
  } catch {
    sendJson(response, 400, { error: "invalid_path" });
    return;
  }

  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  let filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    sendJson(response, 403, { error: "path_not_allowed" });
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = resolve(filePath, "index.html");
    }
    const fileInfo = await stat(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "Content-Length": fileInfo.size,
      "Cache-Control": "no-cache"
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }
    sendJson(response, 500, { error: "server_error" });
  }
});

server.listen(port, host, () => {
  console.log(`Solitaire listening on http://${host}:${port}`);
});

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
