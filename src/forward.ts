/**
 * bookdata core: a forwarding client for the hosted
 * HasData Booking MCP server.
 *
 * No stay is searched and no property page is read
 * locally. tools/list is answered from the literal tool
 * definitions below, taken verbatim from a live capture
 * of the upstream server (name, title, description and
 * inputSchema exactly as captured, including the title
 * key both tools carry). A tools/call is forwarded over
 * a streamable-HTTP JSON-RPC session: an initialize
 * POST, a notifications/initialized POST, then the
 * tools/call POST, honouring the Mcp-Session-Id response
 * header when the upstream issues one. The session is
 * established lazily on the first forwarded call and
 * reused for the lifetime of the client.
 *
 * The upstream endpoint is pinned to
 * https://mcp.hasdata.com/mcp?apis=booking — the query
 * string is part of the pinned URL — and can be
 * overridden with the HASDATA_BOOKING_MCP_URL environment
 * variable (that override is a labelled reconstruction).
 * When HASDATA_API_KEY is set in the environment, every
 * upstream request carries an `x-api-key: <key>` header
 * (the header name is pinned by the registry record's
 * remote declaration; forwarding the key from this env
 * var is a labelled reconstruction — the capture itself
 * was taken keyless). When the variable is unset, no key
 * header is sent, and no Authorization header is sent in
 * either case.
 *
 * Upstream results pass through verbatim, including any
 * isError flag and any extra result fields. Failures — a
 * JSON-RPC error from the upstream, a non-2xx status, an
 * unparseable response, or a fetch that throws or times
 * out — surface as an isError result whose text starts
 * with `bookdata error:` (that rendering is a labelled
 * reconstruction). Responses may be plain JSON or SSE
 * (data: lines); the JSON-RPC message with the matching
 * id wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://mcp.hasdata.com/mcp?apis=booking";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/hasdata-booking-tools-original.json)    */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "hasdata_booking_place_getBookingPlaceDetails",
    "title": "booking_place: GET /",
    "description": "Get Booking Hotel Details\n\nFetches a single Booking.com property by its full URL for the given stay dates (`checkInDate` / `checkOutDate`) and guest composition (rooms, adults, children with ages). Returns the property identity (hotelId, title, address, coordinates), policies (free cancellation, no prepayment, child/pet stays), price, rating and review summary, photos, and the list of available room suites for the requested window. Use to enrich property listings with real-time availability and pricing, monitor a specific competitor hotel over time, validate amenities and photos before displaying venue details to end users, or fetch full details after discovering the property URL via the Booking Search endpoint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string",
          "description": "Full Booking.com URL of the property page. Only `booking.com` and `www.booking.com` hosts are accepted."
        },
        "checkInDate": {
          "type": "string",
          "description": "Check-in date in `YYYY-MM-DD` format. Must be in the future and earlier than `checkOutDate`."
        },
        "checkOutDate": {
          "type": "string",
          "description": "Check-out date in `YYYY-MM-DD` format. Must be later than `checkInDate`."
        },
        "rooms": {
          "type": "number",
          "description": "Number of rooms to book."
        },
        "adults": {
          "type": "number",
          "description": "Number of adult guests across all rooms."
        },
        "children": {
          "type": "number",
          "description": "Number of child guests across all rooms (0–10). Pass `0` if there are no children."
        },
        "childrenAges": {
          "type": "string",
          "description": "Comma-separated list of child ages, one entry per child (each `0`–`17`). Required when `children > 0` and the number of ages must equal `children`.\n\nExample: `1,3,7`\n"
        },
        "language": {
          "type": "string",
          "enum": [
            "en-us",
            "en-gb",
            "de",
            "nl",
            "fr",
            "es",
            "es-ar",
            "es-mx",
            "ca",
            "it",
            "pt-pt",
            "pt-br",
            "no",
            "fi",
            "sv",
            "da",
            "cs",
            "hu",
            "ro",
            "ja",
            "zh-cn",
            "zh-tw",
            "pl",
            "el",
            "ru",
            "tr",
            "bg",
            "ar",
            "ko",
            "he",
            "lv",
            "uk",
            "hi",
            "id",
            "ms",
            "th",
            "et",
            "hr",
            "lt",
            "sk",
            "sr",
            "sl",
            "vi",
            "tl",
            "is"
          ],
          "description": "Language of the Booking.com interface and localized fields in the response."
        },
        "currency": {
          "type": "string",
          "description": "Currency of the prices returned in the response. Use `hotelCurrency` to keep each property's native currency. Provide one exact documented value (52 allowed), e.g. `hotelCurrency`, `usd`."
        }
      },
      "required": [
        "url",
        "checkInDate",
        "checkOutDate",
        "rooms",
        "adults",
        "children"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "hasdata_booking_search_getBookingSearchResults",
    "title": "booking_search: GET /",
    "description": "Get Booking Search Results\n\nSearches Booking.com for accommodations by destination keyword and stay dates (`checkInDate` / `checkOutDate`) with guest composition (rooms, adults, children with ages) and rich filtering: property type, star rating, review score, hotel and room facilities, distance from center, reservation policy, bed preference, travel group, online payment, accessibility, plus optional price range and bedroom/bathroom counts. Pagination is page-based with 25 results per page; locale is controlled by `language` and `currency`. Returns each hotel's `hotelId`, title and Booking URL, location info (city, address, coordinates, distance to center / nearest beach), policies (free cancellation, no prepayment, child/pet stays), price (per stay, before discount, discount, currency), rating, review summary and main photo. Use to power travel-planning agents, OTA price/inventory monitoring, hotel competitor analysis, lead-generation in the hospitality vertical, or to feed `hotelId` / URL into the Booking Place endpoint for full property details.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "keyword": {
          "type": "string",
          "description": "Free-text destination query. Usually a city, region or neighborhood (e.g. `Paris`, `Manhattan, New York`); a specific property name is also accepted."
        },
        "sort": {
          "type": "string",
          "enum": [
            "ourTopPicks",
            "homesAndApartmentsFirst",
            "priceLowestFirst",
            "priceHighestFirst",
            "bestReviewedAndLowestPrice",
            "ratingHighToLow",
            "ratingLowToHigh",
            "ratingAndPrice",
            "distanceFromDowntown",
            "topReviewed"
          ],
          "description": "Sort order applied by Booking.com to the results page."
        },
        "checkInDate": {
          "type": "string",
          "description": "Check-in date in `YYYY-MM-DD` format. Must be in the future and earlier than `checkOutDate`."
        },
        "checkOutDate": {
          "type": "string",
          "description": "Check-out date in `YYYY-MM-DD` format. Must be later than `checkInDate`."
        },
        "rooms": {
          "type": "number",
          "description": "Number of rooms to book."
        },
        "adults": {
          "type": "number",
          "description": "Number of adult guests across all rooms."
        },
        "children": {
          "type": "number",
          "description": "Number of child guests across all rooms (0–10). Pass `0` if there are no children."
        },
        "childrenAges": {
          "type": "string",
          "description": "Comma-separated list of child ages, one entry per child (each `0`–`17`). Required when `children > 0` and the number of ages must equal `children`.\n\nExample: `1,3,7`\n"
        },
        "price_min_": {
          "type": "number",
          "description": "Minimum total price for the stay, in the requested `currency`. Must be `>= 10`. Required if `price[max]` is omitted."
        },
        "price_max_": {
          "type": "number",
          "description": "Maximum total price for the stay, in the requested `currency`. Must be `>= 20` and greater than `price[min]`. Required if `price[min]` is omitted."
        },
        "bedrooms": {
          "type": "number",
          "description": "Minimum number of bedrooms in the property."
        },
        "bathrooms": {
          "type": "number",
          "description": "Minimum number of bathrooms in the property."
        },
        "propertyType__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "hostels",
              "bedAndBreakfast",
              "hotels",
              "apartments",
              "resorts",
              "guesthouses",
              "homestays",
              "entireHomesAndApartments"
            ]
          },
          "description": "Filter by property type. Multiple values are combined with OR."
        },
        "rating__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "oneStar",
              "twoStars",
              "threeStars",
              "fourStars",
              "fiveStars"
            ]
          },
          "description": "Filter by official star rating. Multiple values are combined with OR."
        },
        "reviewScore__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "wonderful",
              "veryGood",
              "good",
              "pleasant"
            ]
          },
          "description": "Filter by minimum guest review score bucket. Multiple values are combined with OR."
        },
        "distanceFromCenter__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "lessThan1Km",
              "lessThan3Km",
              "lessThan5Km"
            ]
          },
          "description": "Filter by distance from the destination center. Multiple values are combined with OR."
        },
        "propertyAccessibility__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "auditoryGuidance",
              "toiletWithGrabRails",
              "visualAidsTactileSigns",
              "visualAidsBraille",
              "bathroomEmergencyCord",
              "raisedToilet",
              "loweredSink"
            ]
          },
          "description": "Filter by property-level accessibility features. Multiple values are combined with OR."
        },
        "meals__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "breakfastIncluded",
              "kitchenFacilities"
            ]
          },
          "description": "Filter by available meal plans. Multiple values are combined with OR."
        },
        "facilities__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "swimmingPool",
              "parking",
              "spa",
              "freeWifi",
              "hotTubJacuzzi",
              "airportShuttle",
              "fitnessCenter",
              "restaurant",
              "nonSmokingRooms",
              "frontDesk24Hour",
              "electricVehicleChargingStation",
              "wheelchairAccessible",
              "roomService"
            ]
          },
          "description": "Filter by property-level facilities. Multiple values are combined with OR."
        },
        "roomFacilities__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "privateBathroom",
              "balcony",
              "seaView",
              "kitchenKitchenette",
              "airConditioning",
              "bathtub",
              "hotTub",
              "view",
              "spaTub",
              "upperFloorsAccessibleByElevator",
              "microwave",
              "refrigerator",
              "coffeeMachine",
              "electricKettle",
              "heating",
              "towels",
              "toilet",
              "mountainView",
              "flatScreenTv",
              "tv",
              "coffeeTeaMaker",
              "hairdryer",
              "toiletPaper",
              "shower",
              "linens"
            ]
          },
          "description": "Filter by in-room facilities. Multiple values are combined with OR."
        },
        "roomAccessibility__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "upperFloorsAccessibleByElevator",
              "entireUnitLocatedOnGroundFloor",
              "walkInShower",
              "entireUnitWheelchairAccessible",
              "adaptedBath",
              "rollInShower",
              "showerChair",
              "emergencyCordInBathroom",
              "toiletWithGrabRails",
              "raisedToilet",
              "lowerSink"
            ]
          },
          "description": "Filter by in-room accessibility features. Multiple values are combined with OR."
        },
        "bedPreference__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "twinBeds",
              "doubleBed"
            ]
          },
          "description": "Filter by bed configuration. Multiple values are combined with OR."
        },
        "reservationPolicy__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "freeCancellation",
              "noPrepayment"
            ]
          },
          "description": "Filter by reservation flexibility. Multiple values are combined with OR."
        },
        "onlinePayment__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "acceptsOnlinePayments"
            ]
          },
          "description": "Filter by online payment options."
        },
        "travelGroup__": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "adultsOnly",
              "petFriendly"
            ]
          },
          "description": "Filter by travel-group oriented stay options. Multiple values are combined with OR."
        },
        "language": {
          "type": "string",
          "enum": [
            "en-us",
            "en-gb",
            "de",
            "nl",
            "fr",
            "es",
            "es-ar",
            "es-mx",
            "ca",
            "it",
            "pt-pt",
            "pt-br",
            "no",
            "fi",
            "sv",
            "da",
            "cs",
            "hu",
            "ro",
            "ja",
            "zh-cn",
            "zh-tw",
            "pl",
            "el",
            "ru",
            "tr",
            "bg",
            "ar",
            "ko",
            "he",
            "lv",
            "uk",
            "hi",
            "id",
            "ms",
            "th",
            "et",
            "hr",
            "lt",
            "sk",
            "sr",
            "sl",
            "vi",
            "tl",
            "is"
          ],
          "description": "Language of the Booking.com interface and localized fields in the response."
        },
        "currency": {
          "type": "string",
          "description": "Currency of the prices returned in the response. Use `hotelCurrency` to keep each property's native currency. Provide one exact documented value (52 allowed), e.g. `hotelCurrency`, `usd`."
        },
        "page": {
          "type": "number",
          "description": "Page number of the search results. Booking.com returns 25 results per page; pass `2` for results 26–50, `3` for 51–75, etc."
        }
      },
      "required": [
        "keyword",
        "checkInDate",
        "checkOutDate",
        "rooms",
        "adults",
        "children"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` is one of the captured tools. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `bookdata error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Parse a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * one is present, else the last parseable message, else
 * null when nothing parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not JSON; ignore this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding one upstream session. The
 * session is established lazily on the first forwarded
 * call and reused for the lifetime of the client (the
 * process lifetime when the client is the MCP server's
 * or a one-shot client for the CLI).
 */
export class BookdataClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).HASDATA_BOOKING_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private apiKey(): string | null {
    const raw = (this.deps.env ?? process.env).HASDATA_API_KEY;
    if (raw && raw.trim() !== "") return raw.trim();
    return null;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const key = this.apiKey();
    if (key !== null) headers["x-api-key"] = key;
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "bookdata", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // The notification response body carries nothing we need.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Pass the upstream result through verbatim.
    return result;
  }
}

/** Create a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): BookdataClient {
  return new BookdataClient(deps);
}

/** One-shot helper: a fresh client per call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new BookdataClient(deps).callTool(name, args);
}
