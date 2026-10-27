import { timingSafeEqual } from "node:crypto";
import { users } from "@karakeep/db/schema";
import { User } from "@karakeep/trpc/models/users";
import { generateApiKey } from "@karakeep/trpc/auth";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { authMiddleware } from "../middlewares/auth";
import {
  ovAddInput,
  ovListInput,
  ovUpdateInput,
} from "@karakeep/trpc/routers/ov";

// Session requests must be same-origin. Sites use scoped bearer keys server-side.
const app = new Hono<{ Variables: { ctx: import("@karakeep/trpc").Context } }>()
  .use(bodyLimit({ maxSize: 2 * 1024 * 1024 }))
  .post("/bootstrap", async (c) => {
    const expected = process.env.OV_BOOTSTRAP_TOKEN;
    const provided =
      c.req.header("Authorization")?.replace(/^Bearer /, "") || "";
    if (
      !expected ||
      expected.length < 32 ||
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    )
      return c.json({ error: "Unauthorized" }, 401);
    if (c.var.ctx.db.select().from(users).limit(1).get())
      return c.json({ error: "Already initialized" }, 409);
    const email = process.env.OV_ADMIN_EMAIL;
    const password = process.env.OV_INITIAL_PASSWORD;
    if (!email || !password || password.length < 16)
      return c.json({ error: "Bootstrap is not configured" }, 503);
    const owner = await User.createRaw(c.var.ctx.db, {
      name: "Ordo Vacui",
      email,
      password,
      role: "admin",
      emailVerified: true,
    });
    const key = await generateApiKey(
      "OV deployment integration",
      owner.id,
      c.var.ctx.db,
      ["bookmarks:readwrite"],
    );
    return c.json({ userId: owner.id, apiKey: key.key });
  })
  .use(authMiddleware)
  .use(async (c, next) => {
    const origin = c.req.header("Origin");
    if (
      origin &&
      origin !== new URL(c.req.url).origin &&
      c.var.ctx.auth?.type !== "apiKey"
    )
      return c.json({ error: "Cross-origin session request denied" }, 403);
    await next();
  });
