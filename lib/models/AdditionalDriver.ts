import validator from 'validator';
import { Schema, model, models, type InferSchemaType } from 'mongoose';

const additionalDriverSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, "can't be blank"],
      index: true,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      required: [true, "can't be blank"],
      validate: [validator.isEmail, 'is not valid'],
      index: true,
      trim: true,
    },
    phone: {
      type: String,
      validate: {
        validator: (value: string) => (value ? validator.isMobilePhone(value) : false),
        message: '{VALUE} is not valid',
      },
      trim: true,
    },
    birthDate: {
      type: Date,
      required: [true, "can't be blank"],
    },
  },
  {
    timestamps: true,
    strict: true,
    collection: 'AdditionalDriver',
  },
);

export type AdditionalDriverDoc = InferSchemaType<typeof additionalDriverSchema>;

const AdditionalDriver = models.AdditionalDriver || model('AdditionalDriver', additionalDriverSchema);

export default AdditionalDriver;
