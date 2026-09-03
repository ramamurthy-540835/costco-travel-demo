'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface BookingCancelDialogProps {
  bookingId: string;
}

export function BookingCancelDialog({ bookingId }: BookingCancelDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [refundPercent, setRefundPercent] = useState<number | null>(null);
  const [refundAmountCents, setRefundAmountCents] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview() {
    setLoadingPreview(true);
    setError(null);
    setRefundPercent(null);
    setRefundAmountCents(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not preview this cancellation.');
        return;
      }
      setRefundPercent(body.refundPercent);
      setRefundAmountCents(body.refundAmountCents);
    } catch {
      setError('Could not preview this cancellation.');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmCancel() {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not cancel this booking.');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not cancel this booking.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadPreview();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Ban className="size-4" strokeWidth={1.5} /> Cancel booking
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel booking</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {loadingPreview && <p className="text-muted-foreground">Checking refund amount…</p>}
          {error && <p className="text-destructive">{error}</p>}
          {!loadingPreview && refundPercent !== null && refundAmountCents !== null && (
            <p>
              You will be refunded{' '}
              <span className="font-medium">
                ${(refundAmountCents / 100).toFixed(2)} ({refundPercent}%)
              </span>{' '}
              if you cancel now.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={confirming}
          >
            Never mind
          </Button>
          <Button
            variant="destructive"
            onClick={confirmCancel}
            disabled={confirming || loadingPreview || refundPercent === null}
          >
            {confirming ? 'Cancelling…' : 'Confirm cancellation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
