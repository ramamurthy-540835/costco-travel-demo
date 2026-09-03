'use client';

import { PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookingAddonsForm, type AddonCatalogItem } from '@/components/booking-addons-form';

interface BookingAddonsDialogProps {
  bookingId: string;
  receiptEmail: string;
  catalog: AddonCatalogItem[];
  waivedAddonIds: string[];
  currentAddonIds: string[];
}

export function BookingAddonsDialog({
  bookingId,
  receiptEmail,
  catalog,
  waivedAddonIds,
  currentAddonIds,
}: BookingAddonsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="secondary" size="sm">
            <PackagePlus className="size-4" strokeWidth={1.5} /> Manage extras
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage extras</DialogTitle>
        </DialogHeader>
        <BookingAddonsForm
          bookingId={bookingId}
          receiptEmail={receiptEmail}
          catalog={catalog}
          waivedAddonIds={waivedAddonIds}
          currentAddonIds={currentAddonIds}
        />
      </DialogContent>
    </Dialog>
  );
}
