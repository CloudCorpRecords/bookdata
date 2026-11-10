# bookdata

bookdata is a small local bridge to the hosted HasData
Booking MCP server, which returns Booking.com data as
JSON. Give it a destination keyword plus check-in and
check-out dates and a party — rooms, adults, children —
and it searches the stays available there; give it one
property's Booking.com URL for the same dates, and it
fetches that property's full details: identity and
address, policies, price, rating and reviews, photos,
and the room suites available for the window.

The bridge keeps no stay data of its own. It serves
the upstream server's tool list locally, exactly as
captured from the live endpoint, and forwards each
tool call upstream, returning the result untouched.
The captured surface is read-only: it searches and
reads public Booking.com listing pages. Despite the
vendor name, there is no booking, reservation,
messaging, or payment tool in it.

## Tools

- `hasdata_booking_search_getBookingSearchResults` —
  search accommodations by destination. Required:
  `keyword`, `checkInDate`, `checkOutDate`, `rooms`,
  `adults`, `children`. Optional filters include
  `childrenAges`, `sort`, price range, bedrooms and
  bathrooms, property type, star rating, review score,
  facilities and accessibility features, bed and
  reservation preferences, `language`, `currency`, and
  `page` (25 results per page). Returns each hotel's
  id, title and URL, location, policies, price, rating,
  review summary, and main photo.
- `hasdata_booking_place_getBookingPlaceDetails` —
  fetch one property's full details. Required: `url`
  (a Booking.com property URL), `checkInDate`,
  `checkOutDate`, `rooms`, `adults`, `children`.
  Optional: `childrenAges`, `language`, `currency`.
  Returns property identity, address and coordinates,
  policies, price, rating and review summary, photos,
  and available room suites.

## Configuration

- `HASDATA_BOOKING_MCP_URL` (optional) — override the
  upstream endpoint. Defaults to
  `https://mcp.hasdata.com/mcp?apis=booking`. (The
  override hook is this rebuild's own labelled
  reconstruction.)
- `HASDATA_API_KEY` (optional) — when set, every
  upstream request carries an `x-api-key: <key>`
  header, for the caller's own HasData API key. When
  it is not set, no key header is sent. (The header
  name and the env name are pinned by the original's
  registry record; forwarding the key from this env
  var is a labelled reconstruction — the original
  surface was captured keyless.)

### Forwarding mechanics

On the first tool call the client opens a streamable
HTTP session with the upstream: a JSON-RPC
`initialize` request (protocolVersion `2025-03-26`,
clientInfo name `bookdata`), then a
`notifications/initialized` notification, then the
`tools/call` request carrying the caller's arguments
unchanged. When the upstream answers `initialize`
with an `Mcp-Session-Id` header, that value rides on
every later request of the session, which is reused
for the life of the process. Replies may arrive as
plain JSON or as server-sent events; both are read.

Successful upstream results pass through verbatim,
including any `isError` flag the upstream sets.
Failures — a JSON-RPC error, a non-2xx status, an
unreadable response, or a request that cannot be
completed — come back as an `isError` result whose
text starts with `bookdata error:` (this rendering
is this rebuild's own labelled reconstruction).

## CLI

Each tool is also a subcommand taking one JSON
argument string:

```bash
npx @reneturcios/bookdata hasdata_booking_search_getBookingSearchResults '{"keyword":"Paris","checkInDate":"2026-11-10","checkOutDate":"2026-11-14","rooms":1,"adults":2,"children":0}'
npx @reneturcios/bookdata hasdata_booking_place_getBookingPlaceDetails '{"url":"https://www.booking.com/hotel/fr/example.html","checkInDate":"2026-11-10","checkOutDate":"2026-11-14","rooms":1,"adults":2,"children":0}'
npx @reneturcios/bookdata --version
```

Exit codes: `0` on success, `1` on an `isError`
result, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/bookdata mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "bookdata": {
      "command": "npx",
      "args": ["-y", "@reneturcios/bookdata", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/bookdata
docker run --rm ghcr.io/cloudcorprecords/bookdata --version
```

The container's default command is `mcp`, so the first
form is a stdio MCP server; any other arguments reach
the CLI normally.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

The test suite runs entirely against a stubbed
JSON-RPC upstream — no live network calls.

## License

MIT — see `LICENSE`.
