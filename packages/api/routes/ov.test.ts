import { Hono } from "hono";
import { beforeEach, expect, test } from "vitest";
import { users } from "@karakeep/db/schema";
import type { Context } from "@karakeep/trpc";
import type { CustomTestContext } from "@karakeep/trpc/testUtils";
import { defaultBeforeEach } from "@karakeep/trpc/testUtils";
import ov from "./ov";

beforeEach<CustomTestContext>(defaultBeforeEach(true));
function makeApp(db: Context["db"], authenticated = true, write = true) {
  const user = db.select().from(users).get()!;
  return new Hono<{ Variables: { ctx: Context } }>()
    .use(async (c, next) => {
      c.set("ctx", {
        db,
        user: authenticated ? user : null,
        auth: authenticated
          ? {
              type: "apiKey",
              keyId: "http-qa",
              scopes: [write ? "bookmarks:readwrite" : "bookmarks:read"],
            }
          : null,
        req: { ip: null },
      });
      await next();
    })
    .route("/ov", ov);
}
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
test<CustomTestContext>("OV REST returns JSON and enforces read/write scopes", async ({
  db,
}) => {
  const app = makeApp(db);
  const saved = await app.request("http://localhost/ov/v1/add", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: "https://example.com" }),
  });
  expect(saved.status).toBe(200);
  const read = makeApp(db, true, false);
  const denied = await read.request("http://localhost/ov/v1/add", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: "https://example.com/new" }),
  });
  expect(denied.status).toBe(403);
  expect(denied.headers.get("Content-Type")).toContain("application/json");
  const unauth = await makeApp(db, false).request(
    "http://localhost/ov/v1/list",
    { method: "POST", headers, body: "{}" },
  );
  expect(unauth.status).toBe(401);
});
test<CustomTestContext>("HTTP MCP initializes and discovers real tools through SDK transport", async ({
  db,
}) => {
  const app = makeApp(db);
  const call = (body: unknown) =>
    app.request("http://localhost/ov/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const initialized = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "OV QA", version: "1" },
    },
  });
  expect(initialized.status).toBe(200);
  expect((await initialized.json()).result.serverInfo.name).toBe(
    "ov-bookmarks",
  );
  const listed = await call({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  expect(listed.status).toBe(200);
  const data = await listed.json();
  expect(data.result.tools.map((t: { name: string }) => t.name)).toContain(
    "ov_bookmarks_add",
  );
  const created = await call({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "ov_bookmarks_add",
      arguments: { url: "https://example.com/mcp" },
    },
  });
  expect(created.status).toBe(200);
  expect((await created.json()).result.isError).not.toBe(true);
});
