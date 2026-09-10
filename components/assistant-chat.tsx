'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import ReactMarkdown from 'react-markdown';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VehicleCard, CardImage } from '@/components/vehicle-card';
import { AssistantPayment } from '@/components/assistant-payment';
import type { InventorySearchResult } from '@/lib/graph/queries';

const ASSISTANT_URL =
  process.env.NEXT_PUBLIC_CUSTOMER_ASSISTANT_URL ?? 'http://localhost:4200';

type ChatRole = 'user' | 'assistant';

interface ToolEvent {
  name: string;
  kind: 'call' | 'result';
  isError?: boolean;
}

interface VendorStep {
  name: string;
  status: 'start' | 'done';
  detail?: string;
}

interface ProposalCard {
  toolName: string;
  result: Record<string, unknown>;
}

interface AddOnCatalogEntry {
  addonId: string;
  name: string;
  feePerDay?: number;
}

interface SelectedAddOnEntry extends AddOnCatalogEntry {
  charged: boolean;
}

interface BookingRecord {
  _id: string;
  vendorId?: string;
  inventoryId?: string;
  from?: string;
  to?: string;
  status?: string;
  pricingSnapshot?: { totalPrice?: number };
  [key: string]: unknown;
}

interface ConfirmedBooking {
  bookingId: string;
  proposal: Record<string, unknown>;
}

interface ConfirmedModification {
  bookingId: string;
  deltaCents: number;
  refundAmountCents?: number;
  totalPrice?: number;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  toolEvents: ToolEvent[];
  proposal?: ProposalCard;
  searchResults?: InventorySearchResult[];
  bookings?: BookingRecord[];
  addOnCatalog?: AddOnCatalogEntry[];
  pickupDate?: string;
  returnDate?: string;
  dropoffCity?: string;
  bookingDone?: boolean;
  vendorStep?: VendorStep;
  addonCatalogShown?: boolean;
  confirmedBooking?: ConfirmedBooking;
  confirmedModification?: ConfirmedModification;
  modificationConfirming?: boolean;
  modificationConfirmError?: string | null;
  // The synthetic "Payment completed, booking X confirmed" round-trip exists
  // only to tell the model (and session history) the booking is done — the
  // BookingConfirmationCard already shows the member everything it would
  // say, so that exchange is kept out of the rendered transcript.
  hidden?: boolean;
}

interface AssistantChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// A tool_result is a confirmable proposal when it comes from a propose_* tool
// and didn't error — the panel must never auto-confirm from model text alone (AC-3).
function asProposal(name: string, result: Record<string, unknown>): ProposalCard | undefined {
  if (!name.startsWith('propose_') || 'error' in result) return undefined;
  return { toolName: name, result };
}

// search_inventory's results render as visual cards instead of the plain
// "Checking:/Done:" indicator line, so the model's prose (per SYSTEM_PROMPT)
// doesn't need to restate rates/specs already shown here. The strip is
// horizontally scrollable, so this only needs to cap runaway payloads, not
// artificially hide real matches — match the backend's own MAX_RESULTS
// (agent-service/customer-assistant/tools.ts) so every match the model can
// see is also one the member can scroll to.
const MAX_VISIBLE_CARDS = 10;

function asSearchResults(name: string, result: Record<string, unknown>): InventorySearchResult[] | undefined {
  if (name !== 'search_inventory' || 'error' in result || !Array.isArray(result.results)) return undefined;
  return (result.results as InventorySearchResult[]).slice(0, MAX_VISIBLE_CARDS);
}

function asAddonCatalog(name: string, result: Record<string, unknown>): AddOnCatalogEntry[] | undefined {
  if (name !== 'get_addon_catalog' || 'error' in result || !Array.isArray(result.addOns)) return undefined;
  return (result.addOns as { addonId: string; name: string; feePerDay?: number }[]).map((a) => ({
    addonId: a.addonId,
    name: a.name,
    feePerDay: a.feePerDay,
  }));
}

function asBookingList(name: string, result: Record<string, unknown>): BookingRecord[] | undefined {
  if (name !== 'get_booking_status' || 'error' in result || !Array.isArray(result.bookings)) return undefined;
  return result.bookings as BookingRecord[];
}

