'use client';

import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingModifyForm } from '@/components/booking-modify-form';

interface BookingModifyDialogProps {
  bookingId: string;
  from: string;
  to: string;
  receiptEmail: string;
}

export function BookingModifyDialog({ bookingId, from, to, receiptEmail }: BookingModifyDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="secondary" size="sm">
            <Pencil className="size-4" strokeWidth={1.5} /> Modify
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modify booking</DialogTitle>
        </DialogHeader>
        <BookingModifyForm
          bookingId={bookingId}
          from={from}
          to={to}
          receiptEmail={receiptEmail}
        />
      </DialogContent>
    </Dialog>
  );
}
