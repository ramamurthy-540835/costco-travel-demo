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

interface ConfirmedCancellation {
  bookingId: string;
  refundAmountCents?: number;
  refundPercent?: number;
}

interface ConfirmedAddons {
  bookingId: string;
  deltaCents: number;
  refundAmountCents?: number;
  totalPrice?: number;
  selectedAddOns: SelectedAddOnEntry[];
}

// A single derived field describing "what should this message render right
// now" — replaces the old scattered booleans (proposal/searchResults/bookings/
// addOnCatalog/confirmedBooking/confirmedModification), each of which needed
// its own suppression guard against every other one. Every tool_result event
// computes a candidate outcome and overwrites this field (rank-gated, see
// OUTCOME_RANK) instead of being tracked as an independent flag — so a turn
// that ends in plain prose with no tool calls simply never sets this past
// 'none', and any future tool automatically gets "superseded by whatever the
// turn produces later" behavior for free instead of needing a new guard added
// to every other card.
type TurnOutcome =
  | { kind: 'none' }
  | { kind: 'search'; results: InventorySearchResult[]; pickupDate?: string; returnDate?: string; dropoffCity?: string }
  | { kind: 'addon_catalog'; addOns: AddOnCatalogEntry[] }
  | { kind: 'booking_list'; bookings: BookingRecord[] }
  | {
      kind: 'proposal';
      toolName: string;
      result: Record<string, unknown>;
      pickupDate?: string;
      returnDate?: string;
      dropoffCity?: string;
    }
  | { kind: 'confirmed_booking'; booking: ConfirmedBooking }
  | { kind: 'confirmed_modification'; modification: ConfirmedModification }
  | { kind: 'confirmed_cancellation'; cancellation: ConfirmedCancellation }
  | { kind: 'confirmed_addons'; addons: ConfirmedAddons };

const OUTCOME_RANK: Record<TurnOutcome['kind'], number> = {
  none: 0,
  search: 1,
  booking_list: 1,
  addon_catalog: 1,
  proposal: 2,
  confirmed_booking: 3,
  confirmed_modification: 3,
  confirmed_cancellation: 3,
  confirmed_addons: 3,
};

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  toolEvents: ToolEvent[];
  outcome: TurnOutcome;
  bookingDone?: boolean;
  vendorStep?: VendorStep;
  modificationConfirming?: boolean;
  modificationConfirmError?: string | null;
  cancellationConfirming?: boolean;
  cancellationConfirmError?: string | null;
  addonsConfirming?: boolean;
  addonsConfirmError?: string | null;
  // The synthetic "Payment completed, booking X confirmed" round-trip exists
  // only to tell the model (and session history) the booking is done — the
  // BookingConfirmationCard already shows the member everything it would
  // say, so that exchange is kept out of the rendered transcript.
  hidden?: boolean;
}

// Maps a resolved tool_result to the outcome it should produce, or undefined
// if this tool has no visible card (get_quote, get_cancellation_policy, or
// any errored result) — an undefined candidate leaves the current outcome
// untouched rather than clearing it.
function mapToOutcome(name: string, result: Record<string, unknown>): TurnOutcome | undefined {
  const proposal = asProposal(name, result);
  if (proposal) {
    return {
      kind: 'proposal',
      toolName: proposal.toolName,
      result: proposal.result,
      pickupDate: result.pickupDate as string | undefined,
      returnDate: result.returnDate as string | undefined,
      dropoffCity: result.dropoffCity as string | undefined,
    };
  }
  const searchResults = asSearchResults(name, result);
  if (searchResults) {
    return {
      kind: 'search',
      results: searchResults,
      pickupDate: result.pickupDate as string | undefined,
      returnDate: result.returnDate as string | undefined,
      dropoffCity: result.dropoffCity as string | undefined,
    };
  }
  const addOns = asAddonCatalog(name, result);
  if (addOns) return { kind: 'addon_catalog', addOns };
  const bookings = asBookingList(name, result);
  if (bookings) return { kind: 'booking_list', bookings };
  return undefined;
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
  // Standard markdown joins single newlines into the same paragraph/line —
  // fine for prose the model wrote as one flowing sentence, but replies
  // that enumerate several short points on their own lines (without a
  // model-emitted "- " list or a blank line between them) render as one
  // dense, unbroken block instead. Promoting single newlines to blank-line
  // paragraph breaks gives every line its own breathing room regardless of
  // whether the model bothered with list syntax, without needing an extra
  // remark plugin.
  const spaced = text.replace(/\n(?!\n)/g, '\n\n');
  return (
    <div className="space-y-2 leading-relaxed [&_p]:m-0 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-4 [&_strong]:font-semibold">
      <ReactMarkdown
        allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br', 'code']}
        unwrapDisallowed
      >
        {spaced}
      </ReactMarkdown>
    </div>
  );
}

