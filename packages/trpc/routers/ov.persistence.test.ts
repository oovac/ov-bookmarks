import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, expect, test } from "vitest";
import * as schema from "@karakeep/db/schema";
import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach, getApiCaller } from "../testUtils";
beforeEach<CustomTestContext>(defaultBeforeEach(true));
test<CustomTestContext>("consistent SQLite backup restores links, OV metadata and events", async ({
  db,
  apiCallers,
}) => {
  const api = apiCallers[0].ov;
  const links = [];
  for (let n = 0; n < 10; n++)
    links.push(await api.add({ url: `https://example.com/backup/${n}` }));
  await api.update({
    bookmarkId: links[0].id,
    userRating: 1,
    userComment: "Keep archived",
    archived: true,
  });
  await api.open({ bookmarkId: links[0].id });
  const dir = await mkdtemp(path.join(tmpdir(), "ov-restore-"));
  const file = path.join(dir, "restored.sqlite");
  try {
    await db.$client.backup(file);
    const sqlite = new Database(file);
    try {
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      const restored = drizzle(sqlite, { schema });
      const user = restored.select().from(schema.users).get()!;
      const caller = getApiCaller(restored, user.id).ov;
      expect((await caller.list({ view: "all" })).total).toBe(10);
      expect(await caller.get({ bookmarkId: links[0].id })).toMatchObject({
        archived: true,
        totalOpens: 1,
        meta: { userRating: 1, userComment: "Keep archived" },
      });
    } finally {
      sqlite.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
