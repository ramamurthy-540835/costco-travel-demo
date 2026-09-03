import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookingModifyDialog } from '@/components/booking-modify-dialog';
import { BookingCancelDialog } from '@/components/booking-cancel-dialog';
import { BookingAddonsDialog } from '@/components/booking-addons-dialog';
import connectToDatabase from '@/lib/mongodb';
import Booking from '@/lib/models/Booking';
import Member from '@/lib/models/Member';
import { BOOKING_STATUS } from '@/lib/models/Booking';
import { buildOwnBookingsFilter } from '@/app/api/bookings/route';
import {
  searchInventory,
  findEquivalentInventory,
  getAddOnsCatalog,
  getWaivedAddOnIds,
  type InventorySearchResult,
} from '@/lib/graph/queries';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  reserved: 'default',
  checked_in: 'default',
  returned: 'secondary',
  cancelled: 'destructive',
};

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  reserved: 'Reserved',
  checked_in: 'Checked in',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to see your bookings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Your reservations are tied to your account. Sign in or create an account to view
              them here.
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

  const params = await searchParams;
  const status = params.status ?? '';
  const from = params.from ?? '';
  const to = params.to ?? '';

  await connectToDatabase();
  const member = await Member.findOne({ clerkUserId: userId });

  const [bookings, results, addOnsCatalog] = await Promise.all([
    member
      ? Booking.find(buildOwnBookingsFilter(member._id, { status: status || undefined, from: from || undefined, to: to || undefined }))
          .sort({ from: -1 })
          .lean()
      : Promise.resolve([]),
    searchInventory(),
    getAddOnsCatalog(),
  ]);

  // Dedupe by distinct perkIds combination actually present on this page,
  // rather than one getWaivedAddOnIds() Cypher call per booking row.
  const distinctPerkIdsKeys = new Map<string, string[]>();
  for (const booking of bookings) {
    const perkIds = booking.pricingSnapshot.perkIds ?? [];
    const key = [...perkIds].sort().join('|');
    if (!distinctPerkIdsKeys.has(key)) distinctPerkIdsKeys.set(key, perkIds);
  }
  const waivedByPerkIdsKey = new Map<string, Set<string>>(
    await Promise.all(
      Array.from(distinctPerkIdsKeys.entries()).map(
        async ([key, perkIds]) => [key, await getWaivedAddOnIds(perkIds)] as const,
      ),
    ),
  );

  // Dedupe alternate-vendor candidate lookups by distinct (city, class_name)
  // pair actually present among this page's reserved bookings — one
  // findEquivalentInventory() call per pair, not one per booking row.
  const distinctLocationClassPairs = new Map<string, { city?: string; className: string }>();
  for (const booking of bookings) {
    if (booking.status !== 'reserved') continue;
    const match = results.find(
      (r) => r.inventory.rental_id === booking.inventoryId && r.vendor.provider === booking.vendorId,
    );
    if (!match) continue;
    const key = `${match.location?.city ?? ''}|${match.vehicleClass.class_name}`;
    if (!distinctLocationClassPairs.has(key)) {
      distinctLocationClassPairs.set(key, { city: match.location?.city, className: match.vehicleClass.class_name });
    }
  }
  const candidatesByPairKey = new Map<string, InventorySearchResult[]>(
    await Promise.all(
      Array.from(distinctLocationClassPairs.entries()).map(
        async ([key, { city, className }]) => [key, await findEquivalentInventory(city, className)] as const,
      ),
    ),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-heading text-2xl font-medium">My bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your reservations, with your negotiated rate already applied.
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <select name="status" defaultValue={status} className="rounded-md border border-foreground/10 px-2 py-1.5 text-sm">
            <option value="">All</option>
            {BOOKING_STATUS.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s] ?? s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border border-foreground/10 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded-md border border-foreground/10 px-2 py-1.5 text-sm"
          />
        </label>
        <Button type="submit">Filter</Button>
      </form>

      <div className="mt-6 flex flex-col gap-4">
        {bookings.length === 0 && (
          <p className="text-sm text-muted-foreground">No bookings match these filters.</p>
        )}
        {bookings.map((booking) => {
          const match = results.find(
            (r) =>
              r.inventory.rental_id === booking.inventoryId && r.vendor.provider === booking.vendorId,
          );
          const bookingId = String(booking._id);
          const bookingFrom = new Date(booking.from);
          const bookingTo = new Date(booking.to);
          const perkIdsKey = [...(booking.pricingSnapshot.perkIds ?? [])].sort().join('|');
          const waivedAddonIds = Array.from(waivedByPerkIdsKey.get(perkIdsKey) ?? new Set<string>());
          const pairKey = match ? `${match.location?.city ?? ''}|${match.vehicleClass.class_name}` : '';
          const alternateCandidates = (candidatesByPairKey.get(pairKey) ?? [])
            .filter((c) => c.inventory.rental_id !== booking.inventoryId)
            .map((c) => ({
              inventoryId: c.inventory.rental_id,
              vendorId: c.vendor.provider,
              className: c.vehicleClass.class_name,
              vehicleMake: c.inventory.vehicle_make as string | undefined,
              vehicleModel: c.inventory.vehicle_model as string | undefined,
            }));

          return (
            <Card key={bookingId}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>
                    {match ? match.vehicleClass.class_name : 'Vehicle unavailable'} — {booking.vendorId}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {bookingFrom.toLocaleDateString()} – {bookingTo.toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={statusVariant[booking.status] ?? 'secondary'}>
                  {statusLabel[booking.status] ?? booking.status}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium">${booking.pricingSnapshot.totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" render={<Link href={`/confirmation/${bookingId}`} />}>
                    View confirmation
                  </Button>
                  {booking.status === 'reserved' && member?.email && (
                    <BookingModifyDialog
                      bookingId={bookingId}
                      from={bookingFrom.toISOString()}
                      to={bookingTo.toISOString()}
                      receiptEmail={member.email}
                      currentInventoryId={booking.inventoryId}
                      currentVendorId={booking.vendorId}
                      currentClassName={match ? match.vehicleClass.class_name : 'Vehicle unavailable'}
                      candidates={alternateCandidates}
                    />
                  )}
                  {booking.status === 'reserved' && <BookingCancelDialog bookingId={bookingId} />}
                  {booking.status === 'reserved' && member?.email && (
                    <BookingAddonsDialog
                      bookingId={bookingId}
                      receiptEmail={member.email}
                      catalog={addOnsCatalog}
                      waivedAddonIds={waivedAddonIds}
                      currentAddonIds={booking.pricingSnapshot.addonIds ?? []}
                    />
                  )}
                </div>
                {booking.status === 'cancelled' &&
                  typeof booking.cancellation?.refundPercent === 'number' && (
                    <p className="text-xs text-muted-foreground">
                      Refunded ${((booking.cancellation.refundAmountCents ?? 0) / 100).toFixed(2)} (
                      {booking.cancellation.refundPercent}%)
                    </p>
                  )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
