import OpenAI, { AzureOpenAI } from 'openai';
import { ENV } from './env';
import {
  searchInventory,
  findVehicleClassesBySemanticQuery,
  getAddOnsCatalog,
  getWaivedAddOnIds,
} from '../../lib/graph/queries';
import { resolveSynonym } from '../../lib/graph/retrievers';
import { BASE_PATH } from '../../lib/basePath';
import { callVendorSkill, isVendorTaskError } from './vendor-agent-client';
import { savePendingProposal, consumePendingProposal } from './session-store';

// Only constructed lazily (see embedVehicleClassQuery below) so an
// unconfigured embeddings deployment never breaks the rest of this file's
// (required) chat-completions client at module load.
let embeddingClient: AzureOpenAI | undefined;

// Deployment name defaults to 'text-embedding-3-small' (see env.ts) — the
// same model mastech-agentic-commerce uses for its own pgvector search.
// Until that deployment exists in the Azure portal, the call below 404s;
// caught here so an unprovisioned deployment degrades to today's
// zero-result behavior instead of throwing out of search_inventory.
async function embedVehicleClassQuery(term: string): Promise<number[] | undefined> {
  try {
    embeddingClient ??= new AzureOpenAI({
      endpoint: ENV.AZURE_OPENAI_ENDPOINT,
      apiKey: ENV.AZURE_OPENAI_API_KEY,
      apiVersion: ENV.AZURE_API_VERSION ?? '2025-01-01-preview',
      deployment: ENV.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
    });
    const res = await embeddingClient.embeddings.create({
      model: ENV.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
      input: term,
    });
    return (res as OpenAI.CreateEmbeddingResponse).data[0]?.embedding;
  } catch {
    return undefined;
  }
}

// "Hybrid" search = structured graph filter + this thesaurus fallback — no
// vector/embedding infra exists in this repo (see 09-03-PLAN.md's Context).
// Falls back to the raw term when no synonym row matches so casual phrasing
// that IS already a canonical label (e.g. the member typed "SUV" and that's
// literally the class_name) still works, and so an unresolved term degrades
// to today's exact-match behavior instead of erroring.
async function resolveTerm(label: string, canonicalProperty: string, term: string): Promise<string> {
  const matches = await resolveSynonym(term);
  const hit = matches.find((m) => m.label === label);
  return hit ? (hit.canonical[canonicalProperty] as string) : term;
}

// Per-request context resolved server-side from the /chat request (Clerk
// cookie forwarded to Next's own routes, memberId/email resolved by the
// caller of server.ts) — NEVER filled in from the model's tool-call
// arguments. Tool handlers below only ever read caller identity from here.
export interface ToolContext {
  conversationId: string;
  memberId: string;
  email: string;
  cookieHeader: string;
  // Optional sub-step reporter a handler can call to surface an
  // otherwise-invisible inner operation (e.g. propose_booking's A2A
  // check_availability hop) as its own SSE event — see chat-loop.ts's
  // vendor_step draining after each handler's single await resolves.
  onStep?: (step: { name: string; status: 'start' | 'done'; detail?: string }) => void;
}

export interface ToolResult {
  error?: string;
  [key: string]: unknown;
}

type ToolHandler = (args: any, ctx: ToolContext) => Promise<ToolResult>;

async function fetchJson(
  path: string,
  ctx: ToolContext,
  init: { method: string; body?: unknown },
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${ENV.NEXTJS_APP_URL}${BASE_PATH}${path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: ctx.cookieHeader,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function nightsBetween(from: string, to: string): number {
  return Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)));
}