function InFlightStatusLine({ isError }: { isError?: boolean }) {
  if (isError) {
    return <p className="mt-1 text-xs text-muted-foreground italic">Couldn&apos;t complete that — retrying…</p>;
  }
  return <ThinkingIndicator />;
}

// Animated three-dot "thinking" indicator, replacing the old static "…"
// placeholder — same bouncing-dots pattern used by ChatGPT/Claude's own web
// UIs to signal an in-progress reply without implying any real text yet.
function ThinkingIndicator() {
  return (
    <div className="mt-1 inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </div>
  );
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

// Cancellation never needs a payment form (it only ever refunds or is a
// no-op), so it mirrors ModificationSummaryCard's no-charge confirm-button
// path exactly rather than needing its own Stripe branch.
function CancellationSummaryCard({
  result,
  onConfirm,
  confirming,
  confirmError,
}: {
  result: Record<string, unknown>;
  onConfirm: () => void;
  confirming: boolean;
  confirmError: string | null;
}) {
  const refundAmountCents = result.refundAmountCents as number | undefined;
  const refundPercent = result.refundPercent as number | undefined;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card p-3 text-sm">
      <div className="font-medium">Cancel booking</div>
      <div className="mt-2 flex justify-between border-t border-border pt-2">
        <span className="text-muted-foreground">Refund</span>
        <span className="font-medium">
          {typeof refundAmountCents === 'number'
            ? `$${(refundAmountCents / 100).toFixed(2)}`
            : typeof refundPercent === 'number'
              ? `${refundPercent}%`
              : 'None'}
        </span>
      </div>
      <div className="mt-2 border-t border-border pt-2">
        <Button size="sm" variant="destructive" onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Confirming…' : 'Confirm cancellation'}
        </Button>
        {confirmError && <p className="mt-1 text-xs text-destructive">{confirmError}</p>}
      </div>
    </div>
  );
}

function CancellationConfirmedCard({ cancellation }: { cancellation: ConfirmedCancellation }) {
  const { refundAmountCents, refundPercent } = cancellation;
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-green-300 bg-card p-3 text-sm">
      <div className="flex items-center gap-2 text-green-700">
        <span aria-hidden>✓</span>
        <span className="font-medium">Booking cancelled</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {typeof refundAmountCents === 'number' && refundAmountCents > 0
          ? `Refunded $${(refundAmountCents / 100).toFixed(2)}.`
          : typeof refundPercent === 'number' && refundPercent > 0
            ? `Refunded ${refundPercent}%.`
            : 'No refund due.'}
      </div>
    </div>
  );
}

// Extras have the same three outcomes as a modification (charge/refund/
// no-op) plus an itemized line-item list — mirrors ModificationSummaryCard's
// layout/confirm-button pattern instead of the old plain-text-plus-pills
// combo, so extras get the same "card you can act on" treatment as booking
// and modification instead of a "reply yes" text exchange.
function AddonsSummaryCard({
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
  const selected = (result.selectedAddOns as SelectedAddOnEntry[] | undefined) ?? [];
  const deltaCents = (result.deltaCents as number | undefined) ?? 0;
  const newTotalPrice = result.newTotalPrice as number | undefined;
  const hasCharge = deltaCents > 0;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card p-3 text-sm">
      <div className="font-medium">Extras</div>
      {selected.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border pt-2">
          {selected.map((a) => (
            <div key={a.addonId} className="flex justify-between text-muted-foreground">
              <span>{a.name}</span>
              <span>
                {a.charged && typeof a.feePerDay === 'number' && a.feePerDay > 0
                  ? `$${a.feePerDay.toFixed(2)}/day`
                  : 'Included'}
              </span>
            </div>
          ))}
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
            {confirming ? 'Confirming…' : deltaCents < 0 ? 'Confirm and refund' : 'Confirm extras'}
          </Button>
          {confirmError && <p className="mt-1 text-xs text-destructive">{confirmError}</p>}
        </div>
      )}
    </div>
  );
}

