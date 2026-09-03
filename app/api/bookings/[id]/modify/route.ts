import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import getStripe from '@/lib/payment/stripe';
import connectToDatabase from '@/lib/mongodb';
import Booking from '@/lib/models/Booking';
import Member from '@/lib/models/Member';
import { getAddOnsCatalog, getWaivedAddOnIds } from '@/lib/graph/queries';
import { quoteModification } from '@/lib/vendor-integration/policy';

interface ModifyPayload {
  inventoryId?: string;
  vendorId?: string;
  from?: string;
  to?: string;
  paymentIntentId?: string;
  dryRun?: boolean;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401 });
  }

  const { id } = await params;

  await connectToDatabase();

  const booking = await Booking.findById(id);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const member = await Member.findOne({ clerkUserId: userId });
  if (!member || String(booking.member) !== String(member._id)) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (booking.status !== 'reserved') {
    return NextResponse.json({ error: 'Only reserved bookings can be modified' }, { status: 400 });
  }

  const body: ModifyPayload = await req.json();
  const inventoryId = body.inventoryId ?? booking.inventoryId;
  const vendorId = body.vendorId ?? booking.vendorId;
  const from = body.from ?? booking.from.toISOString();
  const to = body.to ?? booking.to.toISOString();

  const quote = await quoteModification({ vendorId, inventoryId, from, to });
  if (!quote) {
    return NextResponse.json({ error: 'Inventory or negotiated rate not found' }, { status: 400 });
  }

  const nights = Math.max(
    1,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)),
  );

  const [addOnsCatalog, waivedAddOnIds] = await Promise.all([
    getAddOnsCatalog(),
    getWaivedAddOnIds(quote.perkIds),
  ]);

  const existingAddonIds: string[] = booking.pricingSnapshot.addonIds ?? [];
  const reFilteredAddonIds = existingAddonIds.filter((id) => !waivedAddOnIds.has(id));
  const addonTotal = addOnsCatalog
    .filter((a) => reFilteredAddonIds.includes(a.addon_id))
    .reduce((sum, a) => sum + (a.fee_per_day ?? 0) * nights, 0);

  const newTotalPrice = quote.dailyRate * nights + addonTotal;
  const deltaCents =
    Math.round(newTotalPrice * 100) - Math.round(booking.pricingSnapshot.totalPrice * 100);

  if (body.dryRun === true) {
    return NextResponse.json({ deltaCents, newTotalPrice }, { status: 200 });
  }

  const stripeAPI = getStripe();

  if (deltaCents > 0) {
    if (!body.paymentIntentId) {
      return NextResponse.json(
        { error: 'Payment does not cover the price increase' },
        { status: 400 },
      );
    }

    const paymentIntent = await stripeAPI.paymentIntents.retrieve(body.paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json(
        { error: 'Payment does not cover the price increase' },
        { status: 400 },
      );
    }

    if (Math.abs(paymentIntent.amount - deltaCents) > 1) {
      return NextResponse.json(
        {
          error: 'Payment does not cover the price increase',
          note: 'If you were charged, contact support — this modification was not applied',
        },
        { status: 400 },
      );
    }
  }

  let refundId: string | null = null;
  let refundAmountCents = 0;
  if (deltaCents < 0) {
    if (!booking.paymentIntentId) {
      return NextResponse.json({ error: 'Could not apply this change' }, { status: 500 });
    }
    try {
      const paymentIntent = await stripeAPI.paymentIntents.retrieve(booking.paymentIntentId, {
        expand: ['latest_charge'],
      });
      const latestCharge =
        typeof paymentIntent.latest_charge === 'object' ? paymentIntent.latest_charge : null;
      const amountRefunded = latestCharge?.amount_refunded ?? 0;
      refundAmountCents = Math.min(-deltaCents, paymentIntent.amount - amountRefunded);
      if (refundAmountCents > 0) {
        const refund = await stripeAPI.refunds.create(
          {
            payment_intent: booking.paymentIntentId,
            amount: refundAmountCents,
          },
          { idempotencyKey: `modify-refund-${booking._id}-${booking.modificationHistory.length}` },
        );
        refundId = refund.id;
      }
    } catch {
      return NextResponse.json({ error: 'Could not apply this change' }, { status: 500 });
    }
  }

  booking.modificationHistory.push({
    from: booking.from,
    to: booking.to,
    inventoryId: booking.inventoryId,
    vendorId: booking.vendorId,
    pricingSnapshot: booking.pricingSnapshot,
    refundId,
    refundAmountCents,
  });

  booking.inventoryId = inventoryId;
  booking.vendorId = vendorId;
  booking.from = new Date(from);
  booking.to = new Date(to);
  booking.pricingSnapshot = {
    negotiatedTermId: quote.negotiatedTermId,
    dailyRate: quote.dailyRate,
    currency: quote.currency,
    perkIds: quote.perkIds,
    addonIds: reFilteredAddonIds,
    addonTotal,
    totalPrice: newTotalPrice,
  };

  await booking.save();

  return NextResponse.json(
    { bookingId: String(booking._id), totalPrice: newTotalPrice, deltaCents, refundAmountCents, refundId },
    { status: 200 },
  );
}
