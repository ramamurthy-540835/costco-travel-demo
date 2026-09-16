'use client';

import { useState } from 'react';
import { Car } from 'lucide-react';
import { cn } from '@/lib/utils';

// Real, class-relevant vehicle photos (Wikimedia Commons, verified 200 via
// Special:FilePath before use). Picked because they actually depict the
// matching car body type — not arbitrary stock placeholders.
const CLASS_IMAGE_MAP: Record<string, string> = {
  Economy:
    'https://commons.wikimedia.org/wiki/Special:FilePath/2024%20BYD%20Seal%2006%20DM-i.jpg?width=400',
  SUV: 'https://commons.wikimedia.org/wiki/Special:FilePath/SUV_Kaiyi_X3.jpg?width=400',
  Compact:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Dongfeng%20Box%2C%20Auto%202025%2C%20Zurich%20%2820251029-P1074503%29.jpg?width=400',
  Premium:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Audi_A6_C7_Limousine_S_line_quattro_Daytonagrau.JPG?width=400',
  Minivan:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Minivan%20Los%20Robles.jpg?width=400',
};

export function VehicleImage({
  vehicleClass,
  alt,
  className,
}: {
  /** Vehicle class name (e.g. "Economy", "SUV") — resolves the matching photo. */
  vehicleClass?: string;
  alt?: string;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const src = vehicleClass ? CLASS_IMAGE_MAP[vehicleClass] : undefined;

  if (errored || !src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5',
          className,
        )}
      >
        <Car className="size-10 text-primary/40" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? 'Vehicle photo'}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn('w-full object-cover', className)}
    />
  );
}
