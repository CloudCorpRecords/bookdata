# BUILD REPORT — bookdata

Rebuild of `com.hasdata/booking` v1.0.8 (remote-only, keyless capture)
as `@reneturcios/bookdata` 0.1.0 / `io.github.CloudCorpRecords/bookdata`.

## Fixture conflicts

**None.** The brief, the spec prose, and the fixture agree on both tool
names and every required field. Required fields as served, taken from
the fixture (`harness/fixtures/hasdata-booking-tools-original.json`):

- `hasdata_booking_place_getBookingPlaceDetails` — required: `url`, `checkInDate`, `checkOutDate`, `rooms`, `adults`, `children`
- `hasdata_booking_search_getBookingSearchResults` — required: `keyword`, `checkInDate`, `checkOutDate`, `rooms`, `adults`, `children`

The fixture's tool literals (name, title, description, inputSchema —
including both `title` keys, every property description and enum,
`additionalProperties: false`, and the `$schema` key on both schemas)
are served verbatim from `src/forward.ts`; the TOOL_DEFS literals were
generated programmatically by parsing the fixture JSON and
re-serialising it, so nothing was retyped. This was verified by the
registration-integrity test (served tools/list deep-equals the
fixture's 2 tool objects, in order) and again by the parity harness.

## What was built

All 19 factory files under `builds/bookdata/`:

- `package.json` (`@reneturcios/bookdata` 0.1.0, bin
  `bookdata` → `dist/cli.js`, deps exactly `@modelcontextprotocol/sdk ^1`
  + `zod ^3`; devDeps `@types/node ^20`, `tsx ^4`, `typescript ^5`)
- `server.json` (description exactly the prescribed 94-char string
  "Booking.com stays as JSON: search stays by destination and dates, fetch full property details.";
  measured length: **94 characters**; npm entry carries
  `"version": "0.1.0"`; OCI entry
  `ghcr.io/cloudcorprecords/bookdata:0.1.0` carries **no** version field)
- `Dockerfile` (node:20-alpine both stages; server-name label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/bookdata"`
  matches `server.json`)
- `tsconfig.json` (fleet-identical, 318 bytes), `.gitignore`,
  `package-lock.json`, `README.md` (fresh prose), `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `CHANGELOG.md` (single 0.1.0 entry,
  2026-10-28)
- `src/index.ts`, `src/cli.ts`, `src/mcp.ts`, `src/types.ts`,
  `src/forward.ts` (core; exports `VERSION = "0.1.0"`)
- `test/forward.test.ts`
- `.github/workflows/{ci.yml, publish.yml, publish-container.yml,
  registry-publish.yml}` (container workflow: IMAGE
  `ghcr.io/cloudcorprecords/bookdata`, smoke assertion on server name
  `bookdata`)

Plus `BUILD-REPORT.md` (this file) and the `parity-out/` harness output.

## Design

- Forwarding client to `https://mcp.hasdata.com/mcp?apis=booking`
  (pinned; the query string is part of the pinned URL), overridable via
  `HASDATA_BOOKING_MCP_URL` (labelled reconstruction). tools/call is
  forwarded as a streamable-HTTP JSON-RPC client: initialize
  (protocolVersion `2025-03-26`, clientInfo `bookdata`) →
  notifications/initialized → tools/call, honouring `Mcp-Session-Id`
  when issued; session established lazily and reused per client.
  Plain-JSON and SSE replies both parsed; the matching-id message
  wins; upstream results pass through verbatim (including `isError`
  and extra fields such as `structuredContent`).
- When `HASDATA_API_KEY` is set, an `x-api-key: <value>` header is
  sent on every upstream request (header name pinned by the registry
  record's remote declaration; forwarding it from this env var is a
  labelled reconstruction — the capture was keyless). When unset, no
  key header is sent. No `Authorization` header is sent in either
  case. Both branches are covered by tests.
- Upstream failures (JSON-RPC error, non-2xx status, malformed body,
  throwing/timing-out fetch) surface as `bookdata error:` text
  results (labelled reconstruction).
- Registration via the MCP SDK **low-level** `Server` API
  (`ListToolsRequestSchema` / `CallToolRequestSchema` handlers) serving
  the fixture literals exactly; no `McpServer` + zod registration.
  `src/mcp.ts` also exports `createServer` / `startMcpServer` /
  `handleCallTool` so the MCP layer is testable without a transport;
  the CLI's `mcp` subcommand starts it over stdio.
- Core takes an injectable fetch (`ForwardDeps.fetchFn`), so all tests
  run against a stubbed JSON-RPC upstream. No live network calls in
  tests; no live call claimed anywhere. The captured surface is two
  read-only fetches over public Booking.com pages; no booking,
  reservation, messaging, or payment tool exists in the surface —
  none was added.

## Lockfile (Route 3, clean)

Generated in the build dir with no `node_modules` present:
`npm install --package-lock-only --ignore-scripts --offline`.
Verified: parses, `name == @reneturcios/bookdata`,
**128 package entries**. Then
`npm install --ignore-scripts --offline` in the build dir for
`node_modules`. No write-guard failure occurred.

## Verification (all in the build dir unless noted)

- `npx tsc --noEmit` → exit 0
- `npm run build` → real `dist/` (cli.js 2296 B, forward.js 28625 B,
  mcp.js 2672 B, all non-empty, with `.d.ts` + source maps)
- `node dist/cli.js --version` → `0.1.0`; unknown subcommand → usage on
  stderr, exit 2
- `npm test` → **47 tests, 47 pass, 0 fail** (8 suites: registration
  integrity — served tools deep-equal the fixture's full 2 tool
  objects, names in order, title key and exact key sets per tool,
  required fields and every property key in order per tool,
  additionalProperties/$schema, VERSION; session
  establishment/reuse/session-id handling; env and explicit URL
  overrides; x-api-key header present on every request when the key
  is set / absent when unset / no Authorization header in either
  case; verbatim argument forwarding for both tools including rich
  search filters; verbatim result pass-through incl. upstream
  isError and SSE; JSON-RPC/init/malformed/HTTP/throw/timeout
  failures → `bookdata error:`; parseRpcBody JSON + SSE cases;
  MCP-layer validation — unknown tool MethodNotFound, non-object
  args InvalidParams; CLI --version / -v / unknown exit 2 /
  bad-JSON exit 2)
- Parity: `python3 harness/parity.py --original
  harness/fixtures/hasdata-booking-tools-original.json --rebuild
  "stdio:node builds/bookdata/dist/cli.js mcp" --out
  builds/bookdata/parity-out` (run from `~/workspace/mcp-rebuild-100`)
  → **PASS, parity 100.0, 2/2 identical, no missing/extra/schema
  diffs** (see `parity-out/parity.json`)
- Consistency sweep: package.json version = server.json top-level =
  npm-entry version = OCI tag = core `VERSION` = CHANGELOG heading
  (0.1.0); package.json `mcpName` = server.json `name` = Dockerfile
  label; server.json description measured at 94 chars; OCI entry
  confirmed to have no `version` field.

Clean-room: all prose and code written fresh for bookdata; only the
mechanics were patterned on the sibling staydata build, and only the
fixture's tool literals are served verbatim.
