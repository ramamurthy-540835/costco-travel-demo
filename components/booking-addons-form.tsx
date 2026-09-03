'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { CheckCircle2, CreditCard, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string);

export interface AddonCatalogItem {
  addon_id: string;
  name?: string;
  fee_per_day?: number;
}

interface BookingAddonsFormProps {
  bookingId: string;
  receiptEmail: string;
  catalog: AddonCatalogItem[];
  waivedAddonIds: string[];
  currentAddonIds: string[];
}

export function BookingAddonsForm({
  bookingId,
  receiptEmail,
  catalog,
  waivedAddonIds,
  currentAddonIds,
}: BookingAddonsFormProps) {
  const router = useRouter();
  const waivedSet = new Set(waivedAddonIds);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(currentAddonIds);
  const [deltaCents, setDeltaCents] = useState<number | null>(null);
  const [newTotalPrice, setNewTotalPrice] = useState<number | null>(null);
  const [chargedAddonIds, setChargedAddonIds] = useState<string[]>(currentAddonIds);
  const [quoting, setQuoting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function fetchDryRunQuote(addonIds: string[]) {
    setQuoting(true);
    setError(null);
    setNote(null);
    setSuccessMessage(null);
    setClientSecret(null);
    setPaymentIntentId(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonIds, dryRun: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not preview this change.');
        setDeltaCents(null);
        setNewTotalPrice(null);
        return;
      }
      const data = await res.json();
      setDeltaCents(data.deltaCents);
      setNewTotalPrice(data.newTotalPrice);
      setChargedAddonIds(data.chargedAddonIds ?? []);
    } catch {
      setError('Could not preview this change.');
    } finally {
      setQuoting(false);
    }
  }

  useEffect(() => {
    if (clientSecret) return;
    const same =
      selectedAddonIds.length === currentAddonIds.length &&
      selectedAddonIds.every((id) => currentAddonIds.includes(id));
    if (same) {
      setDeltaCents(null);
      setNewTotalPrice(null);
      setChargedAddonIds(currentAddonIds);
      return;
    }
    const timer = setTimeout(() => {
      void fetchDryRunQuote(selectedAddonIds);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddonIds]);

  function toggleAddon(addonId: string) {
    if (waivedSet.has(addonId)) return;
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId],
    );
  }

  async function startPayment() {
    if (deltaCents === null) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: deltaCents / 100,
          currency: 'usd',
          receiptEmail,
          description: `Extras change — booking ${bookingId}`,
        }),
      });
      if (!res.ok) {
        throw new Error('Could not start payment');
      }
      const data = await res.json();
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
    } catch {
      setError('Could not start payment. Please try again.');
    } finally {
      setApplying(false);
    }
  }

  async function applyWithoutPayment() {
    setApplying(true);
    setError(null);
    setNote(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonIds: selectedAddonIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not apply this change.');
        if (body.note) setNote(body.note);
        return;
      }
      setDeltaCents(null);
      setNewTotalPrice(null);
      setSuccessMessage(
        body.refundAmountCents > 0
          ? `Your extras have been updated. $${(body.refundAmountCents / 100).toFixed(2)} has been refunded to your original payment method.`
          : 'Your extras have been updated.',
      );
      router.refresh();
    } catch {
      setError('Could not apply this change.');
    } finally {
      setApplying(false);
    }
  }

  const inPaymentStep = Boolean(clientSecret && paymentIntentId);

  return (
    <div className="flex flex-col gap-4 text-sm">
      {successMessage && (
        <p className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-primary">
          <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.5} /> {successMessage}
        </p>
      )}
      {!inPaymentStep ? (
        <>
          <div className="flex flex-col gap-2">
            {catalog.map((addon) => {
              const isWaived = waivedSet.has(addon.addon_id);
              const isSelected = isWaived || selectedAddonIds.includes(addon.addon_id);
              return (
                <label
                  key={addon.addon_id}
                  className="flex items-center justify-between gap-2 rounded-md border border-foreground/10 px-3 py-2"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isWaived}
                      onChange={() => toggleAddon(addon.addon_id)}
                    />
                    {addon.name ?? addon.addon_id}
                  </span>
                  <span className="text-muted-foreground">
                    {isWaived ? 'Included with your perks — $0' : `$${(addon.fee_per_day ?? 0).toFixed(2)}/day`}
                  </span>
                </label>
              );
            })}
          </div>

          {quoting && <p className="text-muted-foreground">Recalculating…</p>}
          {error && <p className="text-destructive">{error}</p>}
          {note && <p className="text-muted-foreground">{note}</p>}

          {deltaCents !== null && newTotalPrice !== null && (
            <div className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
              <p className="font-heading font-medium">
                New total: ${newTotalPrice.toFixed(2)}
                {deltaCents > 0 ? ` (+$${(deltaCents / 100).toFixed(2)})` : ''}
              </p>
              {deltaCents > 0 ? (
                <Button onClick={startPayment} disabled={applying}>
                  {applying ? 'Preparing payment…' : 'Continue to payment'}
                </Button>
              ) : deltaCents < 0 ? (
                <>
                  <p className="text-muted-foreground">
                    Your new total is lower — the difference will be refunded to your original
                    payment method.
                  </p>
                  <Button onClick={applyWithoutPayment} disabled={applying}>
                    {applying ? 'Saving…' : 'Confirm extras'}
                  </Button>
                </>
              ) : (
                <Button onClick={applyWithoutPayment} disabled={applying}>
                  {applying ? 'Saving…' : 'Confirm extras'}
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret: clientSecret as string }}>
          <AddonsPaymentStep
            bookingId={bookingId}
            addonIds={selectedAddonIds}
            paymentIntentId={paymentIntentId as string}
            onSuccess={() => {
              setClientSecret(null);
              setPaymentIntentId(null);
              setDeltaCents(null);
              setNewTotalPrice(null);
              setSuccessMessage('Your extras have been updated.');
            }}
          />
        </Elements>
      )}
      {chargedAddonIds.length === 0 && !quoting && deltaCents === null && (
        <p className="text-xs text-muted-foreground">
          <PackagePlus className="mr-1 inline size-3.5" strokeWidth={1.5} />
          Toggle an extra above to see the updated price.
        </p>
      )}
    </div>
  );
}

function AddonsPaymentStep({
  bookingId,
  addonIds,
  paymentIntentId,
  onSuccess,
}: {
  bookingId: string;
  addonIds: string[];
  paymentIntentId: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);
    setNote(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed.');
      setSubmitting(false);
      return;
    }

    const res = await fetch(`/api/bookings/${bookingId}/addons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addonIds, paymentIntentId }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'Extras change could not be applied.');
      if (body.note) setNote(body.note);
      setSubmitting(false);
      return;
    }

    onSuccess();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="flex items-center gap-2 font-heading text-base font-medium">
        <CreditCard className="size-4" strokeWidth={1.5} /> Confirm delta payment
      </p>
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <Button type="submit" disabled={!stripe || submitting}>
        {submitting ? 'Confirming…' : 'Pay and apply change'}
      </Button>
    </form>
  );
}
