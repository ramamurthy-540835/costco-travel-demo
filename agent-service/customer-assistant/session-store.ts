import mongoose, { Schema } from 'mongoose';
import connectToDatabase from '../../lib/mongodb';

export type ConversationState =
  | 'searching'
  | 'quoted'
  | 'confirming'
  | 'booked'
  | 'modifying'
  | 'cancelling';

export interface PendingProposal {
  tool: string;
  args: Record<string, unknown>;
  consumed: boolean;
  expiresAt: Date;
}

export interface HistoryEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ConversationSessionDoc extends mongoose.Document {
  conversation_id: string;
  memberId: string;
  state: ConversationState;
  pendingProposal: PendingProposal | null;
  compactedHistory: HistoryEntry[];
}

const PendingProposalSchema = new Schema<PendingProposal>(
  {
    tool: { type: String, required: true },
    args: { type: Schema.Types.Mixed, required: true },
    consumed: { type: Boolean, required: true, default: false },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const HistoryEntrySchema = new Schema<HistoryEntry>(
  {
    role: { type: String, enum: ['user', 'assistant', 'tool'], required: true },
    content: { type: String, required: true },
  },
  { _id: false },
);

const ConversationSessionSchema = new Schema<ConversationSessionDoc>({
  conversation_id: { type: String, required: true, unique: true },
  memberId: { type: String, required: true },
  state: {
    type: String,
    enum: ['searching', 'quoted', 'confirming', 'booked', 'modifying', 'cancelling'],
    required: true,
    default: 'searching',
  },
  pendingProposal: { type: PendingProposalSchema, default: null },
  compactedHistory: { type: [HistoryEntrySchema], default: [] },
});

const ConversationSession =
  (mongoose.models.ConversationSession as mongoose.Model<ConversationSessionDoc>) ||
  mongoose.model<ConversationSessionDoc>('ConversationSession', ConversationSessionSchema);

const PENDING_PROPOSAL_TTL_MS = 5 * 60 * 1000;

export async function getOrCreateSession(
  conversationId: string,
  memberId: string,
): Promise<ConversationSessionDoc> {
  await connectToDatabase();
  const existing = await ConversationSession.findOne({ conversation_id: conversationId });
  if (existing) return existing;
  return ConversationSession.create({
    conversation_id: conversationId,
    memberId,
    state: 'searching',
    pendingProposal: null,
    compactedHistory: [],
  });
}

export async function savePendingProposal(
  conversationId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<void> {
  await connectToDatabase();
  await ConversationSession.findOneAndUpdate(
    { conversation_id: conversationId },
    {
      $set: {
        pendingProposal: {
          tool,
          args,
          consumed: false,
          expiresAt: new Date(Date.now() + PENDING_PROPOSAL_TTL_MS),
        },
      },
    },
  );
}

// A single atomic findOneAndUpdate — the match condition (tool, args,
// not-yet-consumed, not-yet-expired) is embedded directly in the filter, and
// the update flips `consumed: true` in the same operation. This closes two
// races: (a) a mismatched confirm call touches nothing, so it can never
// destroy a still-valid pending proposal; (b) two concurrent confirms for the
// same proposal can't both succeed — only one findOneAndUpdate can flip
// consumed false -> true, the second finds no matching document.
// `matchArgs` is matched field-by-field via dot-paths (`pendingProposal.args.<key>`),
// not as whole-embedded-document equality — the caller passes only the
// identity fields it trusts (e.g. bookingId, or an opaque paymentIntentId),
// so a model restating/adding/omitting incidental fields at confirm time
// can never cause a false mismatch. Whole-document equality was tried first
// and rejected: a subset object can never `===` the full stored args object
// under Mongo's exact-embedded-doc comparison.
export async function consumePendingProposal(
  conversationId: string,
  tool: string,
  matchArgs: Record<string, unknown>,
): Promise<ConversationSessionDoc | null> {
  await connectToDatabase();
  const argFilters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(matchArgs)) {
    argFilters[`pendingProposal.args.${key}`] = value;
  }
  return ConversationSession.findOneAndUpdate(
    {
      conversation_id: conversationId,
      'pendingProposal.tool': tool,
      ...argFilters,
      'pendingProposal.consumed': false,
      'pendingProposal.expiresAt': { $gt: new Date() },
    },
    { $set: { 'pendingProposal.consumed': true } },
    { new: true },
  );
}

export async function appendHistory(conversationId: string, entry: HistoryEntry): Promise<void> {
  await connectToDatabase();
  await ConversationSession.findOneAndUpdate(
    { conversation_id: conversationId },
    { $push: { compactedHistory: entry } },
  );
}

export async function setState(conversationId: string, state: ConversationState): Promise<void> {
  await connectToDatabase();
  await ConversationSession.findOneAndUpdate({ conversation_id: conversationId }, { $set: { state } });
}
