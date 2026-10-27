# OV Bookmarks operations

## Runtime

- Source: `oovac/ov-bookmarks`, branch `feat/ov-bookmarks-mvp`.
- Railway project `17fb2379-3fe3-4047-ad66-8e45290e36cb`, production environment `787bd47d-fcd8-4eb4-bca9-5e094bb2e7b0`, service `efdced47-2d67-43b0-8463-8cdab2ac445b`.
- URL: https://ov-bookmarks-production.up.railway.app/dashboard/ov
- MCP: https://ov-bookmarks-production.up.railway.app/api/ov/mcp
- Volume: `8115e56c-3a23-40b3-8429-628abab96bc6`, `/data`, 1 GiB, Europe West, one replica.
- Dockerfile final target is `railway` derived from `aio`; web, workers and migrations run together.
- No Meilisearch or Chrome service. No automatic inference. `RATE_LIMITING_ENABLED` stays at upstream default false; OV enforces its own per-user request limits. Enabling native request limits requires a separate bulk-import budget because native creates are limited to 30/minute.

## Bootstrap and credentials

Public signup is disabled from the first boot. A one-time `/api/ov/bootstrap` endpoint requires the 48-byte random `OV_BOOTSTRAP_TOKEN` bearer secret and an empty user table. It creates the administrator from `OV_ADMIN_EMAIL` and `OV_INITIAL_PASSWORD`. A second invocation returns 409. The integration API key has only `bookmarks:readwrite` scope and is stored hashed in SQLite.

The initial login password is available to the owner in Railway → ov-bookmarks → Variables → `OV_INITIAL_PASSWORD`; no credentials are committed here. Change it in account settings after first login. Disable the bootstrap secret after initialization by setting it to an empty value. Never put credentials in URLs, browser bundles, plugin archives, or GitHub.

## API and scopes

POST `/api/ov/v1/<operation>` with a JSON body. Browser UI uses its authenticated same-origin session. Server-to-server clients send `Authorization: Bearer <scoped Karakeep key>`. All operations authorize resource ownership in the tRPC layer. `bookmarks:read` is enough for list/get/taxonomy/workspace/assessment queries. Mutation requires `bookmarks:readwrite`.

Read operations: list, get, taxonomyList, workspaceList, captures, openHistory, assessmentList, capabilities. Write operations: add, update, bulkImport, bulkUpdate, taxonomyCreate, taxonomyAssign, workspaceCreate, workspaceLinks, open, assessmentPrepare, assessmentRun, assessmentCancel.

`list` searches metadata, not full page text. Batches are capped at 1000; UI chunks larger input. The importer reports created/existing/invalid/failed/attached counts. Canonical mapping strips fragments and allowlisted trackers, retains meaningful queries, and leaves original URLs intact. Imports preserve pre-existing personal data, archive and membership.

Streamable HTTP MCP uses the official TypeScript SDK, stateless JSON responses, the same auth and scoped router. Native stdio MCP remains unchanged. Search without Meilisearch reports SearchUnavailable; use ov_bookmarks_list for metadata filters.

## Cerebras

Set `CEREBRAS_API_KEY` and optionally `CEREBRAS_MODEL` (default `gpt-oss-120b`) in Railway. Keys never go to the browser. Only an explicit assessment sends resource title/URL/description and up to 12k characters of captured text. Structured output is validated. Empty slots are retained; failures create failed rows, with retry as a new assessment. Two concurrent calls and ten runs per minute per user; 25-second timeout; cancel supported. The UI shows latest per task plus expandable history.

A missing key intentionally yields provider_not_configured. A successful mock/provider-contract test does not count as a live inference smoke test. Model availability must be checked with the configured account before marking that gate passed.

## Sites

`OV_SITE_CLIENTS` stores the discovered Site registry in Railway, outside the public repository. `packages/ov-sdk/client.ts` is a server-only helper. Each actual Site integration should get a separate scoped key in its secret store. Never embed a key in static HTML. Importing Site URLs as bookmarks does not modify the source or audience of those Sites.

## Domain

The custom domain `bookmarks.mirador.click` is attached but remains pending DNS ownership verification. The authoritative zone is not available in the connected Cloudflare account.

| Record | Name | Value |
|---|---|---|
| CNAME | bookmarks | 7lpulsf8.up.railway.app |
| TXT | _railway-verify.bookmarks | railway-verify=c191b4c05e700fc37c8239b09c69f164bdd9790761d7b97ae25fa76db50a4420 |

After Railway reports valid HTTPS, set `NEXTAUTH_URL=https://bookmarks.mirador.click` and redeploy. Keep the generated Railway URL until then.

## Backup / restore

The native Karakeep JSON export does not contain all OV extension tables. Use a full volume backup or consistent SQLite backup for OV recovery.

Inside the app container:

```sh
node /app/scripts/ov-sqlite-backup.mjs /data/backups/ov-manual.sqlite
```

This uses SQLite's online backup API and runs integrity_check. It includes all native and OV tables. Preserve `/data/assets` and other assets as well when moving to another volume. A database copy on the same volume does not protect against deletion of that volume.

Enable Railway daily volume backups and verify a manual snapshot in the Railway Backups UI. This setting is not exposed by the connected Railway MCP tools; do not assume it is enabled. For restore, stop the app before replacing the database or use Railway's full-volume restore. Preserve the pre-restore volume/snapshot and verify health, login, ten known bookmarks, ratings, terms, workspaces and open counts afterward.

A local real SQLite backup/restore test confirms ten bookmarks, archived rating/comment and open events survive. It does not prove Railway's volume backup configuration.

## Rollback

Record the live commit and Railway deployment ID before upgrading. Select a previously successful Railway deployment to roll back application code. Keep `/data` attached. Do not roll back a schema-incompatible image without restoring a matching volume snapshot. Existing migration files are immutable; OV adds migration 0096. Baseline Karakeep bookmarks and clients continue to use their original tables and APIs.

## Verification record

- 662 tests passed across 41 files in shared/tRPC/API; separate SQLite restore and HTTP MCP suite: 3 passed.
- TypeScript web/API dependency graph passed after Next generated route types.
- Frozen lockfile validated locally, install scripts skipped only in that validation. Native SQLite and RE2 ran in actual tests.
- 1000 entries / 100 repeats → 900 unique, repeat import → zero new records.
- Owner isolation, read-only key scopes, invalid/private URL rejection, metadata retention, independent flags, exact open counts, empty/failed assessments and SDK MCP discovery/call passed.
- Deployment, browser, domain, provider and ChatGPT connection gates must be recorded from their actual results; pending integrations are not green checks.
