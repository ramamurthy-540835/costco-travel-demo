import { BOOKING_STATUS } from '@/lib/models/Booking';

export type BookingStatus = (typeof BOOKING_STATUS)[number];

export interface Member {
  _id: string;
  clerkUserId: string;
  email: string;
  phone?: string;
  fullName: string;
  birthDate?: Date;
  membershipTierId?: string;
  avatar?: string;
}

export interface Location {
  _id: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
}

export interface Inventory {
  _id: string;
  vendorId: string;
  dailyPrice: number;
  deposit: number;
  type: string;
  gearbox: string;
  seats: number;
  mileage: number;
  available: boolean;
}

export interface Vendor {
  _id: string;
  name: string;
  minimumRentalDays?: number;
  priceChangeRate?: number;
}

export interface Booking {
  member: string;
  inventoryId: string;
  vendorId: string;
  from: Date;
  to: Date;
  status: BookingStatus;
}

export interface PaymentResult {
  paymentIntentId: string;
  customerId: string;
  clientSecret: string | null;
}

export interface CreatePaymentPayload {
  amount: number;
  currency: string;
  receiptEmail: string;
  description?: string;
  customerName?: string;
}
