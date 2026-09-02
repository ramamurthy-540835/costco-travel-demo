'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Circle, CreditCard, ShieldCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string);

interface AddOn {
  addon_id: string;
  name?: string;
  fee_per_day?: number;
  [key: string]: unknown;
}

interface CheckoutFormProps {
  inventoryId: string;
  vendorId: string;
  from: string;
  to: string;
  nights: number;
  dailyRate: number;
  totalPrice: number;
  receiptEmail: string;
  customerName: string;
  addOnsCatalog: AddOn[];
  waivedAddOnIds: string[];
  fuelPolicy?: string;
  depositAmount?: number;
  modificationCutoffHours?: number;
  noShowFeeApplies?: boolean;
}

function useExtrasToggles(props: CheckoutFormProps) {
  const toggleable = props.addOnsCatalog.filter((a) => typeof a.fee_per_day === 'number');
  const waived = new Set(props.waivedAddOnIds);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(addonId: string) {
    if (waived.has(addonId)) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) {
        next.delete(addonId);
      } else {
        next.add(addonId);
      }
      return next;
    });
  }

  const chargedAddonIds = toggleable
    .filter((a) => !waived.has(a.addon_id) && checked.has(a.addon_id))
    .map((a) => a.addon_id);

  const addonTotal = toggleable
    .filter((a) => chargedAddonIds.includes(a.addon_id))
    .reduce((sum, a) => sum + (a.fee_per_day ?? 0) * props.nights, 0);

  const total = props.dailyRate * props.nights + addonTotal;

  return { toggleable, waived, checked, toggle, chargedAddonIds, addonTotal, total };
}

function DriverDetailsCard({ props }: { props: CheckoutFormProps }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="size-5" strokeWidth={1.5} /> Driver details
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <p className="font-medium">{props.customerName}</p>
        <p className="text-muted-foreground">{props.receiptEmail}</p>
      </CardContent>
    </Card>
  );
}

function PickUpChecklistCard({ props }: { props: CheckoutFormProps }) {
  const from = new Date(props.from);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" strokeWidth={1.5} /> Your pick-up checklist
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>Bring a valid driver&apos;s license and the credit card used for booking.</span>
          </li>
          <li className="flex items-start gap-2">
            <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>
              {typeof props.depositAmount === 'number' && props.depositAmount > 0
                ? `A refundable deposit of $${props.depositAmount.toFixed(2)} will be held at pickup.`
                : 'No deposit is required for this vehicle class.'}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>Fuel policy: {props.fuelPolicy ?? 'as agreed with the counter agent'}.</span>
          </li>
          <li className="flex items-start gap-2">
            <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>Arrive within your pick-up window — {from.toLocaleString()}.</span>
          </li>
          {typeof props.modificationCutoffHours === 'number' && (
            <li className="flex items-start gap-2">
              <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>
                Changes to this booking must be made at least {props.modificationCutoffHours}h
                before pick-up.
              </span>
            </li>
          )}
          {props.noShowFeeApplies === true && (
            <li className="flex items-start gap-2">
              <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>A no-show fee applies if you don&apos;t arrive for pick-up.</span>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

export function CheckoutForm(props: CheckoutFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const extras = useExtrasToggles(props);

  async function startPayment() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: extras.total,
          currency: 'usd',
          receiptEmail: props.receiptEmail,
          customerName: props.customerName,
          description: `${props.vendorId} — ${props.inventoryId}`,
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
      setLoading(false);
    }
  }

  const inPaymentStep = Boolean(clientSecret && paymentIntentId);

  return (
    <>
      {/* Your booking options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" strokeWidth={1.5} /> Your booking options
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {extras.toggleable.length === 0 && (
            <p className="text-muted-foreground">No optional extras for this vehicle.</p>
          )}
          {extras.toggleable.map((addon) => {
            const isWaived = extras.waived.has(addon.addon_id);
            const isChecked = isWaived || extras.checked.has(addon.addon_id);
            return (
              <label key={addon.addon_id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isWaived || inPaymentStep}
                    onChange={() => extras.toggle(addon.addon_id)}
                  />
                  {addon.name ?? addon.addon_id}
                </span>
                <span className="text-muted-foreground">
                  {isWaived
                    ? '$0 (included)'
                    : `+$${((addon.fee_per_day ?? 0) * props.nights).toFixed(2)}`}
                </span>
              </label>
            );
          })}
        </CardContent>
      </Card>

      <DriverDetailsCard props={props} />

      {!inPaymentStep ? (
        <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="font-heading text-lg font-medium">Total: ${extras.total.toFixed(2)}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={startPayment} disabled={loading}>
            {loading ? 'Preparing payment…' : 'Continue to payment'}
          </Button>
        </div>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret: clientSecret as string }}>
          <PaymentStep
            {...props}
            paymentIntentId={paymentIntentId as string}
            chargedAddonIds={extras.chargedAddonIds}
            total={extras.total}
          />
        </Elements>
      )}

      <PickUpChecklistCard props={props} />
    </>
  );
}

function PaymentStep(
  props: CheckoutFormProps & { paymentIntentId: string; chargedAddonIds: string[]; total: number },
) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) {
      return;
    }

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

    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventoryId: props.inventoryId,
        vendorId: props.vendorId,
        from: props.from,
        to: props.to,
        paymentIntentId: props.paymentIntentId,
        addonIds: props.chargedAddonIds,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Booking could not be created.');
      setSubmitting(false);
      return;
    }

    const { bookingId } = await res.json();
    router.push(`/confirmation/${bookingId}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5" strokeWidth={1.5} /> Payment options
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="font-heading text-lg font-medium">Total: ${props.total.toFixed(2)}</p>
          <PaymentElement />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!stripe || submitting}>
            {submitting ? 'Confirming…' : 'Pay and book'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