// Mirrors mastech-agentic-commerce's SearchModal.tsx pattern: one generic,
// non-collapsible in-flight line for ALL tool calls (no per-tool friendly
// label mapping) — cleared once the message is no longer mid-turn. The A2A
// vendor-availability check gets its own distinct VendorCheckCard instead
// (see below), matching commerce's dedicated SubstitutionTraceCard treatment
// for a cross-agent reasoning boundary.
// The model's own reply text can contain markdown (bold vendor names, a
// short list) — render it instead of showing literal "**"/"1." characters.
// Restricted to a plain-text-ish element set (no headings/images/tables) so
// a reply still reads as one short chat message, not a formatted document.
function AssistantText({ text }: { text: string }) {
  return (
    <div className="space-y-1 [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold">
      <ReactMarkdown
        allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br', 'code']}
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function InFlightStatusLine({ isError }: { isError?: boolean }) {
  if (isError) {
    return <p className="mt-1 text-xs text-muted-foreground italic">Couldn&apos;t complete that — retrying…</p>;
  }
  return <p className="mt-1 text-xs text-muted-foreground italic">Thinking…</p>;
}

// Cross-agent reasoning boundary — the customer assistant asking the Vendor
// Agent (a separate A2A service) for a live per-date-range availability
// check before ever quoting/charging. Styled like commerce's
// SubstitutionTraceCard (dashed border) so this one specific hop reads as
// visually distinct from ordinary in-app tool calls.
function VendorCheckCard({ step }: { step: VendorStep }) {
  const detailText =
    step.status === 'start'
      ? 'Checking live availability with the Vendor Agent…'
      : step.detail === 'available'
        ? 'Vendor Agent confirmed this vehicle is available.'
        : step.detail === 'unavailable'
          ? 'Vendor Agent reports this vehicle is not available for these dates.'
          : `Vendor Agent check failed${step.detail ? `: ${step.detail.replace(/^error:\s*/, '')}` : ''}.`;

  return (
    <div className="mt-2 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-2 text-xs">
      <div className="font-medium text-amber-700">Vendor Agent</div>
      <div className="mt-0.5 text-amber-700/80">{detailText}</div>
    </div>
  );
}

function nightsBetween(from?: string, to?: string): number {
  if (!from || !to) return 3;
  const n = Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// Compact cards in the chat strip — real dates threaded through when known,
// no "Choose this car" button (picking a car is a typed intent, per plan).
function VehicleResultStrip({
  results,
  pickupDate,
  returnDate,
}: {
  results: InventorySearchResult[];
  pickupDate?: string;
  returnDate?: string;
}) {
  const nights = nightsBetween(pickupDate, returnDate);
  return (
    <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
      {results.map((r) => (
        <div key={`${r.inventory.rental_id}-${r.vendor.provider}`} className="assistant-vehicle-card w-[240px] shrink-0">
          <VehicleCard result={r} nights={nights} pickupDate={pickupDate} returnDate={returnDate} compact />
        </div>
      ))}
    </div>
  );
}

// Compact extras catalog, mirroring VehicleResultStrip — the member picks by
// typing the extra's name (no buttons, per the two-step propose/confirm-by-text
// contract), so this is display-only.
function AddonCatalogStrip({ addOns }: { addOns: AddOnCatalogEntry[] }) {
  if (addOns.length === 0) return null;
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {addOns.map((a) => (
        <div
          key={a.addonId}
          className="w-[150px] shrink-0 rounded-lg border border-border bg-card p-2 text-sm"
        >
          <div className="font-medium">{a.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {typeof a.feePerDay === 'number' && a.feePerDay > 0 ? `$${a.feePerDay.toFixed(2)}/day` : 'Included'}
          </div>
        </div>
      ))}
    </div>
  );
}

// Shows which extras a propose_addons preview actually selected/charged —
// the model's text must not recite this (per SYSTEM_PROMPT), so it needs to
// live somewhere; a compact chip row here instead of a text sentence.
function SelectedAddonsStrip({ addOns }: { addOns: SelectedAddOnEntry[] }) {
  if (addOns.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {addOns.map((a) => (
        <span
          key={a.addonId}
          className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground"
        >
          {a.name}
          {a.charged && typeof a.feePerDay === 'number' && a.feePerDay > 0 ? ` · $${a.feePerDay.toFixed(2)}/day` : ''}
          {!a.charged ? ' · included' : ''}
        </span>
      ))}
    </div>
  );
}

// Plain-text one-liner used for everything except propose_booking (which
// gets the richer BookingSummaryCard below) — no raw JSON dump, no buttons.
// Confirming/cancelling is a typed reply, per the SYSTEM_PROMPT's two-step contract.
function ProposalOneLiner({ result }: { result: Record<string, unknown> }) {
  const totalPrice = (result.totalPrice ?? result.newTotalPrice) as number | undefined;
  const refundAmountCents = result.refundAmountCents as number | undefined;
  const refundPercent = result.refundPercent as number | undefined;
  const deltaCents = result.deltaCents as number | undefined;
  const from = result.from as string | undefined;
  const to = result.to as string | undefined;

  const parts: string[] = [];
  if (typeof deltaCents === 'number') {
    parts.push(deltaCents > 0 ? `Additional charge: $${(deltaCents / 100).toFixed(2)}` : 'No additional charge');
  }
  if (typeof totalPrice === 'number') parts.push(`Total: $${totalPrice.toFixed(2)}`);
  if (typeof refundAmountCents === 'number') parts.push(`Refund: $${(refundAmountCents / 100).toFixed(2)}`);
  else if (typeof refundPercent === 'number') parts.push(`Refund: ${refundPercent}%`);
  if (from && to) parts.push(`${new Date(from).toLocaleDateString()} – ${new Date(to).toLocaleDateString()}`);

  return (
    <p className="text-sm text-muted-foreground">
      {parts.length > 0 ? parts.join(' · ') : 'Preview ready.'} Reply &quot;yes&quot; to confirm, or say what
      you&apos;d like changed.
    </p>
  );
}

// One unified, "beautified" card for a propose_booking preview — vehicle
// image + spec header, itemized billing (base rate + named extras), total,
// and pickup/drop-off all in a single card, instead of the vehicle
// card/extras strip/totals-card stack this used to render across separate
// message blocks.
function BookingSummaryCard({ result }: { result: Record<string, unknown> }) {
  const lineItems = (result.lineItems as { label: string; amountCents: number }[] | undefined) ?? [];
  const totalPrice = result.totalPrice as number | undefined;
  const pickup = result.pickup as { city?: string; date?: string } | undefined;
  const dropoff = result.dropoff as { city?: string; date?: string } | undefined;
  const vehicleMake = result.vehicleMake as string | undefined;
  const vehicleModel = result.vehicleModel as string | undefined;
  const vehicleClassName = (result.vehicleClassName as string | undefined) ?? 'Vehicle';
  const vendorId = result.vendorId as string | undefined;
  const vendorRating = result.vendorRating as number | undefined;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card text-sm">
      <div className="flex gap-3 p-3 pb-2">
        <CardImage className={vehicleClassName} make={vehicleMake} model={vehicleModel} compact />
        <div className="min-w-0">
          <div className="truncate font-medium">
            {vehicleMake && vehicleModel ? `${vehicleMake} ${vehicleModel}` : vehicleClassName}
          </div>
          <div className="text-xs text-muted-foreground">{vehicleClassName}</div>
          {vendorId && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {vendorId}
              {typeof vendorRating === 'number' ? ` · ★ ${vendorRating.toFixed(1)}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1 border-t border-border p-3 pt-2">
        {lineItems.map((item, i) => (
          <div key={i} className="flex justify-between text-muted-foreground">
            <span>{item.label}</span>
            <span>${(item.amountCents / 100).toFixed(2)}</span>
          </div>
        ))}
      </div>
      {typeof totalPrice === 'number' && (
        <div className="mx-3 flex justify-between border-t border-border pt-1 font-semibold">
          <span>Total</span>
          <span>${totalPrice.toFixed(2)}</span>
        </div>
      )}
      {(pickup?.city || dropoff?.city) && (
        <div className="mx-3 mt-2 space-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
          {pickup?.city && (
            <div>
              Pickup: {pickup.city}{pickup.date ? ` · ${new Date(pickup.date).toLocaleDateString()}` : ''}
            </div>
          )}
          {dropoff?.city && (
            <div>
              Drop-off: {dropoff.city}{dropoff.date ? ` · ${new Date(dropoff.date).toLocaleDateString()}` : ''}
            </div>
          )}
        </div>
      )}
      <p className="p-3 pt-2 text-xs text-muted-foreground">
        Reply &quot;yes&quot; to confirm, or say what you&apos;d like changed.
      </p>
    </div>
  );
}

// Minimum-age and license/payment requirements are universal rental-industry
// norms (not vendor-specific data the backend returns), so they're rendered
// as a static checklist rather than fetched — the one dynamic line
// (drop-off) is filled in from the same proposal snapshot as the rest of
// the card so it doesn't drift from what was actually booked.
function PickupChecklist({ dropoff }: { dropoff?: { city?: string; date?: string } }) {
  const items = [
    'Valid driver’s license (physical, not expired)',
    'The credit/debit card used for payment, in the renter’s name',
    'This confirmation number, printed or on your phone',
    'Driver must meet the vendor’s minimum age requirement (typically 21+, surcharge under 25)',
    'Inspect the vehicle with the vendor and note any existing damage before driving off',
  ];
  if (dropoff?.city) {
    items.push(
      `Return to ${dropoff.city}${dropoff.date ? ` by ${new Date(dropoff.date).toLocaleDateString()}` : ''} with a full tank (unless prepaid fuel was added)`,
    );
  }
  return (
    <div className="border-t border-border p-3 pt-2">
      <div className="text-xs font-medium">Bring to pickup</div>
      <ul className="mt-1.5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden>☐</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Rendered once payment succeeds, replacing the (now-paid) BookingSummaryCard
// with a persistent confirmation the member can scroll back to — same
// vehicle/pricing snapshot as the proposal, plus the real bookingId and the
// pickup checklist.
function BookingConfirmationCard({ booking }: { booking: ConfirmedBooking }) {
  const result = booking.proposal;
  const lineItems = (result.lineItems as { label: string; amountCents: number }[] | undefined) ?? [];
  const totalPrice = result.totalPrice as number | undefined;
  const pickup = result.pickup as { city?: string; date?: string } | undefined;
  const dropoff = result.dropoff as { city?: string; date?: string } | undefined;
  const vehicleMake = result.vehicleMake as string | undefined;
  const vehicleModel = result.vehicleModel as string | undefined;
  const vehicleClassName = (result.vehicleClassName as string | undefined) ?? 'Vehicle';
  const vendorId = result.vendorId as string | undefined;
  const vendorRating = result.vendorRating as number | undefined;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-green-300 bg-card text-sm">
      <div className="flex items-center gap-2 bg-green-50 px-3 py-2 text-green-700">
        <span aria-hidden>✓</span>
        <span className="font-medium">Booking confirmed</span>
      </div>

      <div className="flex gap-3 p-3 pb-2">
        <CardImage className={vehicleClassName} make={vehicleMake} model={vehicleModel} compact />
        <div className="min-w-0">
          <div className="truncate font-medium">
            {vehicleMake && vehicleModel ? `${vehicleMake} ${vehicleModel}` : vehicleClassName}
          </div>
          <div className="text-xs text-muted-foreground">{vehicleClassName}</div>
          {vendorId && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {vendorId}
              {typeof vendorRating === 'number' ? ` · ★ ${vendorRating.toFixed(1)}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="mx-3 border-t border-border pt-2 text-xs text-muted-foreground">
        Confirmation #{booking.bookingId}
      </div>

      {(pickup?.city || dropoff?.city) && (
        <div className="mx-3 mt-2 space-y-0.5 text-xs text-muted-foreground">
          {pickup?.city && (
            <div>
              Pickup: {pickup.city}{pickup.date ? ` · ${new Date(pickup.date).toLocaleDateString()}` : ''}
            </div>
          )}
          {dropoff?.city && (
            <div>
              Drop-off: {dropoff.city}{dropoff.date ? ` · ${new Date(dropoff.date).toLocaleDateString()}` : ''}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1 border-t border-border p-3 pt-2">
        {lineItems.map((item, i) => (
          <div key={i} className="flex justify-between text-muted-foreground">
            <span>{item.label}</span>
            <span>${(item.amountCents / 100).toFixed(2)}</span>
          </div>
        ))}
      </div>
      {typeof totalPrice === 'number' && (
        <div className="mx-3 flex justify-between border-t border-border pt-1 font-semibold">
          <span>Total charged</span>
          <span>${totalPrice.toFixed(2)}</span>
        </div>
      )}

      <PickupChecklist dropoff={dropoff} />
    </div>
  );
}

// A modification preview has exactly three outcomes, each needing a
// distinct confirmation path (no additional charge/refund never needs
// payment): a charge needs the same Stripe form as a fresh booking, a
// refund/no-op needs a plain "Confirm" button that applies immediately and
// reports success or failure, and either way the member sees the delta
// spelled out before touching anything.
function ModificationSummaryCard({
  result,
  onConfirmNoCharge,
  confirming,
  confirmError,
}: {
  result: Record<string, unknown>;
  onConfirmNoCharge: () => void;
  confirming: boolean;
  confirmError: string | null;
}) {
  const deltaCents = (result.deltaCents as number | undefined) ?? 0;
  const newTotalPrice = result.newTotalPrice as number | undefined;
  const from = result.from as string | undefined;
  const to = result.to as string | undefined;
  const hasCharge = deltaCents > 0;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card p-3 text-sm">
      <div className="font-medium">Booking modification</div>
      {from && to && (
        <div className="mt-0.5 text-xs text-muted-foreground">
          {new Date(from).toLocaleDateString()} – {new Date(to).toLocaleDateString()}
        </div>
      )}
      <div className="mt-2 flex justify-between border-t border-border pt-2">
        <span className="text-muted-foreground">
          {hasCharge ? 'Additional charge' : deltaCents < 0 ? 'Refund' : 'Price change'}
        </span>
        <span className="font-medium">
          {hasCharge
            ? `$${(deltaCents / 100).toFixed(2)}`
            : deltaCents < 0
              ? `$${(-deltaCents / 100).toFixed(2)}`
              : 'None'}
        </span>
      </div>
      {typeof newTotalPrice === 'number' && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>New total</span>
          <span>${newTotalPrice.toFixed(2)}</span>
        </div>
      )}
      {!hasCharge && (
        <div className="mt-2 border-t border-border pt-2">
          <Button size="sm" onClick={onConfirmNoCharge} disabled={confirming}>
            {confirming ? 'Confirming…' : deltaCents < 0 ? 'Confirm and refund' : 'Confirm modification'}
          </Button>
          {confirmError && <p className="mt-1 text-xs text-destructive">{confirmError}</p>}
        </div>
      )}
    </div>
  );
}

function ModificationConfirmedCard({ modification }: { modification: ConfirmedModification }) {
  const { deltaCents, refundAmountCents, totalPrice } = modification;
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-green-300 bg-card p-3 text-sm">
      <div className="flex items-center gap-2 text-green-700">
        <span aria-hidden>✓</span>
        <span className="font-medium">Modification confirmed</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {typeof refundAmountCents === 'number' && refundAmountCents > 0
          ? `Refunded $${(refundAmountCents / 100).toFixed(2)}.`
          : deltaCents > 0
            ? 'Additional charge collected.'
            : 'No additional charge.'}
        {typeof totalPrice === 'number' ? ` New total: $${totalPrice.toFixed(2)}.` : ''}
      </div>
    </div>
  );
}

function ProposalSummary({ toolName, result }: { toolName: string; result: Record<string, unknown> }) {
  if (toolName === 'propose_booking') return <BookingSummaryCard result={result} />;
  if (toolName === 'propose_addons') {
    const selected = (result.selectedAddOns as SelectedAddOnEntry[] | undefined) ?? [];
    return (
      <>
        <ProposalOneLiner result={result} />
        <SelectedAddonsStrip addOns={selected} />
      </>
    );
  }
  return <ProposalOneLiner result={result} />;
}

// Compact list rendering for get_booking_status results.
function BookingListCard({ bookings }: { bookings: BookingRecord[] }) {
  if (bookings.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No bookings found.</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      {bookings.map((b) => (
        <div key={b._id} className="rounded-lg border border-border bg-card p-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{b.vendorId ?? 'Booking'}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize text-muted-foreground">
              {b.status ?? 'unknown'}
            </span>
          </div>
          <div className="mt-0.5 flex justify-between text-xs text-muted-foreground">
            <span>
              {b.from && b.to
                ? `${new Date(b.from).toLocaleDateString()} – ${new Date(b.to).toLocaleDateString()}`
                : ''}
            </span>
            {typeof b.pricingSnapshot?.totalPrice === 'number' && (
              <span>${b.pricingSnapshot.totalPrice.toFixed(2)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssistantChat({ open, onOpenChange }: AssistantChatProps) {
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const conversationIdRef = useRef<string>(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Streamed tokens/tool events grow the newest message's height in place,
  // so a plain "scroll on new message" effect would miss most of the growth —
  // scroll on every render instead, which is cheap (a no-op once already at bottom).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function sendTurn(text: string, opts?: { silent?: boolean }) {
    if (!user) return;
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;
    const hidden = opts?.silent ?? false;

    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', text, toolEvents: [], hidden },
    ]);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', text: '', toolEvents: [], hidden },
    ]);

    try {
      const res = await fetch(`${ASSISTANT_URL}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationIdRef.current,
          message: text,
          memberId: user.id,
          email,
        }),
      });

      if (!res.body) throw new Error('No response stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice('data: '.length));

          if (event.type === 'token') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: m.text + event.content } : m,
              ),
            );
          } else if (event.type === 'tool_call') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, toolEvents: [...m.toolEvents, { name: event.name, kind: 'call' }] }
                  : m,
              ),
            );
          } else if (event.type === 'vendor_step') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, vendorStep: { name: event.name, status: event.status, detail: event.detail } }
                  : m,
              ),
            );
          } else if (event.type === 'tool_result') {
            const newProposal = asProposal(event.name, event.result);
            const isAddonCatalog = event.name === 'get_addon_catalog';
            // A finished booking/addons flow (create_booking or update_addons
            // succeeding) closes out that flow's extras question — a later,
            // unrelated get_addon_catalog call (e.g. for a brand-new booking
            // started afterward) must show the strip again rather than
            // staying suppressed for the rest of the conversation.
            const flowJustCompleted =
              event.name === 'search_inventory' ||
              ((event.name === 'create_booking' || event.name === 'update_addons') &&
                !(event.result as { error?: string })?.error);
            setMessages((prev) => {
              // Within the SAME flow, once the addon catalog has been shown,
              // a later re-call (the model re-invoking get_addon_catalog
              // after extras were already chosen for this same booking) must
              // not re-surface the "Checking available extras…" indicator —
              // the member already saw and answered that question.
              const catalogAlreadyShown = isAddonCatalog && !flowJustCompleted && prev.some((m) => m.addonCatalogShown);
              return prev.map((m) => {
                if (m.id !== assistantId) {
                  // A fresh propose_* result supersedes any earlier proposal card
                  // still attached to a previous message — without this, an
                  // assistant that calls propose_booking/propose_addons more than
                  // once across turns (self-correcting retry, or "add GPS please"
                  // after an initial no-extras proposal) leaves the old
                  // BookingSummaryCard + Stripe payment form mounted alongside the
                  // new one, so the member sees two live payment forms at once.
                  return {
                    ...(newProposal && m.proposal ? { ...m, proposal: undefined } : m),
                    ...(flowJustCompleted ? { addonCatalogShown: false } : {}),
                  };
                }
                return {
                  ...m,
                  toolEvents: [
                    ...m.toolEvents,
                    { name: event.name, kind: 'result', isError: Boolean(event.result?.error) },
                  ],
                  proposal: newProposal ?? m.proposal,
                  searchResults: asSearchResults(event.name, event.result) ?? m.searchResults,
                  bookings: asBookingList(event.name, event.result) ?? m.bookings,
                  addOnCatalog: catalogAlreadyShown ? m.addOnCatalog : asAddonCatalog(event.name, event.result) ?? m.addOnCatalog,
                  addonCatalogShown: flowJustCompleted ? false : m.addonCatalogShown || (isAddonCatalog && !catalogAlreadyShown),
                  pickupDate:
                    event.name === 'search_inventory' ? event.result.pickupDate : m.pickupDate,
                  returnDate:
                    event.name === 'search_inventory' ? event.result.returnDate : m.returnDate,
                  dropoffCity:
                    event.name === 'search_inventory' ? event.result.dropoffCity : m.dropoffCity,
                };
              });
            });
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: `Error: ${event.message}` } : m,
              ),
            );
          }
        }
      }
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    void sendTurn(text);
  }

  function handlePaymentDone(message: ChatMessage, bookingId: string, mode: 'create_booking' | 'update_addons') {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              proposal: undefined,
              bookingDone: true,
              // Only propose_booking gets the full confirmation card (it's the
              // one with a pickup to check in for) — propose_addons keeps its
              // existing one-line text confirmation.
              confirmedBooking:
                mode === 'create_booking' && message.proposal
                  ? { bookingId, proposal: message.proposal.result }
                  : m.confirmedBooking,
            }
          : m,
      ),
    );
    void sendTurn(
      mode === 'update_addons'
        ? `Payment completed, extras updated on booking ${bookingId}.`
        : `Payment completed, booking ${bookingId} confirmed.`,
      // create_booking's confirmation is fully covered by the
      // BookingConfirmationCard just rendered — keep that round-trip out of
      // the visible transcript. update_addons has no equivalent card, so its
      // text reply stays visible.
      { silent: mode === 'create_booking' },
    );
  }

  async function confirmModificationNoCharge(message: ChatMessage) {
    if (!message.proposal) return;
    const result = message.proposal.result;
    const bookingId = result.bookingId as string;
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, modificationConfirming: true, modificationConfirmError: null } : m)),
    );

    try {
      const res = await fetch(`/api/bookings/${bookingId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryId: result.inventoryId,
          vendorId: result.vendorId,
          from: result.from,
          to: result.to,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, modificationConfirming: false, modificationConfirmError: body.error ?? 'Modification could not be applied.' }
              : m,
          ),
        );
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                proposal: undefined,
                modificationConfirming: false,
                confirmedModification: {
                  bookingId,
                  deltaCents: body.deltaCents ?? 0,
                  refundAmountCents: body.refundAmountCents,
                  totalPrice: body.totalPrice,
                },
              }
            : m,
        ),
      );
      void sendTurn(`Modification confirmed on booking ${bookingId}.`, { silent: true });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? { ...m, modificationConfirming: false, modificationConfirmError: 'Modification could not be applied.' }
            : m,
        ),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed top-0 right-0 bottom-0 left-auto flex h-full max-h-full w-full max-w-sm translate-x-0 translate-y-0 flex-col rounded-none data-open:slide-in-from-right data-closed:slide-out-to-right sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Travel Assistant</DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-2">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ask me to search rentals, get a quote, or manage a booking.
            </p>
          )}
          {messages.filter((m) => !m.hidden).map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <div
                className={
                  m.role === 'user'
                    ? 'inline-block rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'inline-block rounded-lg bg-muted px-3 py-2 text-sm'
                }
              >
                {m.role === 'assistant' && m.text ? (
                  <AssistantText text={m.text} />
                ) : (
                  m.text || (m.role === 'assistant' && sending ? '…' : '')
                )}
              </div>
              {sending &&
                m.role === 'assistant' &&
                m.toolEvents.length > 0 &&
                m.toolEvents[m.toolEvents.length - 1].kind === 'call' && (
                  <InFlightStatusLine isError={m.toolEvents[m.toolEvents.length - 1].isError} />
                )}
              {m.vendorStep && <VendorCheckCard step={m.vendorStep} />}
              {/* Once this turn has resolved to an actual booking proposal or a
                  confirmed booking, the vehicle chosen and extras selected are
                  already reflected in that card's line items — re-showing the
                  full search-results strip and the entire addon catalog
                  (options the member did NOT pick) is redundant clutter, not
                  a real choice left to make. */}
              {!m.proposal && !m.confirmedBooking && m.searchResults && m.searchResults.length > 0 && (
                <VehicleResultStrip
                  results={m.searchResults}
                  pickupDate={m.pickupDate}
                  returnDate={m.returnDate}
                />
              )}
              {/* get_booking_status's full list is only useful while the member
                  still needs to pick/disambiguate a booking — once a
                  modification proposal or confirmation has resolved, the
                  matched booking is already reflected there, and re-showing
                  every booking (including unrelated ones) is just clutter. */}
              {!m.proposal && !m.confirmedBooking && !m.confirmedModification && m.bookings && (
                <BookingListCard bookings={m.bookings} />
              )}
              {!m.proposal && !m.confirmedBooking && m.addOnCatalog && (
                <AddonCatalogStrip addOns={m.addOnCatalog} />
              )}
              {m.confirmedBooking && <BookingConfirmationCard booking={m.confirmedBooking} />}
              {m.confirmedModification && <ModificationConfirmedCard modification={m.confirmedModification} />}
              {m.proposal && m.proposal.toolName === 'propose_modification' && (
                <ModificationSummaryCard
                  result={m.proposal.result}
                  onConfirmNoCharge={() => confirmModificationNoCharge(m)}
                  confirming={Boolean(m.modificationConfirming)}
                  confirmError={m.modificationConfirmError ?? null}
                />
              )}
              {m.proposal && m.proposal.toolName === 'propose_modification' &&
                (m.proposal.result.deltaCents as number | undefined ?? 0) > 0 &&
                typeof m.proposal.result.clientSecret === 'string' &&
                typeof m.proposal.result.paymentIntentId === 'string' && (
                  <div className="mt-2 text-left">
                    <AssistantPayment
                      clientSecret={m.proposal.result.clientSecret as string}
                      paymentIntentId={m.proposal.result.paymentIntentId as string}
                      mode="modify_booking"
                      modifyPayload={{
                        bookingId: m.proposal.result.bookingId as string,
                        inventoryId: m.proposal.result.inventoryId as string,
                        vendorId: m.proposal.result.vendorId as string,
                        from: m.proposal.result.from as string,
                        to: m.proposal.result.to as string,
                      }}
                      onDone={(bookingId) => {
                        setMessages((prev) =>
                          prev.map((mm) =>
                            mm.id === m.id
                              ? {
                                  ...mm,
                                  proposal: undefined,
                                  confirmedModification: {
                                    bookingId,
                                    deltaCents: m.proposal!.result.deltaCents as number,
                                    totalPrice: m.proposal!.result.newTotalPrice as number | undefined,
                                  },
                                }
                              : mm,
                          ),
                        );
                        void sendTurn(`Modification confirmed on booking ${bookingId}.`, { silent: true });
                      }}
                    />
                  </div>
                )}
              {m.proposal && m.proposal.toolName !== 'propose_modification' && (
                <div className="mt-2 text-left">
                  <ProposalSummary toolName={m.proposal.toolName} result={m.proposal.result} />
                  {m.proposal.toolName === 'propose_booking' &&
                    typeof m.proposal.result.clientSecret === 'string' &&
                    typeof m.proposal.result.paymentIntentId === 'string' && (
                      <AssistantPayment
                        clientSecret={m.proposal.result.clientSecret as string}
                        paymentIntentId={m.proposal.result.paymentIntentId as string}
                        inventoryId={m.proposal.result.inventoryId as string}
                        vendorId={m.proposal.result.vendorId as string}
                        from={m.proposal.result.from as string}
                        to={m.proposal.result.to as string}
                        addonIds={(m.proposal.result.chargedAddonIds as string[]) ?? []}
                        onDone={(bookingId) => handlePaymentDone(m, bookingId, 'create_booking')}
                      />
                    )}
                  {m.proposal.toolName === 'propose_addons' &&
                    typeof m.proposal.result.clientSecret === 'string' &&
                    typeof m.proposal.result.paymentIntentId === 'string' && (
                      <AssistantPayment
                        clientSecret={m.proposal.result.clientSecret as string}
                        paymentIntentId={m.proposal.result.paymentIntentId as string}
                        mode="update_addons"
                        addonsPayload={{
                          bookingId: m.proposal.result.bookingId as string,
                          addonIds: (m.proposal.result.chargedAddonIds as string[]) ?? [],
                        }}
                        onDone={(bookingId) => handlePaymentDone(m, bookingId, 'update_addons')}
                      />
                    )}
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border pt-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