function AddonsConfirmedCard({ addons }: { addons: ConfirmedAddons }) {
  const { deltaCents, refundAmountCents, totalPrice } = addons;
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-green-300 bg-card p-3 text-sm">
      <div className="flex items-center gap-2 text-green-700">
        <span aria-hidden>✓</span>
        <span className="font-medium">Extras updated</span>
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
  const inputRef = useRef<HTMLInputElement>(null);
  // Once the member has seen a booking list/context card at all this
  // conversation, a LATER get_booking_status call that resolves to a single
  // booking is almost always the model re-resolving context it already has
  // (e.g. "manage extras" on "the latest booking" just shown) — surfacing
  // that as its own card again just to have it overwritten moments later by
  // the addon catalog/proposal is the "flash and disappear" bug. A genuine
  // disambiguation list (more than one booking) is always shown.
  const bookingListShownRef = useRef(false);
  // Same reasoning, for the addon catalog: once it's been shown once this
  // conversation, a later get_addon_catalog re-fetch (e.g. right before
  // propose_addons on a follow-up "add X" message) is redundant — it would
  // otherwise flash the catalog strip on screen only to have propose_addons
  // overwrite it moments later with the proposal card.
  const addonCatalogShownRef = useRef(false);

  // Streamed tokens/tool events grow the newest message's height in place,
  // so a plain "scroll on new message" effect would miss most of the growth —
  // scroll on every render instead, which is cheap (a no-op once already at bottom).
  // The Input disables itself while a turn is in flight, which drops focus —
  // re-focus it the moment it re-enables so the member can start typing the
  // next message immediately instead of having to click back into it.
  useEffect(() => {
    if (!sending && open) inputRef.current?.focus();
  }, [sending, open]);

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
      { id: crypto.randomUUID(), role: 'user', text, toolEvents: [], outcome: { kind: 'none' }, hidden },
    ]);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', text: '', toolEvents: [], outcome: { kind: 'none' }, hidden },
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

      // Informational outcomes (search/booking_list/addon_catalog, rank 1) are
      // debounced before they touch state: a tool result mid-turn that's about
      // to be superseded by a later same-or-higher-rank result in this SAME
      // turn (e.g. get_booking_status resolving a booking right before
      // get_addon_catalog/propose_addons runs) would otherwise render its card
      // for a moment and then vanish once overwritten — a visible "flash".
      // Proposal/confirmed outcomes (rank >= 2) are always applied instantly.
      let displayedOutcome: TurnOutcome = { kind: 'none' };
      let pendingOutcome: TurnOutcome | null = null;
      let pendingTimer: ReturnType<typeof setTimeout> | null = null;
      const flushPendingOutcome = () => {
        if (!pendingTimer) return;
        clearTimeout(pendingTimer);
        pendingTimer = null;
        if (pendingOutcome) {
          displayedOutcome = pendingOutcome;
          pendingOutcome = null;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, outcome: displayedOutcome } : m)));
        }
      };

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
            // The backend's tool-call loop always finishes every tool_call/
            // tool_result for a turn before it starts streaming real reply
            // text (chat-loop.ts's `for turn` loop only emits tokens once
            // pendingCalls is empty) — so the first token is a reliable
            // signal that no further tool_result can arrive this turn.
            // Flushing here (instead of relying solely on the fixed-delay
            // fallback below) shows the truly-final card the instant text
            // starts, and catches same-turn overwrites the fixed delay is
            // too short to cover (e.g. a slow tool call before a later one
            // supersedes it).
            flushPendingOutcome();
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
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolEvents: [
                        ...m.toolEvents,
                        { name: event.name, kind: 'result', isError: Boolean(event.result?.error) },
                      ],
                    }
                  : m,
              ),
            );

            const rawCandidate = mapToOutcome(event.name, event.result);
            const isRedundantBookingList =
              rawCandidate?.kind === 'booking_list' && rawCandidate.bookings.length === 1 && bookingListShownRef.current;
            const isRedundantAddonCatalog = rawCandidate?.kind === 'addon_catalog' && addonCatalogShownRef.current;
            const candidate = isRedundantBookingList || isRedundantAddonCatalog ? undefined : rawCandidate;
            if (candidate?.kind === 'booking_list') bookingListShownRef.current = true;
            if (candidate?.kind === 'addon_catalog') addonCatalogShownRef.current = true;
            // Rank-gated overwrite: a candidate this message's current (or
            // pending, not-yet-displayed) outcome already outranks — e.g. a
            // repeat get_addon_catalog call after propose_booking already
            // resolved — is ignored instead of needing its own dedup flag.
            const effectiveCurrent = pendingOutcome ?? displayedOutcome;
            if (!candidate || OUTCOME_RANK[candidate.kind] < OUTCOME_RANK[effectiveCurrent.kind]) {
              // no-op: doesn't outrank what's already shown/queued
            } else if (OUTCOME_RANK[candidate.kind] >= 2) {
              // proposal / confirmed_* — always applied instantly, no debounce
              if (pendingTimer) {
                clearTimeout(pendingTimer);
                pendingTimer = null;
                pendingOutcome = null;
              }
              displayedOutcome = candidate;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) {
                    // A fresh propose_* result supersedes any earlier
                    // proposal card still attached to a previous message —
                    // without this, an assistant that calls propose_booking/
                    // propose_addons/propose_modification/
                    // propose_cancellation more than once across turns
                    // leaves the old card + Stripe payment form (or confirm
                    // button) mounted alongside the new one. Only ever
                    // clears another message's outcome when it's still an
                    // unresolved 'proposal' — informational and terminal
                    // outcomes on older messages are never touched.
                    if (m.outcome.kind === 'proposal') {
                      return { ...m, outcome: { kind: 'none' } };
                    }
                    return m;
                  }
                  return { ...m, outcome: candidate };
                }),
              );
            } else {
              // rank 1 (search/booking_list/addon_catalog) — debounce so an
              // intermediate result that's about to be superseded within
              // this same turn never touches the DOM at all.
              pendingOutcome = candidate;
              if (pendingTimer) clearTimeout(pendingTimer);
              pendingTimer = setTimeout(flushPendingOutcome, 300);
            }
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: `Error: ${event.message}` } : m,
              ),
            );
          }
        }
      }
      flushPendingOutcome();
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
    const proposalResult = message.outcome.kind === 'proposal' ? message.outcome.result : undefined;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              bookingDone: true,
              // Both paths now get a real terminal card (confirmed_booking /
              // confirmed_addons) — mirrors confirmModificationNoCharge's
              // "card covers it, no follow-up text" pattern instead of
              // leaving update_addons with no card and a visible follow-up
              // reply.
              outcome:
                mode === 'create_booking' && proposalResult
                  ? { kind: 'confirmed_booking', booking: { bookingId, proposal: proposalResult } }
                  : proposalResult
                    ? {
                        kind: 'confirmed_addons',
                        addons: {
                          bookingId,
                          deltaCents: (proposalResult.deltaCents as number | undefined) ?? 0,
                          totalPrice: proposalResult.newTotalPrice as number | undefined,
                          selectedAddOns: (proposalResult.selectedAddOns as SelectedAddOnEntry[] | undefined) ?? [],
                        },
                      }
                    : { kind: 'none' },
            }
          : m,
      ),
    );
    // Both cards fully cover what the member needs to see — keep this
    // bookkeeping round-trip (it tells the model/session history the change
    // is done) out of the visible transcript, same as create_booking always did.
    void sendTurn(
      mode === 'update_addons'
        ? `Payment completed, extras updated on booking ${bookingId}.`
        : `Payment completed, booking ${bookingId} confirmed.`,
      { silent: true },
    );
  }

  async function confirmModificationNoCharge(message: ChatMessage) {
    if (message.outcome.kind !== 'proposal') return;
    const result = message.outcome.result;
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
                modificationConfirming: false,
                outcome: {
                  kind: 'confirmed_modification',
                  modification: {
                    bookingId,
                    deltaCents: body.deltaCents ?? 0,
                    refundAmountCents: body.refundAmountCents,
                    totalPrice: body.totalPrice,
                  },
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

  async function confirmCancellationDirect(message: ChatMessage) {
    if (message.outcome.kind !== 'proposal') return;
    const result = message.outcome.result;
    const bookingId = result.bookingId as string;
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, cancellationConfirming: true, cancellationConfirmError: null } : m)),
    );

    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, cancellationConfirming: false, cancellationConfirmError: body.error ?? 'Cancellation could not be applied.' }
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
                cancellationConfirming: false,
                outcome: {
                  kind: 'confirmed_cancellation',
                  cancellation: {
                    bookingId,
                    refundAmountCents: body.refundAmountCents,
                    refundPercent: body.refundPercent,
                  },
                },
              }
            : m,
        ),
      );
      void sendTurn(`Cancellation confirmed on booking ${bookingId}.`, { silent: true });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? { ...m, cancellationConfirming: false, cancellationConfirmError: 'Cancellation could not be applied.' }
            : m,
        ),
      );
    }
  }

  // No-charge/refund extras confirm, mirroring confirmModificationNoCharge
  // exactly: a direct REST call from the UI's own button instead of the
  // member typing "yes" and the model calling update_addons — no visible
  // follow-up text needed either way.
  async function confirmAddonsNoCharge(message: ChatMessage) {
    if (message.outcome.kind !== 'proposal') return;
    const result = message.outcome.result;
    const bookingId = result.bookingId as string;
    const selectedAddOns = (result.selectedAddOns as SelectedAddOnEntry[] | undefined) ?? [];
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, addonsConfirming: true, addonsConfirmError: null } : m)),
    );

    try {
      const res = await fetch(`/api/bookings/${bookingId}/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonIds: selectedAddOns.map((a) => a.addonId), dryRun: false }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, addonsConfirming: false, addonsConfirmError: body.error ?? 'Extras could not be updated.' }
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
                addonsConfirming: false,
                outcome: {
                  kind: 'confirmed_addons',
                  addons: {
                    bookingId,
                    deltaCents: body.deltaCents ?? 0,
                    refundAmountCents: body.refundAmountCents,
                    totalPrice: body.totalPrice,
                    selectedAddOns,
                  },
                },
              }
            : m,
        ),
      );
      void sendTurn(`Extras updated on booking ${bookingId}.`, { silent: true });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? { ...m, addonsConfirming: false, addonsConfirmError: 'Extras could not be updated.' }
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
          {(() => {
            const visible = messages.filter((m) => !m.hidden);
            return visible.map((m) => {
              const isLastVisible = m.id === visible[visible.length - 1]?.id;
              return (
                <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                  {m.role === 'user' && (
                    <div className="inline-block max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {m.text}
                    </div>
                  )}
                  {m.role === 'assistant' && (
                    <>
                      {m.text ? (
                        <div className="inline-block max-w-[90%] rounded-lg bg-muted px-3 py-2 text-sm">
                          <AssistantText text={m.text} />
                        </div>
                      ) : (
                        sending &&
                        isLastVisible && (
                          <InFlightStatusLine
                            isError={m.toolEvents[m.toolEvents.length - 1]?.isError}
                          />
                        )
                      )}
                      {m.vendorStep && <VendorCheckCard step={m.vendorStep} />}

              {m.outcome.kind === 'search' && m.outcome.results.length > 0 && (
                <VehicleResultStrip
                  results={m.outcome.results}
                  pickupDate={m.outcome.pickupDate}
                  returnDate={m.outcome.returnDate}
                />
              )}
              {m.outcome.kind === 'booking_list' && <BookingListCard bookings={m.outcome.bookings} />}
              {m.outcome.kind === 'addon_catalog' && <AddonCatalogStrip addOns={m.outcome.addOns} />}
              {m.outcome.kind === 'confirmed_booking' && <BookingConfirmationCard booking={m.outcome.booking} />}
              {m.outcome.kind === 'confirmed_modification' && (
                <ModificationConfirmedCard modification={m.outcome.modification} />
              )}
              {m.outcome.kind === 'confirmed_cancellation' && (
                <CancellationConfirmedCard cancellation={m.outcome.cancellation} />
              )}
              {m.outcome.kind === 'confirmed_addons' && <AddonsConfirmedCard addons={m.outcome.addons} />}

              {m.outcome.kind === 'proposal' && m.outcome.toolName === 'propose_modification' && (
                <>
                  <ModificationSummaryCard
                    result={m.outcome.result}
                    onConfirmNoCharge={() => confirmModificationNoCharge(m)}
                    confirming={Boolean(m.modificationConfirming)}
                    confirmError={m.modificationConfirmError ?? null}
                  />
                  {(m.outcome.result.deltaCents as number | undefined ?? 0) > 0 &&
                    typeof m.outcome.result.clientSecret === 'string' &&
                    typeof m.outcome.result.paymentIntentId === 'string' && (
                      <div className="mt-2 text-left">
                        <AssistantPayment
                          clientSecret={m.outcome.result.clientSecret as string}
                          paymentIntentId={m.outcome.result.paymentIntentId as string}
                          mode="modify_booking"
                          modifyPayload={{
                            bookingId: m.outcome.result.bookingId as string,
                            inventoryId: m.outcome.result.inventoryId as string,
                            vendorId: m.outcome.result.vendorId as string,
                            from: m.outcome.result.from as string,
                            to: m.outcome.result.to as string,
                          }}
                          onDone={(bookingId) => {
                            const deltaCents = (m.outcome as { result: Record<string, unknown> }).result.deltaCents as number;
                            const newTotalPrice = (m.outcome as { result: Record<string, unknown> }).result
                              .newTotalPrice as number | undefined;
                            setMessages((prev) =>
                              prev.map((mm) =>
                                mm.id === m.id
                                  ? {
                                      ...mm,
                                      outcome: {
                                        kind: 'confirmed_modification',
                                        modification: { bookingId, deltaCents, totalPrice: newTotalPrice },
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
                </>
              )}

              {m.outcome.kind === 'proposal' && m.outcome.toolName === 'propose_cancellation' && (
                <CancellationSummaryCard
                  result={m.outcome.result}
                  onConfirm={() => confirmCancellationDirect(m)}
                  confirming={Boolean(m.cancellationConfirming)}
                  confirmError={m.cancellationConfirmError ?? null}
                />
              )}

              {m.outcome.kind === 'proposal' && m.outcome.toolName === 'propose_addons' && (
                <>
                  <AddonsSummaryCard
                    result={m.outcome.result}
                    onConfirmNoCharge={() => confirmAddonsNoCharge(m)}
                    confirming={Boolean(m.addonsConfirming)}
                    confirmError={m.addonsConfirmError ?? null}
                  />
                  {(m.outcome.result.deltaCents as number | undefined ?? 0) > 0 &&
                    typeof m.outcome.result.clientSecret === 'string' &&
                    typeof m.outcome.result.paymentIntentId === 'string' && (
                      <div className="mt-2 text-left">
                        <AssistantPayment
                          clientSecret={m.outcome.result.clientSecret as string}
                          paymentIntentId={m.outcome.result.paymentIntentId as string}
                          mode="update_addons"
                          addonsPayload={{
                            bookingId: m.outcome.result.bookingId as string,
                            // Full requested set, not just the charged
                            // subset — the addons route replaces the whole
                            // list, so a waived/included extra must still be
                            // sent or it silently drops off the booking.
                            addonIds: ((m.outcome.result.selectedAddOns as SelectedAddOnEntry[] | undefined) ?? []).map(
                              (a) => a.addonId,
                            ),
                          }}
                          onDone={(bookingId) => handlePaymentDone(m, bookingId, 'update_addons')}
                        />
                      </div>
                    )}
                </>
              )}

              {m.outcome.kind === 'proposal' &&
                m.outcome.toolName !== 'propose_modification' &&
                m.outcome.toolName !== 'propose_cancellation' &&
                m.outcome.toolName !== 'propose_addons' && (
                  <div className="mt-2 text-left">
                    <ProposalSummary toolName={m.outcome.toolName} result={m.outcome.result} />
                    {m.outcome.toolName === 'propose_booking' &&
                      typeof m.outcome.result.clientSecret === 'string' &&
                      typeof m.outcome.result.paymentIntentId === 'string' && (
                        <AssistantPayment
                          clientSecret={m.outcome.result.clientSecret as string}
                          paymentIntentId={m.outcome.result.paymentIntentId as string}
                          inventoryId={m.outcome.result.inventoryId as string}
                          vendorId={m.outcome.result.vendorId as string}
                          from={m.outcome.result.from as string}
                          to={m.outcome.result.to as string}
                          addonIds={(m.outcome.result.chargedAddonIds as string[]) ?? []}
                          onDone={(bookingId) => handlePaymentDone(m, bookingId, 'create_booking')}
                        />
                      )}
                  </div>
                )}
                    </>
                  )}
                </div>
              );
            });
          })()}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border pt-3">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={sending}
            autoFocus
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
