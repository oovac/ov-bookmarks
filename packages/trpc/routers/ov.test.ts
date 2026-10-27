import { beforeEach, expect, test } from "vitest";
import { defaultBeforeEach } from "../testUtils";
import type { CustomTestContext } from "../testUtils";
beforeEach<CustomTestContext>(defaultBeforeEach(true));
test<CustomTestContext>("OV import reuses canonical links and preserves archived bad ratings", async ({
  apiCallers,
}) => {
  const api = apiCallers[0].ov;
  const a = await api.add({ url: "https://example.com/a?utm_source=one#top" });
  await api.update({
    bookmarkId: a.id,
    archived: true,
    userRating: 1,
    userComment: "Не подходит",
  });
  const b = await api.add({ url: "https://EXAMPLE.com:443/a?utm_source=two" });
  expect(b.id).toBe(a.id);
  expect(b.archived).toBe(true);
  expect(b.meta?.userRating).toBe(1);
  expect(b.meta?.userComment).toBe("Не подходит");
});

test<CustomTestContext>("1000 inputs with 100 repeats create 900 links; repeated import is idempotent", async ({
  apiCallers,
}) => {
  const api = apiCallers[0].ov;
  const links = Array.from({ length: 1000 }, (_, i) => ({
    url: `https://example.com/item/${i % 900}`,
  }));
  const workspace = await api.workspaceCreate({ name: "Research" });
  const first = await api.bulkImport({
    links,
    workspaceId: workspace.id,
    snapshot: { label: "Window" },
  });
  expect(first).toMatchObject({
    created: 900,
    existing: 100,
    invalid: 0,
    failed: 0,
    attachedToWorkspace: 900,
  });
  const second = await api.bulkImport({ links, workspaceId: workspace.id });
  expect(second).toMatchObject({
    created: 0,
    existing: 1000,
    attachedToWorkspace: 0,
  });
  expect(
    (await api.list({ view: "all", workspaceId: workspace.id })).total,
  ).toBe(900);
  expect(
    (await api.captures({ workspaceId: workspace.id }))[0].bookmarkIds,
  ).toHaveLength(1000);
}, 30000);

test<CustomTestContext>("states combine, rating zero is invalid, archive retains terms and workspace", async ({
  apiCallers,
}) => {
  const api = apiCallers[0].ov;
  const link = await api.add({ url: "https://example.com" });
  const topic = await api.taxonomyCreate({ kind: "topic", name: "AI" });
  const useCase = await api.taxonomyCreate({
    kind: "case",
    name: "GPU",
    triggerDescription: "Когда нужна видеокарта",
  });
  await api.taxonomyAssign({
    bookmarkIds: [link.id],
    termIds: [topic.id, useCase.id],
  });
  await api.update({
    bookmarkId: link.id,
    favourited: true,
    reviewPriority: 5,
    forFuture: true,
    forCase: true,
    userRating: 1,
    archived: true,
  });
  const saved = await api.get({ bookmarkId: link.id });
  expect(saved.terms).toHaveLength(2);
  expect(saved.meta).toMatchObject({
    reviewPriority: 5,
    forFuture: true,
    forCase: true,
    userRating: 1,
  });
  expect(
    (
      await api.list({
        view: "archive",
        topicIds: [topic.id],
        caseIds: [useCase.id],
        ratingMax: 2,
      })
    ).total,
  ).toBe(1);
  await expect(
    api.update({ bookmarkId: link.id, userRating: 0 }),
  ).rejects.toThrow();
});

