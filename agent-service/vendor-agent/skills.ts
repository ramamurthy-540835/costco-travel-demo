import type { Task } from './server';
import connectToDatabase from '../../lib/mongodb';
import {
  quoteModification,
  checkAvailability,
  checkModificationCutoff,
  quoteCancellation,
} from '../../lib/vendor-integration/policy';
import { getVendorPolicy } from '../../lib/graph/queries';

function completed(id: string, result: unknown): Task {
  return { id, status: { state: 'completed' }, result };
}

function failed(id: string, message: string): Task {
  return { id, status: { state: 'failed', message } };
}

type Handler = (args: any) => Promise<Task>;

export const SKILLS: Record<string, Handler> = {
  async check_availability(args) {
    const id = `check_availability-${Date.now()}`;
    try {
      await connectToDatabase();
      const available = await checkAvailability({
        inventoryId: args.inventoryId,
        from: new Date(args.from),
        to: new Date(args.to),
      });
      return completed(id, { available });
    } catch (err) {
      return failed(id, err instanceof Error ? err.message : String(err));
    }
  },

  async apply_modification(args) {
    const id = `apply_modification-${Date.now()}`;
    try {
      await connectToDatabase();
      const quote = await quoteModification({
        vendorId: args.vendorId,
        inventoryId: args.inventoryId,
        from: args.from,
        to: args.to,
      });
      if (!quote) {
        return failed(id, `No negotiated term found for vendorId=${args.vendorId} inventoryId=${args.inventoryId}`);
      }

      const cutoff = await checkModificationCutoff(args.vendorId, new Date(args.from));
      if (!cutoff.allowed) {
        return failed(id, `Modification cutoff violated: requires ${cutoff.cutoffHours}h notice`);
      }

      return completed(id, { quote, cutoff });
    } catch (err) {
      return failed(id, err instanceof Error ? err.message : String(err));
    }
  },

  async apply_cancellation(args) {
    const id = `apply_cancellation-${Date.now()}`;
    try {
      const quote = await quoteCancellation({
        vendorId: args.vendorId,
        hoursUntilStart: Number(args.hoursUntilStart),
      });
      if (!quote) {
        return failed(id, `Unknown vendorId: ${args.vendorId}`);
      }
      return completed(id, quote);
    } catch (err) {
      return failed(id, err instanceof Error ? err.message : String(err));
    }
  },

  async get_vendor_policy(args) {
    const id = `get_vendor_policy-${Date.now()}`;
    try {
      const policy = await getVendorPolicy(args.vendorId);
      if (!policy) {
        return failed(id, `Unknown vendorId: ${args.vendorId}`);
      }
      return completed(id, policy);
    } catch (err) {
      return failed(id, err instanceof Error ? err.message : String(err));
    }
  },
};
