'use client';

import { useState } from 'react';
import { Car, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SearchFormFields } from '@/components/search-form-fields';
import { CLASS_IMAGE_MAP } from '@/lib/vehicle-images';

const PAGE_SIZE = 6;

function CarouselImage({ className }: { className: string }) {
  const [errored, setErrored] = useState(false);
  const src = CLASS_IMAGE_MAP[className];

  if (errored || !src) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5">
        <Car className="size-10 text-primary/60" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={className}
      className="h-32 w-full rounded-lg object-cover"
      onError={() => setErrored(true)}
    />
  );
}

export function VehicleTypeCarousel({
  items,
  locations,
}: {
  items: { className: string; minRate: number }[];
  locations: string[];
}) {
  const [page, setPage] = useState(0);
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const visible = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-4">
        {visible.map((v) => (
          <button
            key={v.className}
            type="button"
            onClick={() => setActiveClass(v.className)}
            className="w-56 shrink-0 rounded-xl bg-card p-3 text-left ring-1 ring-foreground/10"
          >
            <CarouselImage className={v.className} />
            <div className="mt-2 font-heading text-base font-medium">{v.className}</div>
            <span className="text-sm text-muted-foreground">from ${v.minRate}/day</span>
          </button>
        ))}
      </div>

      <Dialog open={activeClass !== null} onOpenChange={(open) => !open && setActiveClass(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Find {activeClass && /^[aeiou]/i.test(activeClass) ? 'an' : 'a'} {activeClass} car
            </DialogTitle>
            <DialogDescription>
              Choose your pickup location and dates to see availability and your member rate.
            </DialogDescription>
          </DialogHeader>
          {activeClass && (
            <SearchFormFields
              vehicleClasses={items.map((i) => i.className)}
              locations={locations}
              defaultVehicleClass={activeClass}
              idPrefix="carousel-modal"
              submitLabel="Search"
              onSubmitted={() => setActiveClass(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      {pageCount > 1 && (
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Previous"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page === pageCount - 1}
            aria-label="Next"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
