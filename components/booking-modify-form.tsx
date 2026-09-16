'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { BASE_PATH } from '@/lib/basePath';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { CalendarClock, CheckCircle2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string);

function toDateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

interface BookingModifyCandidate {
  inventoryId: string;
  vendorId: string;
  className: string;
  vehicleMake?: string;
  vehicleModel?: string;
}

function candidateLabel(c: BookingModifyCandidate): string {
  const vehicle = [c.vehicleMake, c.vehicleModel].filter(Boolean).join(' ');
  return vehicle ? `${c.vendorId} — ${c.className} (${vehicle})` : `${c.vendorId} — ${c.className}`;
}

interface BookingModifyFormProps {
  bookingId: string;
  from: string;
  to: string;
  receiptEmail: string;
  currentInventoryId: string;
  currentVendorId: string;
  currentClassName: string;
  candidates: BookingModifyCandidate[];
}

export function BookingModifyForm({
  bookingId,
  from,
  to,
  receiptEmail,
  currentInventoryId,
  currentVendorId,
  currentClassName,
  candidates,
}: BookingModifyFormProps) {
  const router = useRouter();
  const [newFrom, setNewFrom] = useState(toDateInputValue(from));
  const [newTo, setNewTo] = useState(toDateInputValue(to));
  // '' means "Keep current vehicle" — dates-only behavior, unchanged from pre-04-14.
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [deltaCents, setDeltaCents] = useState<number | null>(null);
  const [newTotalPrice, setNewTotalPrice] = useState<number | null>(null);
  const [quoteVendorId, setQuoteVendorId] = useState<string | null>(null);
  const [quoteDailyRate, setQuoteDailyRate] = useState<number | null>(null);
  const [quotePerkIds, setQuotePerkIds] = useState<string[] | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedCandidate = candidates.find((c) => c.inventoryId === selectedInventoryId) ?? null;

  function vehicleChangeBody() {
    return selectedCandidate
      ? { inventoryId: selectedCandidate.inventoryId, vendorId: selectedCandidate.vendorId }
      : {};
  }

  async function fetchDryRunQuote(fromValue: string, toValue: string) {
    setQuoting(true);
    setError(null);
    setNote(null);
    setSuccessMessage(null);
    setClientSecret(null);
    setPaymentIntentId(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/bookings/${bookingId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromValue, to: toValue, dryRun: true, ...vehicleChangeBody() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not preview this change.');
        setDeltaCents(null);
        setNewTotalPrice(null);
        setQuoteVendorId(null);
        setQuoteDailyRate(null);
        setQuotePerkIds(null);
        return;
      }
      const data = await res.json();
      setDeltaCents(data.deltaCents);
      setNewTotalPrice(data.newTotalPrice);
      setQuoteVendorId(data.vendorId ?? null);
      setQuoteDailyRate(typeof data.dailyRate === 'number' ? data.dailyRate : null);
      setQuotePerkIds(Array.isArray(data.perkIds) ? data.perkIds : null);
    } catch {
      setError('Could not preview this change.');
    } finally {
      setQuoting(false);
    }
  }

  useEffect(() => {
    if (clientSecret) return;
    if (!newFrom || !newTo) return;
    const datesUnchanged = newFrom === toDateInputValue(from) && newTo === toDateInputValue(to);
    if (datesUnchanged && !selectedCandidate) {
      setDeltaCents(null);
      setNewTotalPrice(null);
      setQuoteVendorId(null);
      setQuoteDailyRate(null);
      setQuotePerkIds(null);
      return;
    }
    const timer = setTimeout(() => {
      void fetchDryRunQuote(newFrom, newTo);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newFrom, newTo, selectedInventoryId]);

  async function startPayment() {
    if (deltaCents === null) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/payments/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: deltaCents / 100,
          currency: 'usd',
          receiptEmail,
          description: `Modification delta — booking ${bookingId}`,
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
      const res = await fetch(`${BASE_PATH}/api/bookings/${bookingId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: newFrom, to: newTo, ...vehicleChangeBody() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not apply this change.');
        if (body.note) setNote(body.note);
        return;
      }
      setDeltaCents(null);
      setNewTotalPrice(null);
      setSelectedInventoryId('');
      setSuccessMessage(
        body.refundAmountCents > 0
          ? `Your booking has been updated. $${(body.refundAmountCents / 100).toFixed(2)} has been refunded to your original payment method.`
          : 'Your booking has been updated.',
      );
      router.refresh();
    } catch {
      setError('Could not apply this change.');
    } finally {
      setApplying(false);
    }
  }

  const datesChanged =
    newFrom !== toDateInputValue(from) || newTo !== toDateInputValue(to);
  const inPaymentStep = Boolean(clientSecret && paymentIntentId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5" strokeWidth={1.5} /> Modify your booking
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {successMessage && (
          <p className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-primary">
            <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.5} /> {successMessage}
          </p>
        )}
        {!inPaymentStep ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Pick-up</span>
                <input
                  type="date"
                  className="rounded-md border border-foreground/10 px-2 py-1.5"
                  value={newFrom}
                  onChange={(e) => setNewFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Return</span>
                <input
                  type="date"
                  className="rounded-md border border-foreground/10 px-2 py-1.5"
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                />
              </label>
            </div>

            {candidates.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Vehicle / vendor
                </span>
                <select
                  className="rounded-md border border-foreground/10 px-2 py-1.5"
                  value={selectedInventoryId}
                  onChange={(e) => setSelectedInventoryId(e.target.value)}
                >
                  <option value="">
                    Keep current vehicle ({currentVendorId} — {currentClassName})
                  </option>
                  {candidates.map((c) => (
                    <option key={c.inventoryId} value={c.inventoryId}>
                      {candidateLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {quoting && <p className="text-muted-foreground">Checking new rate…</p>}
            {error && <p className="text-destructive">{error}</p>}
            {note && <p className="text-muted-foreground">{note}</p>}

            {(datesChanged || Boolean(selectedCandidate)) &&
              deltaCents !== null &&
              newTotalPrice !== null && (
              <div className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
                {selectedCandidate && quoteVendorId && quoteVendorId !== currentVendorId && (
                  <div className="flex flex-col gap-1 text-muted-foreground">
                    <p>
                      New vendor: <span className="font-medium text-foreground">{quoteVendorId}</span>
                      {typeof quoteDailyRate === 'number' && ` — $${quoteDailyRate.toFixed(2)}/day`}
                    </p>
                    {quotePerkIds && quotePerkIds.length > 0 && (
                      <p>Perks: {quotePerkIds.join(', ')}</p>
                    )}
                  </div>
                )}
                <p className="font-heading font-medium">
                  New total: ${newTotalPrice.toFixed(2)}
                  {deltaCents > 0 ? ` (+$${(deltaCents / 100).toFixed(2)})` : ''}
                </p>
                {deltaCents > 0 ? (
                  <Button onClick={startPayment} disabled={applying}>
                    {applying ? 'Preparing payment…' : 'Continue to payment'}
                  </Button>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      Your new total is lower — no additional payment is needed.{' '}
                      {deltaCents < 0
                        ? 'Any difference will be refunded to your original payment method.'
                        : ''}
                    </p>
                    <Button onClick={applyWithoutPayment} disabled={applying}>
                      {applying ? 'Saving…' : 'Confirm new dates'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret: clientSecret as string }}>
            <ModifyPaymentStep
              bookingId={bookingId}
              from={newFrom}
              to={newTo}
              inventoryId={selectedCandidate?.inventoryId}
              vendorId={selectedCandidate?.vendorId}
              paymentIntentId={paymentIntentId as string}
              onSuccess={() => {
                setClientSecret(null);
                setPaymentIntentId(null);
                setDeltaCents(null);
                setNewTotalPrice(null);
                setSelectedInventoryId('');
                setSuccessMessage('Your booking has been updated.');
              }}
            />
          </Elements>
        )}
      </CardContent>
    </Card>
  );
}

function ModifyPaymentStep({
  bookingId,
  from,
  to,
  inventoryId,
  vendorId,
  paymentIntentId,
  onSuccess,
}: {
  bookingId: string;
  from: string;
  to: string;
  inventoryId?: string;
  vendorId?: string;
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

    const res = await fetch(`${BASE_PATH}/api/bookings/${bookingId}/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        paymentIntentId,
        ...(inventoryId && vendorId ? { inventoryId, vendorId } : {}),
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'Modification could not be applied.');
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
