import { test as base, expect, TestInfo } from '@playwright/test';
import mongoose from 'mongoose';
import Member from '@/lib/models/Member';
import Booking from '@/lib/models/Booking';

type TestFixtures = {
  testMember: InstanceType<typeof Member>;
  testBooking: { memberId: mongoose.Types.ObjectId };
};

type WorkerFixtures = {
  mongoClient: typeof mongoose;
};

const withMongo = base.extend<{}, WorkerFixtures>({
  mongoClient: [
    async ({}, use) => {
      const MONGODB_URI = process.env.MONGODB_URI;
      if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is required for regression fixtures (see .env.local)');
      }
      const connection = await mongoose.connect(MONGODB_URI);
      await use(connection);
      await connection.disconnect();
    },
    { scope: 'worker' },
  ],
});

export const test = withMongo.extend<TestFixtures>({
  testMember: async (
    { mongoClient }: { mongoClient: typeof mongoose },
    use: (member: InstanceType<typeof Member>) => Promise<void>,
    testInfo: TestInfo,
  ) => {
    const email = `e2e-${testInfo.testId}@test.local`;
    const member = await Member.create({
      clerkUserId: `e2e-clerk-${testInfo.testId}`,
      email,
      fullName: 'E2E Test Member',
    });

    await use(member);

    await Member.deleteOne({ _id: member._id });
  },

  testBooking: async ({ testMember }, use) => {
    // This fixture does not create a Booking itself — regression specs create
    // bookings through the real checkout flow (UI-driven) so pricingSnapshot
    // integrity is genuinely exercised, not fabricated. This fixture only
    // guarantees cleanup of whatever booking(s) end up owned by testMember.
    await use({ memberId: testMember._id as mongoose.Types.ObjectId });

    await Booking.deleteMany({ member: testMember._id });
  },
});

export { expect };
