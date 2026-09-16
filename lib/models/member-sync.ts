import connectToDatabase from '@/lib/mongodb';
import Member, { type MemberDoc } from '@/lib/models/Member';

export async function getOrCreateMember(
  clerkUserId: string,
  email: string,
  fullName: string,
): Promise<MemberDoc & { _id: unknown }> {
  await connectToDatabase();

  const existing = await Member.findOne({ clerkUserId });
  if (existing) {
    return existing;
  }

  return Member.create({ clerkUserId, email, fullName });
}
