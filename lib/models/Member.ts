import validator from 'validator';
import { Schema, model, models, type InferSchemaType } from 'mongoose';

const memberSchema = new Schema(
  {
    clerkUserId: {
      type: String,
      required: [true, "can't be blank"],
      unique: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      unique: true,
      required: [true, "can't be blank"],
      validate: [validator.isEmail, 'is not valid'],
      index: true,
      trim: true,
    },
    phone: {
      type: String,
      validate: {
        validator: (value: string) => (value ? validator.isMobilePhone(value) : true),
        message: '{VALUE} is not valid',
      },
      trim: true,
    },
    fullName: {
      type: String,
      required: [true, "can't be blank"],
      index: true,
      trim: true,
    },
    birthDate: {
      type: Date,
    },
    // References the graph's MembershipTier node id — not an embedded document,
    // so tier definitions (perks, discounts) stay a single source of truth in the graph.
    membershipTierId: {
      type: String,
    },
    avatar: {
      type: String,
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'Member',
  },
);

export type MemberDoc = InferSchemaType<typeof memberSchema>;

const Member = models.Member || model('Member', memberSchema);

export default Member;
