import { NextRequest, NextResponse } from 'next/server';
import getStripe from '@/lib/payment/stripe';

interface CreatePaymentPayload {
  amount: number;
  currency: string;
  receiptEmail: string;
  description?: string;
  customerName?: string;
}

export async function POST(req: NextRequest) {
  const body: CreatePaymentPayload = await req.json();
  const { amount, currency, receiptEmail, description, customerName } = body;

  if (!amount || !currency) {
    return NextResponse.json({ error: 'amount and currency are required' }, { status: 400 });
  }

  const stripeAPI = getStripe();

  const customers = await stripeAPI.customers.list({ email: receiptEmail });

  const customer = customers.data.length > 0
    ? customers.data[0]
    : await stripeAPI.customers.create({ email: receiptEmail, name: customerName });

  const paymentIntent = await stripeAPI.paymentIntents.create({
    amount: Math.floor(amount * 100),
    currency: currency.toLowerCase(),
    receipt_email: receiptEmail,
    description,
    customer: customer.id,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
  });

  return NextResponse.json({
    paymentIntentId: paymentIntent.id,
    customerId: customer.id,
    clientSecret: paymentIntent.client_secret,
  });
}