// Same quote computation `POST /api/bookings` itself performs — duplicated
// here (not imported, that route has no exported quote function) so
// `propose_booking` can compute a real total before ever calling Stripe.
// Never let a model-supplied amount reach `/api/payments/intent` instead.
// Mirrors POST /api/bookings' own totalPrice computation exactly, including
// its addonIds filter (catalog membership + numeric fee_per_day + not
// waived by the member's perks) — this MUST stay byte-for-byte equivalent
// to that route's filter, since the PaymentIntent created from this total
// is later validated there via an exact expectedAmountCents match.
async function computeBookingTotal(
  inventoryId: string,
  vendorId: string,
  from: string,
  to: string,
  addonIds: string[] = [],
) {
  const results = await searchInventory();
  const match = results.find(
    (r) =>
      r.inventory.rental_id === inventoryId &&
      (r.vendor.provider ?? '').toLowerCase() === vendorId.toLowerCase(),
  );
  if (!match || !match.negotiatedTerm) return null;

  const dailyRate = (match.inventory.daily_rate as number | undefined) ?? 0;
  const nights = nightsBetween(from, to);

  const [addOnsCatalog, waivedAddOnIds] = await Promise.all([
    getAddOnsCatalog(),
    getWaivedAddOnIds(match.perks.map((p) => p.perk_id as string)),
  ]);

  // A model-supplied addonId that doesn't exist in the catalog (e.g. "gps"
  // instead of the real "gps_navigation") must NOT silently disappear from
  // the total with zero signal — that's how an extra the member was told
  // was added ends up missing from the real charge. Surfaced as an error so
  // the caller can self-correct against the real ids, mirroring the
  // existing inventoryId-mismatch self-correction contract.
  const knownAddonIds = new Set(addOnsCatalog.map((a) => a.addon_id));
  const unknownAddonIds = addonIds.filter((id) => !knownAddonIds.has(id));
  if (unknownAddonIds.length > 0) {
    return { unknownAddonIds, knownAddonIds: Array.from(knownAddonIds) };
  }

  const chargedAddonIds = addOnsCatalog
    .filter(
      (a) =>
        typeof a.fee_per_day === 'number' &&
        addonIds.includes(a.addon_id) &&
        !waivedAddOnIds.has(a.addon_id),
    )
    .map((a) => a.addon_id);
  const chargedAddons = addOnsCatalog
    .filter((a) => chargedAddonIds.includes(a.addon_id))
    .map((a) => ({ addonId: a.addon_id, name: a.name ?? a.addon_id, feePerDay: a.fee_per_day ?? 0 }));
  const lineItems = [
    { label: 'Base rate', amountCents: Math.round(dailyRate * nights * 100) },
    ...addOnsCatalog
      .filter((a) => chargedAddonIds.includes(a.addon_id))
      .map((a) => ({
        label: a.name ?? a.addon_id,
        amountCents: Math.round((a.fee_per_day ?? 0) * nights * 100),
      })),
  ];
  const addonTotal = addOnsCatalog
    .filter((a) => chargedAddonIds.includes(a.addon_id))
    .reduce((sum, a) => sum + (a.fee_per_day ?? 0) * nights, 0);

  return {
    dailyRate,
    nights,
    negotiatedTermId: match.negotiatedTerm.term_id,
    perkIds: match.perks.map((p) => p.perk_id as string),
    chargedAddonIds,
    chargedAddons,
    lineItems,
    totalPrice: dailyRate * nights + addonTotal,
    pickupCity: match.location?.city,
    vehicleMake: match.inventory.vehicle_make as string | undefined,
    vehicleModel: match.inventory.vehicle_model as string | undefined,
    vehicleClassName: match.vehicleClass.class_name as string | undefined,
    vendorRating: match.vendor.rating as number | undefined,
    // The canonical, exact-case ids from the matched graph row — never the
    // caller-supplied inventoryId/vendorId. /api/bookings' own match is
    // case-sensitive, so echoing back a model-typed vendorId (e.g. "avis"
    // instead of "Avis") here would let propose_booking succeed while the
    // later create_booking/direct-payment POST 400s with "Inventory or
    // negotiated rate not found" — this is the single source of truth both
    // sides must use.
    inventoryId: match.inventory.rental_id as string,
    vendorId: match.vendor.provider as string,
  };
}

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_inventory',
      description:
        'Search available rental inventory. Call this only after the pickup city, drop-off city, pickup/return dates, and vendor preference have been gathered from the member (see system prompt slot-filling rules) — this tool does not itself validate availability for the date range, so those slots must already be confirmed in conversation before calling. Accepts casual phrasing for vehicleClass (e.g. "SUV", "economy car") — matching resolves synonyms against the catalog automatically. When the member names a specific make/model to book (e.g. "the Toyota Corolla"), call this again with vehicleModel set to get the REAL, authoritative list of vendors carrying that exact model before disambiguating or proposing a booking — never guess or recall vendor names from an earlier, possibly-truncated result list.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Pickup city name to filter by' },
          vehicleClass: {
            type: 'string',
            description:
              'Vehicle class to filter by, e.g. "SUV", "sedan", "economy". Pass this whenever the member mentions any vehicle type/size preference.',
          },
          vehicleModel: {
            type: 'string',
            description:
              'Exact or partial make/model text (e.g. "Corolla", "Toyota Corolla") to filter by. Use this whenever the member names a specific model to book, so you see every vendor actually carrying that model instead of relying on a possibly-incomplete earlier result list.',
          },
          vendorId: {
            type: 'string',
            description: 'Exact vendor/partner name to filter by, only when the member named a specific one. Omit if they are open to any vendor.',
          },
          pickupDate: { type: 'string', description: 'ISO pickup date, gathered from the member before calling.' },
          returnDate: { type: 'string', description: 'ISO return date, gathered from the member before calling.' },
          dropoffCity: {
            type: 'string',
            description: 'Drop-off city, only if different from the pickup city — omit when the member is returning to the same location.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quote',
      description: 'Get a rate/perk quote for a specific inventory unit and vendor over a date range.',
      parameters: {
        type: 'object',
        properties: {
          inventoryId: { type: 'string' },
          vendorId: { type: 'string' },
          from: { type: 'string', description: 'ISO date' },
          to: { type: 'string', description: 'ISO date' },
        },
        required: ['inventoryId', 'vendorId', 'from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_modification',
      description: 'Preview a modification to an existing reserved booking. Does not apply the change.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          inventoryId: { type: 'string' },
          vendorId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_cancellation',
      description: 'Preview cancelling an existing reserved booking, including refund amount. Does not cancel.',
      parameters: {
        type: 'object',
        properties: { bookingId: { type: 'string' } },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_booking',
      description:
        'Quote a new booking and create a Stripe PaymentIntent for the real computed total. Returns a client_secret the member must complete payment against in the UI before create_booking can succeed. Call get_addon_catalog and ask the member about extras BEFORE calling this tool.',
      parameters: {
        type: 'object',
        properties: {
          resultRef: {
            type: 'string',
            description:
              'The resultRef field of the ONE search_inventory result row for the vehicle+vendor the member picked — copy it verbatim as a single string, never reconstruct it from separate inventoryId/vendorId fields you recall independently.',
          },
          vehicleModel: {
            type: 'string',
            description:
              'The exact make/model (e.g. "Mercedes-Benz C-Class") of the vehicle in that same row, copied from the search_inventory result. Checked server-side against what resultRef actually resolves to — if it does not match, the call fails with an error instead of silently quoting the wrong vehicle, so never guess this from memory.',
          },
          from: { type: 'string' },
          to: { type: 'string' },
          addonIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Add-on ids the member chose at booking time, from get_addon_catalog. Omit or pass [] if none.',
          },
        },
        required: ['resultRef', 'vehicleModel', 'from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_addon_catalog',
      description: 'List available add-ons/extras (name, price per day) for offering to the member before quoting a booking, or when managing extras on an existing booking.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_addons',
      description:
        'Preview adding/removing extras on an ALREADY-RESERVED existing booking (not a new booking — for that, use addonIds on propose_booking). Pass the full desired set of addon ids, not a diff. Returns the price delta and, if a charge is due, a client_secret for inline payment.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          addonIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['bookingId', 'addonIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_addons',
      description: 'Confirm and apply a previously proposed extras change on an existing booking.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          paymentIntentId: { type: 'string' },
        },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_booking',
      description:
        'Confirm and create a booking. Only succeeds if a matching propose_booking was made and the member has completed payment against its client_secret.',
      parameters: {
        type: 'object',
        properties: {
          inventoryId: { type: 'string' },
          vendorId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          paymentIntentId: { type: 'string' },
        },
        required: ['inventoryId', 'vendorId', 'from', 'to', 'paymentIntentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_booking',
      description: 'Confirm and apply a previously proposed modification.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          inventoryId: { type: 'string' },
          vendorId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          paymentIntentId: { type: 'string' },
        },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_booking',
      description: 'Confirm and apply a previously proposed cancellation.',
      parameters: {
        type: 'object',
        properties: { bookingId: { type: 'string' } },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_booking_status',
      description:
        "List the member's bookings, optionally filtered. Pass bookingId when the member names a " +
        "specific booking id. Pass pickupDate when they name a specific date they're picking up the " +
        "car (NOT the date they made the booking). Pass city when they name a pickup location. Pass " +
        'vendorId when they name a vendor, so you get back only that vendor\'s booking(s) instead of ' +
        "the member's full history.",
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          bookingId: { type: 'string', description: 'Exact booking id, when the member names one specific booking.' },
          pickupDate: {
            type: 'string',
            description:
              "The rental's pickup date (YYYY-MM-DD), when the member asks about a booking for a specific " +
              'date — not the date they made the booking.',
          },
          // Pickup city only — the only location a Booking's inventory is
          // ever tied to (Inventory -[:LOCATED_AT]-> Location). There is no
          // persisted drop-off city on a booking to filter by; drop-off city
          // is a one-way-rental quote detail (see get_quote), not a
          // filterable booking attribute.
          city: { type: 'string', description: "Pickup location/city, e.g. 'Las Vegas'." },
          vendorId: { type: 'string', description: "Vendor/rental partner name, e.g. 'Alamo'." },
          limit: {
            type: 'number',
            description:
              "Max number of bookings to return, most recent first — pass this whenever the member " +
              "asks for a specific count (e.g. 'latest 3 bookings', 'my last booking' -> limit: 1).",
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cancellation_policy',
      description: 'Look up a vendor cancellation/no-show policy.',
      parameters: {
        type: 'object',
        properties: { vendorId: { type: 'string' } },
        required: ['vendorId'],
      },
    },
  },
];

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  async search_inventory(args) {
    const [city, vehicleClass] = await Promise.all([
      args.city ? resolveTerm('Location', 'city', args.city) : Promise.resolve(undefined),
      args.vehicleClass ? resolveTerm('VehicleClass', 'class_name', args.vehicleClass) : Promise.resolve(undefined),
    ]);
    // vendorId is matched client-side (case-insensitively) rather than as an
    // exact-match graph filter — the model/member's casing of a vendor name
    // (e.g. "alamo") must not silently zero out real results against the
    // canonical "Alamo" stored in the catalog.
    let results = await searchInventory(city, vehicleClass);

    // Semantic fallback: only when the member named a class and the graph
    // synonym table AND raw-term match both produced nothing (see
    // 09-04-PLAN.md section 5) — embedVehicleClassQuery degrades silently to
    // undefined if the Azure embeddings deployment isn't provisioned yet.
    if (results.length === 0 && args.vehicleClass) {
      const embedding = await embedVehicleClassQuery(args.vehicleClass);
      if (embedding) {
        const [candidateClass] = await findVehicleClassesBySemanticQuery(embedding, 1);
        if (candidateClass) {
          results = await searchInventory(city, candidateClass);
        }
      }
    }

    if (args.vendorId) {
      const needle = String(args.vendorId).toLowerCase();
      results = results.filter((r) => (r.vendor.provider ?? '').toLowerCase() === needle);
    }

    // Narrows to a specific named make/model, across ALL vendors carrying it
    // — not just the ones that happened to survive MAX_RESULTS slicing on an
    // earlier, broader search. Case-insensitive substring match against
    // "<make> <model>" so "Corolla" or "Toyota Corolla" both work.
    if (args.vehicleModel) {
      const needle = String(args.vehicleModel).toLowerCase();
      results = results.filter((r) =>
        `${r.inventory.vehicle_make ?? ''} ${r.inventory.vehicle_model ?? ''}`.toLowerCase().includes(needle),
      );
    }

    // The full catalog can be 1000+ units — returning it all blows past the
    // model's context/rate limits for no benefit (the member never sees more
    // than a handful of options at once). Cap what's relayed back to the
    // model; totalMatches tells it there's more to narrow down.
    const MAX_RESULTS = 10;
    // resultRef is a single opaque token identifying exactly one row (its
    // inventoryId + vendorId glued together) — propose_booking takes this
    // instead of two separate fields specifically so the model has nothing
    // to mix up: it copies ONE string from ONE row, verbatim, rather than
    // independently recalling an inventoryId and a vendorId that could each
    // be typed correctly on their own yet belong to two different rows.
    const withRefs = results.slice(0, MAX_RESULTS).map((r) => ({
      ...r,
      resultRef: `${r.inventory.rental_id}::${r.vendor.provider}`,
    }));
    return {
      totalMatches: results.length,
      results: withRefs,
      pickupDate: args.pickupDate,
      returnDate: args.returnDate,
      dropoffCity: args.dropoffCity,
    };
  },

  async get_quote(args) {
    const [availability, quote] = await Promise.all([
      callVendorSkill('check_availability', {
        vendorId: args.vendorId,
        inventoryId: args.inventoryId,
        from: args.from,
        to: args.to,
      }),
      callVendorSkill('apply_modification', {
        vendorId: args.vendorId,
        inventoryId: args.inventoryId,
        from: args.from,
        to: args.to,
      }),
    ]);
    if (isVendorTaskError(quote)) return { error: quote.message };
    return { availability, quote };
  },

  async propose_modification(args, ctx) {
    const { status, body } = await fetchJson(`/api/bookings/${args.bookingId}/modify`, ctx, {
      method: 'POST',
      body: { ...args, bookingId: undefined, dryRun: true },
    });
    if (status !== 200) return { error: body.error ?? `Modify preview failed (${status})` };

    await savePendingProposal(ctx.conversationId, 'modify_booking', args);
    return body;
  },

  async propose_cancellation(args, ctx) {
    const { status, body } = await fetchJson(`/api/bookings/${args.bookingId}/cancel`, ctx, {
      method: 'POST',
      body: { dryRun: true },
    });
    if (status !== 200) return { error: body.error ?? `Cancellation preview failed (${status})` };

    await savePendingProposal(ctx.conversationId, 'cancel_booking', args);
    return body;
  },

  async propose_booking(args, ctx) {
    const resultRef = String(args.resultRef ?? '');
    const sepIndex = resultRef.indexOf('::');
    if (sepIndex === -1) {
      return {
        error:
          `resultRef "${args.resultRef}" is not a valid search_inventory resultRef (expected "inventoryId::vendorId"). ` +
          'Copy the resultRef field verbatim from a search_inventory result row — do not construct it yourself.',
      };
    }
    const inventoryId = resultRef.slice(0, sepIndex);
    const vendorId = resultRef.slice(sepIndex + 2);

    const totals = await computeBookingTotal(inventoryId, vendorId, args.from, args.to, args.addonIds ?? []);
    if (!totals) {
      return {
        error:
          `No inventory row matches resultRef "${args.resultRef}". ` +
          'Call search_inventory again with vehicleModel and vendorId set to get that vendor\'s exact current row, ' +
          'then retry propose_booking using that row\'s resultRef.',
      };
    }
    if ('unknownAddonIds' in totals) {
      return {
        error:
          `addonIds ${JSON.stringify(totals.unknownAddonIds)} do not exist in the addon catalog — you likely ` +
          'abbreviated or guessed an id instead of copying it verbatim. The real ids are: ' +
          `${JSON.stringify(totals.knownAddonIds)}. Retry propose_booking with the correct id(s) copied ` +
          'character-for-character from the get_addon_catalog result.',
      };
    }

    // resultRef makes cross-row mixing structurally impossible, but the
    // model could still copy a STALE resultRef (from an earlier search,
    // before the vendor was resolved, or from the wrong card entirely) or
    // hallucinate one — vehicleModel is a second, independent statement of
    // intent checked against what that resultRef actually resolves to now,
    // catching that remaining case instead of silently quoting the wrong car.
    const resolvedVehicle = [totals.vehicleMake, totals.vehicleModel].filter(Boolean).join(' ').toLowerCase();
    const claimedVehicle = (args.vehicleModel as string).toLowerCase();
    if (resolvedVehicle && !resolvedVehicle.includes(claimedVehicle) && !claimedVehicle.includes(resolvedVehicle)) {
      return {
        error:
          `Mismatch: resultRef "${args.resultRef}" resolves to ` +
          `"${[totals.vehicleMake, totals.vehicleModel].filter(Boolean).join(' ')}", not "${args.vehicleModel}". ` +
          'Call search_inventory again with vehicleModel set to the vehicle the member actually asked for, ' +
          'then retry propose_booking using that result\'s exact resultRef.',
      };
    }

    // A2A gate: ask the Vendor Agent for a live per-date-range availability
    // check before ever quoting/charging — the traditional /checkout path
    // intentionally skips this (it only queries the graph directly), but the
    // conversational flow is the one place a real vendor-side check belongs.
    ctx.onStep?.({ name: 'check_availability', status: 'start' });
    const availability = await callVendorSkill<{ available: boolean }>('check_availability', {
      inventoryId: totals.inventoryId,
      from: args.from,
      to: args.to,
    });
    if (isVendorTaskError(availability)) {
      ctx.onStep?.({ name: 'check_availability', status: 'done', detail: `error: ${availability.message}` });
      return { error: `Vendor availability check failed: ${availability.message}` };
    }
    if (!availability.available) {
      ctx.onStep?.({ name: 'check_availability', status: 'done', detail: 'unavailable' });
      return {
        error:
          `${totals.vendorId} reports this vehicle is not available for ${args.from} to ${args.to} — ` +
          'try different dates or another vendor.',
      };
    }
    ctx.onStep?.({ name: 'check_availability', status: 'done', detail: 'available' });

    const { status, body } = await fetchJson('/api/payments/intent', ctx, {
      method: 'POST',
      body: {
        amount: totals.totalPrice,
        currency: 'usd',
        receiptEmail: ctx.email,
        description: `Rental booking ${totals.inventoryId}`,
      },
    });
    if (status !== 200) return { error: body.error ?? `PaymentIntent creation failed (${status})` };

    await savePendingProposal(ctx.conversationId, 'create_booking', {
      inventoryId: totals.inventoryId,
      vendorId: totals.vendorId,
      from: args.from,
      to: args.to,
      addonIds: totals.chargedAddonIds,
      paymentIntentId: body.paymentIntentId,
    });

    return {
      inventoryId: totals.inventoryId,
      vendorId: totals.vendorId,
      vendorRating: totals.vendorRating,
      vehicleMake: totals.vehicleMake,
      vehicleModel: totals.vehicleModel,
      vehicleClassName: totals.vehicleClassName,
      from: args.from,
      to: args.to,
      chargedAddonIds: totals.chargedAddonIds,
      chargedAddons: totals.chargedAddons,
      lineItems: totals.lineItems,
      pickup: { city: totals.pickupCity, date: args.from },
      dropoff: { city: args.dropoffCity ?? totals.pickupCity, date: args.to },
      totalPrice: totals.totalPrice,
      paymentIntentId: body.paymentIntentId,
      clientSecret: body.clientSecret,
      note: 'create_booking cannot succeed until the member completes payment in the UI against this client_secret.',
    };
  },

  async create_booking(args, ctx) {
    // Match on the opaque paymentIntentId alone, not full arg equality — a
    // model re-issuing this call can drift on incidental fields (see
    // modify_booking's comment below), but it reliably copies an opaque
    // token verbatim. Once matched, execute using the ORIGINALLY proposed
    // args (not the model's restated ones) so the mutation always reflects
    // exactly what was quoted, never a model-drifted re-statement.
    const matched = await consumePendingProposal(ctx.conversationId, 'create_booking', {
      paymentIntentId: args.paymentIntentId,
    });
    if (!matched) {
      return { error: 'No matching pending booking proposal found (missing, already used, or expired). Call propose_booking again.' };
    }

    const { status, body } = await fetchJson('/api/bookings', ctx, {
      method: 'POST',
      body: matched.pendingProposal!.args,
    });
    if (status !== 201) return { error: body.error ?? `Booking creation failed (${status})` };
    return { booking: body };
  },

  async modify_booking(args, ctx) {
    // Match on bookingId identity alone, not full arg equality — a session
    // only ever holds one pendingProposal at a time, so this is unambiguous,
    // and it tolerates the model restating/inventing incidental fields
    // (e.g. echoing a `from` it read from an earlier tool result but that
    // was never part of the actual propose_modification call) when
    // confirming. Once matched, execute using the ORIGINALLY proposed diff
    // (matched.pendingProposal.args), not the model's restated args.
    const matched = await consumePendingProposal(ctx.conversationId, 'modify_booking', {
      bookingId: args.bookingId,
    });
    if (!matched) {
      return { error: 'No matching pending modification proposal found (missing, already used, or expired). Call propose_modification again.' };
    }

    const proposedArgs = matched.pendingProposal!.args as Record<string, unknown>;
    const { status, body } = await fetchJson(`/api/bookings/${args.bookingId}/modify`, ctx, {
      method: 'POST',
      body: { ...proposedArgs, bookingId: undefined, paymentIntentId: args.paymentIntentId },
    });
    if (status !== 200) return { error: body.error ?? `Modification failed (${status})` };
    return { modification: body };
  },

  async cancel_booking(args, ctx) {
    const matched = await consumePendingProposal(ctx.conversationId, 'cancel_booking', {
      bookingId: args.bookingId,
    });
    if (!matched) {
      return { error: 'No matching pending cancellation proposal found (missing, already used, or expired). Call propose_cancellation again.' };
    }

    const { status, body } = await fetchJson(`/api/bookings/${args.bookingId}/cancel`, ctx, {
      method: 'POST',
      body: {},
    });
    if (status !== 200) return { error: body.error ?? `Cancellation failed (${status})` };
    return { cancellation: body };
  },

  async get_booking_status(args, ctx) {
    // All filters (status/bookingId/pickupDate/city/vendorId) are real
    // query params on /api/bookings — resolved server-side against Mongo
    // (and, for city, the graph) instead of fetching the member's entire
    // booking history and filtering it here. bookingId/city/pickupDate
    // matter most for this: a specific-id or specific-location lookup
    // should never leak the rest of the member's bookings back to the model.
    const params = new URLSearchParams();
    if (typeof args.status === 'string') params.set('status', args.status);
    if (typeof args.bookingId === 'string') params.set('bookingId', args.bookingId);
    if (typeof args.pickupDate === 'string') params.set('pickupDate', args.pickupDate);
    if (typeof args.city === 'string') params.set('city', args.city);
    if (typeof args.vendorId === 'string') params.set('vendorId', args.vendorId);
    const query = params.toString();

    const { status, body } = await fetchJson(`/api/bookings${query ? `?${query}` : ''}`, ctx, {
      method: 'GET',
    });
    if (status !== 200) return { error: `Failed to fetch bookings (${status})` };
    const bookings = Array.isArray(body) ? body : [];

    if (bookings.length === 0) {
      if (typeof args.vendorId === 'string') {
        // Named vendor with no exact match is treated as a possible
        // near-miss worth showing alternatives for — fall back to the
        // full (unfiltered) history rather than a bare empty list.
        const { status: allStatus, body: allBody } = await fetchJson('/api/bookings', ctx, { method: 'GET' });
        const all = allStatus === 200 && Array.isArray(allBody) ? allBody : [];
        return { bookings: all, note: `No bookings matched vendorId "${args.vendorId}" — returning full list instead.` };
      }
      // A named bookingId/city/pickupDate that matches nothing means "not
      // found" — never dump the member's unrelated booking history back
      // for a query that named one specific target.
      if (typeof args.bookingId === 'string') {
        return { bookings: [], note: `No booking found matching bookingId "${args.bookingId}".` };
      }
      if (typeof args.city === 'string') {
        return { bookings: [], note: `No bookings found in "${args.city}".` };
      }
      if (typeof args.pickupDate === 'string') {
        return { bookings: [], note: `No bookings found with a pickup date of "${args.pickupDate}".` };
      }
    }

    // /api/bookings now sorts by createdAt desc, so slicing here gives
    // correct "latest N" semantics (most recently created, not soonest pickup).
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : undefined;
    return { bookings: limit ? bookings.slice(0, limit) : bookings };
  },

  async get_cancellation_policy(args) {
    const policy = await callVendorSkill('get_vendor_policy', { vendorId: args.vendorId });
    if (isVendorTaskError(policy)) return { error: policy.message };
    return { policy };
  },

  async get_addon_catalog() {
    const addOns = await getAddOnsCatalog();
    return {
      addOns: addOns.map((a) => ({ addonId: a.addon_id, name: a.name, feePerDay: a.fee_per_day })),
    };
  },

  // Booking lookup is resolve-only — the real pricing/waiver recompute
  // happens server-side in the addons route itself, off the DB's current
  // pricingSnapshot, never off anything this tool forwards.
  async propose_addons(args, ctx) {
    const { status: listStatus, body: listBody } = await fetchJson('/api/bookings', ctx, { method: 'GET' });
    if (listStatus !== 200) return { error: `Failed to fetch bookings (${listStatus})` };
    const bookings = Array.isArray(listBody) ? listBody : [];
    const booking = bookings.find((b: any) => String(b._id) === args.bookingId);
    if (!booking) return { error: 'Booking not found' };

    const { status, body } = await fetchJson(`/api/bookings/${args.bookingId}/addons`, ctx, {
      method: 'POST',
      body: { addonIds: args.addonIds, dryRun: true },
    });
    if (status !== 200) {
      const hint = Array.isArray(body.knownAddonIds)
        ? ` Retry with the correct id(s) copied character-for-character from get_addon_catalog: ${JSON.stringify(body.knownAddonIds)}.`
        : '';
      return { error: (body.error ?? `Addons preview failed (${status})`) + hint };
    }

    let clientSecret: string | undefined;
    let paymentIntentId: string | undefined;
    if (typeof body.deltaCents === 'number' && body.deltaCents > 0) {
      const intent = await fetchJson('/api/payments/intent', ctx, {
        method: 'POST',
        body: {
          // deltaCents is in CENTS; /api/payments/intent's `amount` is in
          // DOLLARS (it does Math.floor(amount * 100) internally) — dividing
          // here is required, or the PaymentIntent is created for 100x the
          // intended charge.
          amount: body.deltaCents / 100,
          currency: 'usd',
          receiptEmail: ctx.email,
          description: `Add-ons update for booking ${args.bookingId}`,
        },
      });
      if (intent.status !== 200) return { error: intent.body.error ?? `PaymentIntent creation failed (${intent.status})` };
      clientSecret = intent.body.clientSecret;
      paymentIntentId = intent.body.paymentIntentId;
    }

    await savePendingProposal(ctx.conversationId, 'update_addons', {
      bookingId: args.bookingId,
      addonIds: args.addonIds,
      paymentIntentId,
    });

    // Resolved here (not left for the model to recite) so the chat UI can
    // render the selected extras as a compact card — name + fee — instead of
    // the model retyping them, mirroring how search_inventory results are
    // already card-rendered rather than described in text.
    const catalog = await getAddOnsCatalog();
    const selectedAddOns = (args.addonIds as string[] | undefined ?? [])
      .map((id) => catalog.find((a) => a.addon_id === id))
      .filter((a): a is (typeof catalog)[number] => Boolean(a))
      .map((a) => ({
        addonId: a.addon_id,
        name: a.name ?? a.addon_id,
        feePerDay: a.fee_per_day,
        charged: (body.chargedAddonIds ?? []).includes(a.addon_id),
      }));

    return {
      bookingId: args.bookingId,
      deltaCents: body.deltaCents,
      newTotalPrice: body.newTotalPrice,
      chargedAddonIds: body.chargedAddonIds,
      selectedAddOns,
      paymentIntentId,
      clientSecret,
    };
  },

  async update_addons(args, ctx) {
    const matched = await consumePendingProposal(ctx.conversationId, 'update_addons', {
      bookingId: args.bookingId,
    });
    if (!matched) {
      return { error: 'No matching pending addons proposal found (missing, already used, or expired). Call propose_addons again.' };
    }

    const proposedArgs = matched.pendingProposal!.args as Record<string, unknown>;
    const { status, body } = await fetchJson(`/api/bookings/${args.bookingId}/addons`, ctx, {
      method: 'POST',
      body: { addonIds: proposedArgs.addonIds, paymentIntentId: proposedArgs.paymentIntentId ?? args.paymentIntentId },
    });
    if (status !== 200) return { error: body.error ?? `Addons update failed (${status})` };
    return { addons: body };
  },
};
