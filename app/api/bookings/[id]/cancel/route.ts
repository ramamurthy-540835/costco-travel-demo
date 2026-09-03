import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import mongoose from 'mongoose';
import getStripe from '@/lib/payment/stripe';
import connectToDatabase from '@/lib/mongodb';
import Booking from '@/lib/models/Booking';
import Member from '@/lib/models/Member';
import { quoteCancellation } from '@/lib/vendor-integration/policy';

interface CancelPayload {
  dryRun?: boolean;
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
    return NextResponse.json({ error: 'Only reserved bookings can be cancelled' }, { status: 400 });
  }

  const body: CancelPayload = await req.json().catch(() => ({}));

  const hoursUntilStart = (booking.from.getTime() - Date.now()) / (1000 * 60 * 60);
  const quote = await quoteCancellation({ vendorId: booking.vendorId, hoursUntilStart });
  if (!quote) {
    return NextResponse.json({ error: 'Vendor cancellation policy not found' }, { status: 400 });
  }

  if (!booking.paymentIntentId) {
    return NextResponse.json({ error: 'No payment on file for this booking' }, { status: 400 });
  }

  const stripeAPI = getStripe();
  const paymentIntent = await stripeAPI.paymentIntents.retrieve(booking.paymentIntentId, {
    expand: ['latest_charge'],
  });
  if (paymentIntent.status !== 'succeeded') {
    return NextResponse.json({ error: 'No successful payment on file for this booking' }, { status: 400 });
  }
  const latestCharge =
    typeof paymentIntent.latest_charge === 'object' ? paymentIntent.latest_charge : null;
  const amountRefunded = latestCharge?.amount_refunded ?? 0;
  if (amountRefunded >= paymentIntent.amount) {
    return NextResponse.json({ error: 'Already fully refunded' }, { status: 400 });
  }

  const refundAmountCents = Math.min(
    Math.round((paymentIntent.amount * quote.refundPercent) / 100),
    paymentIntent.amount - amountRefunded,
  );

  if (body.dryRun === true) {
    return NextResponse.json({ refundPercent: quote.refundPercent, refundAmountCents }, { status: 200 });
  }

  // Atomic claim: only the request that flips `reserved` -> `cancelled` here
  // proceeds to call Stripe. A concurrent loser sees `null` and returns 400
  // without ever calling refunds.create (AC-3).
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'reserved' },
    { status: 'cancelled' },
    { new: false },
  );
  if (!claimed) {
    return NextResponse.json({ error: 'Only reserved bookings can be cancelled' }, { status: 400 });
  }

  let refundId: string | null = null;
  if (refundAmountCents > 0) {
    const refund = await stripeAPI.refunds.create(
      { payment_intent: booking.paymentIntentId, amount: refundAmountCents },
      { idempotencyKey: `cancel-${booking._id}` },
    );
    refundId = refund.id;
  }

  await Booking.findByIdAndUpdate(booking._id, {
    cancellation: {
      cancelledAt: new Date(),
      refundId,
      refundAmountCents,
      refundPercent: quote.refundPercent,
    },
  });

  return NextResponse.json(
    { bookingId: String(booking._id), refundAmountCents, refundPercent: quote.refundPercent },
    { status: 200 },
  );
}
