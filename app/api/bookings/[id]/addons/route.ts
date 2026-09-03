import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import mongoose from 'mongoose';
import getStripe from '@/lib/payment/stripe';
import connectToDatabase from '@/lib/mongodb';
import Booking from '@/lib/models/Booking';
import Member from '@/lib/models/Member';
import { getAddOnsCatalog, getWaivedAddOnIds } from '@/lib/graph/queries';

interface AddonsPayload {
  addonIds?: string[];
  dryRun?: boolean;
  paymentIntentId?: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401 });
  }

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

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

  const body: AddonsPayload = await req.json();
  const requestedAddonIds = body.addonIds ?? [];

  const nights = Math.max(
    1,
    Math.round(
      (booking.to.getTime() - booking.from.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );

  const [addOnsCatalog, waivedAddOnIds] = await Promise.all([
    getAddOnsCatalog(),
    getWaivedAddOnIds(booking.pricingSnapshot.perkIds),
  ]);

  const catalogIds = new Set(addOnsCatalog.map((a) => a.addon_id));
  const chargedAddonIds = requestedAddonIds.filter(
    (addonId) => catalogIds.has(addonId) && !waivedAddOnIds.has(addonId),
  );

  const newAddonTotal = addOnsCatalog
    .filter((a) => chargedAddonIds.includes(a.addon_id))
    .reduce((sum, a) => sum + (a.fee_per_day ?? 0) * nights, 0);

  const newTotalPrice = booking.pricingSnapshot.dailyRate * nights + newAddonTotal;
  const deltaCents =
    Math.round(newTotalPrice * 100) - Math.round(booking.pricingSnapshot.totalPrice * 100);

  if (body.dryRun === true) {
    return NextResponse.json({ deltaCents, newTotalPrice, chargedAddonIds }, { status: 200 });
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
          note: 'If you were charged, contact support — this change was not applied',
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
          { idempotencyKey: `addons-refund-${booking._id}-${booking.modificationHistory.length}` },
        );
        refundId = refund.id;
      }
    } catch {
      return NextResponse.json({ error: 'Could not apply this change' }, { status: 500 });
    }
  }

  const claimed = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: 'reserved',
      'pricingSnapshot.totalPrice': booking.pricingSnapshot.totalPrice,
    },
    {
      $set: {
        'pricingSnapshot.addonIds': chargedAddonIds,
        'pricingSnapshot.addonTotal': newAddonTotal,
        'pricingSnapshot.totalPrice': newTotalPrice,
      },
      $push: {
        modificationHistory: {
          from: booking.from,
          to: booking.to,
          inventoryId: booking.inventoryId,
          vendorId: booking.vendorId,
          pricingSnapshot: booking.pricingSnapshot,
          refundId,
          refundAmountCents,
        },
      },
    },
    { new: true },
  );

  if (!claimed) {
    return NextResponse.json(
      {
        error: 'This booking changed, please retry',
        note:
          refundId
            ? `A refund of $${(refundAmountCents / 100).toFixed(2)} (${refundId}) was already issued for this request — contact support if it does not appear.`
            : undefined,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      bookingId: String(claimed._id),
      totalPrice: newTotalPrice,
      deltaCents,
      chargedAddonIds,
      refundAmountCents,
      refundId,
    },
    { status: 200 },
  );
}
