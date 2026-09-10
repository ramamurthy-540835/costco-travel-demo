'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string);

interface AssistantPaymentProps {
  clientSecret: string;
  paymentIntentId: string;
  inventoryId?: string;
  vendorId?: string;
  from?: string;
  to?: string;
  addonIds?: string[];
  // Default 'create_booking' keeps the original propose_booking flow
  // byte-for-byte unchanged. 'update_addons' posts to the addons route on an
  // already-reserved booking instead of creating a new one. 'modify_booking'
  // posts the previously-quoted diff to the modify route, paying the price
  // increase that made a payment step necessary in the first place.
  mode?: 'create_booking' | 'update_addons' | 'modify_booking';
  addonsPayload?: { bookingId: string; addonIds: string[] };
  modifyPayload?: { bookingId: string; inventoryId?: string; vendorId?: string; from?: string; to?: string };
  onDone: (bookingId: string) => void;
}

export function AssistantPayment(props: AssistantPaymentProps) {
  // @stripe/react-stripe-js only applies options.clientSecret on the
  // Elements instance's INITIAL mount — a later prop change (a second
  // propose_booking/propose_addons call producing a new PaymentIntent for
  // the same chat message) does not reinitialize it. Keying on clientSecret
  // forces a clean remount instead of letting the member submit against a
  // stale, abandoned PaymentIntent — the root cause of the "Processing
  // error" seen when a booking was re-proposed before payment.
  return (
    <Elements key={props.clientSecret} stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <AssistantPaymentForm {...props} />
    </Elements>
  );
}

function AssistantPaymentForm(props: AssistantPaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed.');
      setSubmitting(false);
      return;
    }

    const isAddons = props.mode === 'update_addons';
    const isModification = props.mode === 'modify_booking';
    const url = isAddons
      ? `/api/bookings/${props.addonsPayload?.bookingId}/addons`
      : isModification
        ? `/api/bookings/${props.modifyPayload?.bookingId}/modify`
        : '/api/bookings';
    const body = isAddons
      ? { addonIds: props.addonsPayload?.addonIds, paymentIntentId: props.paymentIntentId }
      : isModification
        ? {
            inventoryId: props.modifyPayload?.inventoryId,
            vendorId: props.modifyPayload?.vendorId,
            from: props.modifyPayload?.from,
            to: props.modifyPayload?.to,
            paymentIntentId: props.paymentIntentId,
          }
        : {
            inventoryId: props.inventoryId,
            vendorId: props.vendorId,
            from: props.from,
            to: props.to,
            addonIds: props.addonIds ?? [],
            paymentIntentId: props.paymentIntentId,
          };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      setError(
        errBody.error ??
          (isAddons ? 'Extras could not be updated.' : isModification ? 'Modification could not be applied.' : 'Booking could not be created.'),
      );
      setSubmitting(false);
      return;
    }

    if (isAddons) {
      props.onDone(props.addonsPayload!.bookingId);
    } else if (isModification) {
      props.onDone(props.modifyPayload!.bookingId);
    } else {
      const { bookingId } = await res.json();
      props.onDone(bookingId);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-left">
      <PaymentElement />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={!stripe || submitting}>
        {submitting ? 'Confirming…' : 'Pay and book'}
      </Button>
    </form>
  );
}