const operations = {
  list: { schema: ovListInput, read: true },
  get: { schema: z.object({ bookmarkId: z.string() }), read: true },
  add: { schema: ovAddInput, read: false },
  update: { schema: ovUpdateInput, read: false },
  bulkImport: {
    schema: z.object({
      links: z
        .array(ovAddInput.omit({ workspaceId: true }))
        .min(1)
        .max(1000),
      workspaceId: z.string().optional(),
      snapshot: z
        .object({
          label: z.string().optional(),
          browser: z.string().optional(),
        })
        .optional(),
    }),
    read: false,
  },
  taxonomyList: { schema: z.object({}), read: true },
  taxonomyCreate: {
    schema: z.object({
      kind: z.enum(["topic", "case"]),
      name: z.string(),
      triggerDescription: z.string().optional(),
    }),
    read: false,
  },
  taxonomyAssign: {
    schema: z.object({
      bookmarkIds: z.array(z.string()),
      termIds: z.array(z.string()),
      remove: z.boolean().optional(),
    }),
    read: false,
  },
  workspaceList: { schema: z.object({}), read: true },
  workspaceCreate: {
    schema: z.object({ name: z.string(), description: z.string().optional() }),
    read: false,
  },
  workspaceLinks: {
    schema: z.object({
      workspaceId: z.string(),
      bookmarkIds: z.array(z.string()),
      remove: z.boolean().optional(),
    }),
    read: false,
  },
  assessmentList: { schema: z.object({ bookmarkId: z.string() }), read: true },
  assessmentPrepare: {
    schema: z.object({ bookmarkId: z.string(), task: z.string() }),
    read: false,
  },
  assessmentRun: {
    schema: z.object({ bookmarkId: z.string(), task: z.string() }),
    read: false,
  },
  open: {
    schema: z.object({
      bookmarkId: z.string(),
      source: z.enum(["web", "workspace", "sites", "mcp"]).optional(),
    }),
    read: false,
  },
  openHistory: { schema: z.object({ bookmarkId: z.string() }), read: true },
  captures: { schema: z.object({ workspaceId: z.string() }), read: true },
  capabilities: { schema: z.object({}), read: true },
  bulkUpdate: {
    schema: z.object({
      bookmarkIds: z.array(z.string()),
      patch: ovUpdateInput.omit({ bookmarkId: true }),
    }),
    read: false,
  },
} as const;
type Operation = keyof typeof operations;
// Routing is allowlisted here and validation/ACL remains authoritative in tRPC.
async function invoke(
  api: Record<string, (input: never) => Promise<unknown>>,
  name: Operation,
  args: unknown,
) {
  return api[name](operations[name].schema.parse(args) as never);
}
app.post("/v1/:operation", async (c) => {
  const name = c.req.param("operation") as Operation;
  if (!Object.hasOwn(operations, name))
    return c.json({ error: "Unknown OV operation" }, 404);
  const args = await c.req.json().catch(() => null);
  if (args === null) return c.json({ error: "Invalid JSON" }, 400);
  const parsed = operations[name].schema.safeParse(args);
  if (!parsed.success)
    return c.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      400,
    );
  return c.json(await invoke(c.var.api.ov, name, parsed.data));
});
app.get("/v1/links", async (c) =>
  c.json(
    await c.var.api.ov.list({
      q: c.req.query("q"),
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : 40,
    }),
  ),
);
const tools: [string, Operation, string][] = [
  [
    "ov_bookmarks_list",
    "list",
    "List bookmarks using SQL metadata filters; full-text search is unavailable without Meilisearch.",
  ],
  ["ov_bookmarks_get", "get", "Read one bookmark and OV metadata."],
  [
    "ov_bookmarks_add",
    "add",
    "Save a public URL; reuse duplicates without overwriting metadata.",
  ],
  [
    "ov_bookmarks_update",
    "update",
    "Update statuses, human rating and comment.",
  ],
  [
    "ov_bookmarks_bulk_add",
    "bulkImport",
    "Import up to 1000 URLs, optionally into a workspace and tab snapshot.",
  ],
  ["ov_taxonomy_list", "taxonomyList", "List topics and use cases."],
  ["ov_taxonomy_create", "taxonomyCreate", "Create a topic or use case."],
  [
    "ov_taxonomy_assign",
    "taxonomyAssign",
    "Assign or remove terms on bookmarks.",
  ],
  ["ov_workspace_list", "workspaceList", "List static project workspaces."],
  ["ov_workspace_create", "workspaceCreate", "Create a static workspace."],
  [
    "ov_workspace_add_links",
    "workspaceLinks",
    "Add or remove bookmarks in a workspace.",
  ],
  [
    "ov_assessment_list",
    "assessmentList",
    "Read task-specific model assessments.",
  ],
  [
    "ov_assessment_prepare",
    "assessmentPrepare",
    "Prepare an empty task assessment slot.",
  ],
  [
    "ov_assessment_run",
    "assessmentRun",
    "Send bookmark metadata to Cerebras and store a separate assessment. May incur inference cost.",
  ],
];
app.all("/mcp", async (c) => {
  if (c.var.ctx.auth?.type !== "apiKey")
    return c.json({ error: "MCP requires a scoped Bearer API key" }, 401, {
      "WWW-Authenticate": "Bearer",
    });
  const server = new McpServer({ name: "ov-bookmarks", version: "0.1.0" });
  for (const [name, operation, description] of tools) {
    const { schema, read } = operations[operation];
    server.registerTool(
      name,
      {
        description,
        inputSchema: (schema instanceof z.ZodDefault
          ? schema.removeDefault()
          : schema) as z.ZodObject<z.ZodRawShape>,
        annotations: {
          readOnlyHint: read,
          destructiveHint: false,
          idempotentHint: read || operation === "add",
          openWorldHint: operation === "assessmentRun",
        },
      },
      async (args: unknown) => {
        try {
          const result = await invoke(c.var.api.ov, operation, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "OV request failed. Check bookmark ownership, API key scopes and arguments.",
              },
            ],
          };
        }
      },
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    await server.close();
  }
});
export default app;
