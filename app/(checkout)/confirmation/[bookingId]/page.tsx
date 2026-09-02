import Link from 'next/link';
import {
  Car,
  CheckCircle2,
  Circle,
  CreditCard,
  MapPin,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardImage } from '@/components/vehicle-card';
import connectToDatabase from '@/lib/mongodb';
import Booking from '@/lib/models/Booking';
import Member from '@/lib/models/Member';
import { searchInventory, getAddOnsCatalog, getVendorPolicy } from '@/lib/graph/queries';
import getStripe from '@/lib/payment/stripe';

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  await connectToDatabase();
  const mongoose = (await import('mongoose')).default;
  const booking = mongoose.Types.ObjectId.isValid(bookingId)
    ? await Booking.findById(bookingId).lean()
    : null;

  if (!booking) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">Booking not found.</p>
        <Button className="mt-4" render={<Link href="/search" />}>
          Back to search
        </Button>
      </main>
    );
  }

  const [results, addOnsCatalog, vendorPolicy, member] = await Promise.all([
    searchInventory(),
    getAddOnsCatalog(),
    getVendorPolicy(booking.vendorId),
    Member.findById(booking.member).lean(),
  ]);

  const match = results.find(
    (r) => r.inventory.rental_id === booking.inventoryId && r.vendor.provider === booking.vendorId,
  );

  const from = new Date(booking.from);
  const to = new Date(booking.to);
  const nights = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));

  const chargedAddonIds = booking.pricingSnapshot.addonIds ?? [];
  const chargedAddons = addOnsCatalog.filter((a) => chargedAddonIds.includes(a.addon_id));

  let paymentMethodLabel: string | null = null;
  let paymentStatus = 'Paid';
  if (booking.paymentIntentId) {
    try {
      const stripeAPI = getStripe();
      const paymentIntent = await stripeAPI.paymentIntents.retrieve(booking.paymentIntentId, {
        expand: ['payment_method'],
      });
      paymentStatus = paymentIntent.status === 'succeeded' ? 'Paid' : paymentIntent.status;
      const pm = paymentIntent.payment_method;
      if (pm && typeof pm === 'object' && pm.card) {
        paymentMethodLabel = `${pm.card.brand.toUpperCase()} •••• ${pm.card.last4}`;
      }
    } catch {
      // Payment intent lookup is best-effort display only — booking is already confirmed.
    }
  }

  const depositAmount = match?.inventory.deposit_amount as number | undefined;
  const fuelPolicy = match?.inventory.fuel_policy as string | undefined;
  const vehicleMake = match?.inventory.vehicle_make as string | undefined;
  const vehicleModel = match?.inventory.vehicle_model as string | undefined;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="size-10 text-primary" strokeWidth={1.5} />
        <h1 className="font-heading text-2xl font-medium">Booking confirmed</h1>
        <p className="text-sm text-muted-foreground">Booking ID: {String(booking._id)}</p>
      </div>

      {/* Booking details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="size-5" strokeWidth={1.5} /> Booking details
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm sm:flex-row">
          <CardImage
            className={match?.vehicleClass.class_name ?? 'Vehicle'}
            make={vehicleMake}
            model={vehicleModel}
          />
          <div className="flex flex-1 flex-col gap-2">
            <p className="font-medium">
              {match ? match.vehicleClass.class_name : 'Vehicle class unavailable'}
              {match &&
                (vehicleMake || vehicleModel) &&
                ` — ${[vehicleMake, vehicleModel].filter(Boolean).join(' ')}`}
            </p>
            <p className="text-muted-foreground">{booking.vendorId}</p>
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>
                Pick-up: {formatDateTime(from)}
                <br />
                Return: {formatDateTime(to)} ({nights} night{nights === 1 ? '' : 's'})
              </span>
            </div>
            {fuelPolicy && <p className="text-muted-foreground">Fuel policy: {fuelPolicy}</p>}
            {typeof depositAmount === 'number' && depositAmount > 0 && (
              <p className="text-muted-foreground">Deposit due at pickup: ${depositAmount.toFixed(2)}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Booking options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" strokeWidth={1.5} /> Booking options
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {match && match.perks.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Included perks</p>
              {match.perks.map((perk) => (
                <div key={perk.perk_id as string} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" strokeWidth={1.5} />
                  <span>{perk.name as string}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">Extras</p>
            {chargedAddons.length === 0 && (
              <p className="text-muted-foreground">No extras added.</p>
            )}
            {chargedAddons.map((addon) => (
              <div key={addon.addon_id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" strokeWidth={1.5} />
                  {addon.name ?? addon.addon_id}
                </span>
                <span className="text-muted-foreground">
                  ${((addon.fee_per_day ?? 0) * nights).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {addOnsCatalog
            .filter((a) => typeof a.fee_per_day === 'number' && !chargedAddonIds.includes(a.addon_id))
            .length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Not added</p>
              {addOnsCatalog
                .filter(
                  (a) => typeof a.fee_per_day === 'number' && !chargedAddonIds.includes(a.addon_id),
                )
                .map((addon) => (
                  <div key={addon.addon_id} className="flex items-center gap-2 text-muted-foreground">
                    <Circle className="size-4" strokeWidth={1.5} />
                    <span>{addon.name ?? addon.addon_id}</span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Driver details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-5" strokeWidth={1.5} /> Driver details
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="font-medium">{member?.fullName ?? 'Member'}</p>
          <p className="text-muted-foreground">{member?.email}</p>
          {member?.phone && <p className="text-muted-foreground">{member.phone}</p>}
          {booking.additionalDriver && (
            <p className="text-muted-foreground">Additional driver added</p>
          )}
        </CardContent>
      </Card>

      {/* Payment options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" strokeWidth={1.5} /> Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Daily rate</span>
            <span>${booking.pricingSnapshot.dailyRate.toFixed(2)} / day</span>
          </div>
          {booking.pricingSnapshot.addonTotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Extras</span>
              <span>${booking.pricingSnapshot.addonTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between border-t border-foreground/10 pt-1 font-heading text-lg font-medium">
            <span>Total</span>
            <span>${booking.pricingSnapshot.totalPrice.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-muted-foreground">
            <span>{paymentMethodLabel ?? 'Card on file'}</span>
            <span className="font-medium text-foreground">{paymentStatus}</span>
          </div>
        </CardContent>
      </Card>

      {/* Pick-up checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5" strokeWidth={1.5} /> Pick-up checklist
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
                {typeof depositAmount === 'number' && depositAmount > 0
                  ? `A refundable deposit of $${depositAmount.toFixed(2)} will be held at pickup.`
                  : 'No deposit is required for this vehicle class.'}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>Fuel policy: {fuelPolicy ?? 'as agreed with the counter agent'}.</span>
            </li>
            <li className="flex items-start gap-2">
              <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>Arrive within your pick-up window — {formatDateTime(from)}.</span>
            </li>
            {typeof vendorPolicy?.modification_cutoff_hours === 'number' && (
              <li className="flex items-start gap-2">
                <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                <span>
                  Changes to this booking must be made at least{' '}
                  {vendorPolicy.modification_cutoff_hours as number}h before pick-up.
                </span>
              </li>
            )}
            {vendorPolicy?.no_show_fee_applies === true && (
              <li className="flex items-start gap-2">
                <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                <span>A no-show fee applies if you don&apos;t arrive for pick-up.</span>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Button render={<Link href="/search" />}>Back to search</Button>
    </main>
  );
}
