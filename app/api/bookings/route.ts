import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import getStripe from '@/lib/payment/stripe';
import connectToDatabase from '@/lib/mongodb';
import Booking from '@/lib/models/Booking';
import { getOrCreateMember } from '@/lib/models/member-sync';
import { searchInventory, getAddOnsCatalog, getWaivedAddOnIds } from '@/lib/graph/queries';
import { recordReservation } from '@/lib/graph/mutations';

interface CreateBookingPayload {
  inventoryId: string;
  vendorId: string;
  from: string;
  to: string;
  paymentIntentId: string;
  addonIds?: string[];
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401 });
  }

  const body: CreateBookingPayload = await req.json();
  const { inventoryId, vendorId, from, to, paymentIntentId, addonIds = [] } = body;

  if (!inventoryId || !vendorId || !from || !to || !paymentIntentId) {
    return NextResponse.json(
      { error: 'inventoryId, vendorId, from, to, and paymentIntentId are required' },
      { status: 400 },
    );
  }

  const stripeAPI = getStripe();
  const paymentIntent = await stripeAPI.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    return NextResponse.json({ error: 'Payment has not succeeded' }, { status: 400 });
  }

  const results = await searchInventory();
  const match = results.find(
    (r) => r.inventory.rental_id === inventoryId && r.vendor.provider === vendorId,
  );
  if (!match || !match.negotiatedTerm) {
    return NextResponse.json({ error: 'Inventory or negotiated rate not found' }, { status: 400 });
  }

  const dailyRate = (match.inventory.daily_rate as number | undefined) ?? 0;
  const nights = Math.max(
    1,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)),
  );
  const currency = 'usd';

  const [addOnsCatalog, waivedAddOnIds] = await Promise.all([
    getAddOnsCatalog(),
    getWaivedAddOnIds(match.perks.map((p) => p.perk_id as string)),
  ]);
  const chargedAddonIds = addOnsCatalog
    .filter(
      (a) =>
        typeof a.fee_per_day === 'number' &&
        addonIds.includes(a.addon_id) &&
        !waivedAddOnIds.has(a.addon_id),
    )
    .map((a) => a.addon_id);
  const addonTotal = addOnsCatalog
    .filter((a) => chargedAddonIds.includes(a.addon_id))
    .reduce((sum, a) => sum + (a.fee_per_day ?? 0) * nights, 0);

  const totalPrice = dailyRate * nights + addonTotal;

  const expectedAmountCents = Math.round(totalPrice * 100);
  if (paymentIntent.amount !== expectedAmountCents) {
    return NextResponse.json(
      { error: 'Charged amount does not match the negotiated rate' },
      { status: 400 },
    );
  }

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member';
  if (!email) {
    return NextResponse.json({ error: 'A verified email is required to book' }, { status: 400 });
  }

  const member = await getOrCreateMember(userId, email, fullName);

  await connectToDatabase();
  const booking = await Booking.create({
    member: member._id,
    inventoryId,
    vendorId,
    from: new Date(from),
    to: new Date(to),
    status: 'reserved',
    paymentIntentId,
    pricingSnapshot: {
      negotiatedTermId: match.negotiatedTerm.term_id,
      dailyRate,
      currency,
      perkIds: match.perks.map((p) => p.perk_id),
      addonIds: chargedAddonIds,
      addonTotal,
      totalPrice,
    },
  });

  await recordReservation(inventoryId, String(member._id), match.negotiatedTerm.term_id);

  return NextResponse.json({ bookingId: String(booking._id) }, { status: 201 });
}