test<CustomTestContext>("foreign users cannot read, modify, assign or attach owned resources", async ({
  apiCallers,
  unauthedAPICaller,
}) => {
  const a = apiCallers[0].ov,
    b = apiCallers[1].ov;
  const link = await a.add({ url: "https://example.com/a" }),
    other = await b.add({ url: "https://example.com/b" });
  const w = await a.workspaceCreate({ name: "Private" }),
    t = await a.taxonomyCreate({ kind: "case", name: "Private" });
  await expect(b.get({ bookmarkId: link.id })).rejects.toThrow();
  await expect(
    b.update({ bookmarkId: link.id, archived: true }),
  ).rejects.toThrow();
  await expect(
    b.workspaceLinks({ workspaceId: w.id, bookmarkIds: [other.id] }),
  ).rejects.toThrow();
  await expect(
    b.taxonomyAssign({ bookmarkIds: [other.id], termIds: [t.id] }),
  ).rejects.toThrow();
  await expect(unauthedAPICaller.ov.list()).rejects.toThrow();
  expect((await b.list({ view: "all" })).total).toBe(1);
});

test<CustomTestContext>("two explicit opens produce exactly two events and counts", async ({
  apiCallers,
}) => {
  const api = apiCallers[0].ov,
    l = await api.add({ url: "https://example.com" });
  await api.open({ bookmarkId: l.id });
  await api.open({ bookmarkId: l.id });
  expect(await api.get({ bookmarkId: l.id })).toMatchObject({
    totalOpens: 2,
    opens7d: 2,
    opens30d: 2,
  });
  expect(await api.openHistory({ bookmarkId: l.id })).toHaveLength(2);
  expect((await api.list({ view: "frequent" })).items[0].id).toBe(l.id);
});

test<CustomTestContext>("task slots start empty and missing provider produces a failed retained assessment", async ({
  apiCallers,
}) => {
  const api = apiCallers[0].ov,
    l = await api.add({ url: "https://example.com" });
  const empty = await api.assessmentPrepare({
    bookmarkId: l.id,
    task: "Research",
  });
  expect(empty).toMatchObject({ status: "empty", score: null });
  const result = await api.assessmentRun({
    bookmarkId: l.id,
    task: "Research",
  });
  expect(result).toMatchObject({
    status: "failed",
    score: null,
    errorCode: "provider_not_configured",
  });
  expect(await api.assessmentList({ bookmarkId: l.id })).toHaveLength(2);
  expect(
    (await api.list({ view: "all", aiTask: "Research", aiUnrated: true }))
      .total,
  ).toBe(1);
});

test<CustomTestContext>("filter pagination is stable and group terms are OR within each kind", async ({
  apiCallers,
}) => {
  const api = apiCallers[0].ov;
  for (const name of ["C", "A", "B"])
    await api.add({ url: `https://example.com/${name}`, title: name });
  const page = await api.list({ view: "all", sort: "title", limit: 2 });
  expect(page.items.map((l) => l.title)).toEqual(["A", "B"]);
  expect(
    (
      await api.list({
        view: "all",
        sort: "title",
        limit: 2,
        cursor: page.nextCursor!,
      })
    ).items.map((l) => l.title),
  ).toEqual(["C"]);
  await expect(api.list({ cursor: "injection" })).rejects.toThrow();
});

test<CustomTestContext>("invalid inputs are counted without aborting valid imports", async ({
  apiCallers,
}) => {
  const report = await apiCallers[0].ov.bulkImport({
    links: [
      { url: "javascript:alert(1)" },
      { url: "http://127.0.0.1/a" },
      { url: "http://2130706433" },
      { url: "https://example.com" },
    ],
  });
  expect(report).toMatchObject({ created: 1, invalid: 3, failed: 0 });
});

test<CustomTestContext>("read-only API keys can query but cannot write OV fields", async ({
  apiCallers,
  db,
}) => {
  const { getApiKeyCallerForPlainKey } = await import("../testUtils");
  const key = await apiCallers[0].apiKeys.create({
    name: "Read only",
    scopes: ["bookmarks:read"],
  });
  const reader = (await getApiKeyCallerForPlainKey(db, key.key)).ov;
  expect((await reader.list({ view: "all" })).total).toBe(0);
  await expect(reader.add({ url: "https://example.com" })).rejects.toThrow(
    "bookmarks:readwrite",
  );
});
