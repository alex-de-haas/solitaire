import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection } from "node:net";
import { resolve } from "node:path";

import { createSolitaireServer } from "../scripts/server.mjs";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function close(server) {
  server.close();
  await once(server, "close");
}

async function rawRequest(port, request) {
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.setEncoding("utf8");
  let response = "";
  socket.on("data", (chunk) => {
    response += chunk;
  });
  await once(socket, "connect");
  socket.end(request);
  await once(socket, "close");
  return response;
}

test("the server ignores malformed Host values when parsing request paths", async () => {
  const server = createSolitaireServer({ root: resolve("public"), appId: "com.haas.solitaire.test" });
  const port = await listen(server);

  try {
    const response = await rawRequest(port, "GET /health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n");
    assert.match(response, /^HTTP\/1\.1 200 OK/m);
    assert.match(response, /"appId":"com\.haas\.solitaire\.test"/);
  } finally {
    await close(server);
  }
});
