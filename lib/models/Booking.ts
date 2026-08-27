import { Schema, model, models, type InferSchemaType } from 'mongoose';

export const BOOKING_STATUS = [
  'pending',
  'reserved',
  'checked_in',
  'returned',
  'cancelled',
] as const;

const bookingSchema = new Schema(
  {
    member: {
      type: Schema.Types.ObjectId,
      required: [true, "can't be blank"],
      ref: 'Member',
      index: true,
    },
    // Vendor-owned inventory/vendor — this platform never owns a Car document,
    // so these reference the graph's Inventory/Vendor node ids, not a Mongo ref.
    inventoryId: {
      type: String,
      required: [true, "can't be blank"],
      index: true,
    },
    vendorId: {
      type: String,
      required: [true, "can't be blank"],
      index: true,
    },
    from: {
      type: Date,
      required: [true, "can't be blank"],
    },
    to: {
      type: Date,
      required: [true, "can't be blank"],
    },
    status: {
      type: String,
      enum: BOOKING_STATUS,
      required: [true, "can't be blank"],
      default: 'pending',
    },
    additionalDriver: {
      type: Boolean,
      default: false,
    },
    _additionalDriver: {
      type: Schema.Types.ObjectId,
      ref: 'AdditionalDriver',
    },
    // Snapshot of the negotiated price/perks at booking time — a later graph rate
    // change must not retroactively alter an already-confirmed booking.
    pricingSnapshot: {
      negotiatedTermId: { type: String, required: [true, "can't be blank"] },
      dailyRate: { type: Number, required: [true, "can't be blank"] },
      currency: { type: String, required: [true, "can't be blank"] },
      perkIds: { type: [String], default: [] },
      totalPrice: { type: Number, required: [true, "can't be blank"] },
    },
    cancelRequest: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'Booking',
  },
);

bookingSchema.index({ member: 1, status: 1 });
bookingSchema.index({ vendorId: 1, from: 1, to: 1 });
bookingSchema.index({ inventoryId: 1, from: 1, to: 1 });

export type BookingDoc = InferSchemaType<typeof bookingSchema>;

const Booking = models.Booking || model('Booking', bookingSchema);

export default Booking;
