import Link from 'next/link';
import { ArrowLeft, Car } from 'lucide-react';
import { currentUser } from '@clerk/nextjs/server';
import {
  searchInventory,
  getVendorPolicy,
  getAddOnsCatalog,
  getWaivedAddOnIds,
} from '@/lib/graph/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardImage } from '@/components/vehicle-card';
import { CheckoutForm } from './checkout-form';

const FROM_OFFSET_DAYS = 14;
const TO_OFFSET_DAYS = 17;

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    inventoryId?: string;
    vendorId?: string;
    from?: string;
    to?: string;
    returnTo?: string;
  }>;
}) {
  const { inventoryId, vendorId, from: fromParam, to: toParam, returnTo } = await searchParams;
  const backHref = returnTo || '/search';

  if (!inventoryId || !vendorId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={backHref}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to results
        </Link>
        <p className="text-sm text-muted-foreground">Missing vehicle selection. Go back and choose a car.</p>
      </main>
    );
  }

  const results = await searchInventory();
  const match = results.find(
    (r) => r.inventory.rental_id === inventoryId && r.vendor.provider === vendorId,
  );

  if (!match || !match.negotiatedTerm) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={backHref}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to results
        </Link>
        <p className="text-sm text-muted-foreground">This vehicle is no longer available.</p>
      </main>
    );
  }

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  if (!user || !email) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={backHref}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to results
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Sign in to book</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Your booking and negotiated rate are tied to your account. Sign in or create an
              account to continue.
            </p>
            <div className="flex gap-3">
              <Button render={<Link href="/sign-in" />}>Sign in</Button>
              <Button variant="secondary" render={<Link href="/sign-up" />}>
                Sign up
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';

  const now = new Date();
  const parsedFrom = fromParam ? new Date(fromParam) : null;
  const parsedTo = toParam ? new Date(toParam) : null;
  const from =
    parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : addDays(now, FROM_OFFSET_DAYS);
  const to = parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : addDays(now, TO_OFFSET_DAYS);
  const nights = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));

  const dailyRate = (match.inventory.daily_rate as number | undefined) ?? 0;
  const totalPrice = dailyRate * nights;

  const [vendorPolicy, addOnsCatalog, waivedAddOnIds] = await Promise.all([
    getVendorPolicy(vendorId),
    getAddOnsCatalog(),
    getWaivedAddOnIds(match.perks.map((p) => p.perk_id as string)),
  ]);

  const vehicleMake = match.inventory.vehicle_make as string | undefined;
  const vehicleModel = match.inventory.vehicle_model as string | undefined;
  const gearbox = match.inventory.gearbox as string | undefined;
  const seats = match.inventory.seats as number | undefined;
  const fuelPolicy = match.inventory.fuel_policy as string | undefined;
  const depositAmount = match.inventory.deposit_amount as number | undefined;
  const vendorRating = match.vendor.rating as number | undefined;
  const minimumRentalDays = match.vendor.minimum_rental_days as number | undefined;
  const includedMiles = match.negotiatedTerm.included_miles as string | number | undefined;
  const cancellationWindowHours = match.negotiatedTerm.cancellation_window_hours as
    | number
    | undefined;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href={backHref}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to results
        </Link>
        <h1 className="font-heading text-2xl font-medium">Checkout</h1>
      </div>

      {/* Your booking details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="size-5" strokeWidth={1.5} /> Your booking details
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm sm:flex-row">
          <CardImage
            className={match.vehicleClass.class_name}
            make={vehicleMake}
            model={vehicleModel}
          />
          <div className="flex flex-1 flex-col gap-1">
            <p className="font-medium">
              {match.vehicleClass.class_name}
              {(vehicleMake || vehicleModel) &&
                ` — ${[vehicleMake, vehicleModel].filter(Boolean).join(' ')}`}
            </p>
            <p className="text-muted-foreground">
              {[gearbox, typeof seats === 'number' ? `${seats} seats` : undefined, fuelPolicy]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-muted-foreground">
              {match.vendor.provider}
              {typeof vendorRating === 'number' && ` · ${vendorRating.toFixed(1)}★`}
              {typeof minimumRentalDays === 'number' && ` · min ${minimumRentalDays} day rental`}
            </p>
            <p className="text-muted-foreground">
              {from.toDateString()} &rarr; {to.toDateString()} ({nights} nights)
            </p>
            {Boolean(includedMiles) && (
              <p className="text-muted-foreground">
                {typeof includedMiles === 'number' ? `${includedMiles} mi included` : includedMiles}
              </p>
            )}
            {typeof cancellationWindowHours === 'number' && (
              <p className="text-muted-foreground">
                Free cancellation up to {cancellationWindowHours}h before pickup
              </p>
            )}
            {typeof depositAmount === 'number' && depositAmount > 0 && (
              <p className="text-muted-foreground">${depositAmount.toFixed(2)} deposit</p>
            )}
            {match.perks.length > 0 && (
              <p className="text-muted-foreground">
                Perks: {match.perks.map((p) => p.name as string).join(', ')}
              </p>
            )}
            {vendorPolicy && (
              <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                {typeof vendorPolicy.standard_cancellation_window_hours === 'number' && (
                  <p>
                    Standard cancellation window: {vendorPolicy.standard_cancellation_window_hours}h
                  </p>
                )}
                {typeof vendorPolicy.modification_cutoff_hours === 'number' && (
                  <p>Modification cutoff: {vendorPolicy.modification_cutoff_hours as number}h</p>
                )}
                {typeof vendorPolicy.no_show_fee_applies === 'boolean' && (
                  <p>No-show fee applies: {vendorPolicy.no_show_fee_applies ? 'Yes' : 'No'}</p>
                )}
                {typeof vendorPolicy.refund_processing_days === 'number' && (
                  <p>Refund processing: {vendorPolicy.refund_processing_days as number} days</p>
                )}
              </div>
            )}
            <p className="mt-2 text-muted-foreground">
              Base rate: ${totalPrice.toFixed(2)} ({nights} night{nights === 1 ? '' : 's'} at $
              {dailyRate.toFixed(2)}/day) — final total below includes any options selected
            </p>
          </div>
        </CardContent>
      </Card>

      <CheckoutForm
        inventoryId={inventoryId}
        vendorId={vendorId}
        from={from.toISOString()}
        to={to.toISOString()}
        nights={nights}
        dailyRate={dailyRate}
        totalPrice={totalPrice}
        receiptEmail={email}
        customerName={fullName}
        addOnsCatalog={addOnsCatalog}
        waivedAddOnIds={Array.from(waivedAddOnIds)}
        fuelPolicy={fuelPolicy}
        depositAmount={depositAmount}
        modificationCutoffHours={vendorPolicy?.modification_cutoff_hours as number | undefined}
        noShowFeeApplies={vendorPolicy?.no_show_fee_applies as boolean | undefined}
      />
    </main>
  );
}
