import { Schema, model, models, type InferSchemaType } from 'mongoose';

const vendorSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "can't be blank"],
      trim: true,
    },
    minimumRentalDays: {
      type: Number,
      default: 1,
    },
    priceChangeRate: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'Vendor',
  },
);

export type VendorDoc = InferSchemaType<typeof vendorSchema>;

const Vendor = models.Vendor || model('Vendor', vendorSchema);

export default Vendor;
