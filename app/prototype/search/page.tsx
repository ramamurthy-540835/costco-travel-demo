'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Cog, DoorOpen, Fuel, Snowflake, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { VehicleImage } from '../vehicle-image';
import { mockVehicleClasses } from '../mock-data';
import { LocationAutocomplete } from '../location-autocomplete';

const nights = 3;

export default function PrototypeSearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const searchParams = useSearchParams();
  const [location, setLocation] = useState(() => searchParams.get('location') ?? '');
  const [pickupDate, setPickupDate] = useState(() => searchParams.get('pickupDate') ?? '');
  const [returnDate, setReturnDate] = useState(() => searchParams.get('returnDate') ?? '');
  const [vehicleType, setVehicleType] = useState<string>(
    () => searchParams.get('vehicleType') ?? 'all',
  );

  const results = useMemo(() => {
    if (vehicleType === 'all') return mockVehicleClasses;
    return mockVehicleClasses.filter((v) => v.class_name === vehicleType);
  }, [vehicleType]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-heading text-2xl font-medium">Find your car</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your negotiated rate and included perks are shown for every result.
      </p>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 lg:sticky lg:top-4 lg:h-fit lg:w-72">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Pickup location</label>
            <LocationAutocomplete value={location} onChange={setLocation} className="w-full" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Pickup date</label>
            <Input
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Return date</label>
            <Input
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Vehicle class</label>
            <Select value={vehicleType} onValueChange={(value) => setVehicleType(value ?? 'all')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {mockVehicleClasses.map((v) => (
                  <SelectItem key={v.id} value={v.class_name}>
                    {v.class_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {results.length} car{results.length === 1 ? '' : 's'} available
          </p>
        </aside>

        <div className="flex flex-1 flex-col gap-4">
          {results.map((v) => (
            <div
              key={v.id}
              className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row"
            >
              <VehicleImage
                vehicleClass={v.class_name}
                alt={v.class_name}
                className="h-32 w-full shrink-0 rounded-lg sm:h-auto sm:w-48"
              />

              <div className="flex flex-1 flex-col gap-2">
                <h2 className="font-heading text-lg font-medium">{v.class_name}</h2>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Fuel className="size-4" strokeWidth={1.5} /> {v.fuelType}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Cog className="size-4" strokeWidth={1.5} /> {v.transmission}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" strokeWidth={1.5} /> {v.seats}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DoorOpen className="size-4" strokeWidth={1.5} /> {v.doors}
                  </span>
                  {v.hasAC && (
                    <span className="flex items-center gap-1.5">
                      <Snowflake className="size-4" strokeWidth={1.5} /> A/C
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">Mileage: {v.mileage}</p>

                <div className="flex flex-col gap-0.5">
                  {v.perks.map((p) => (
                    <span key={p.perk_id} className="text-sm text-muted-foreground">
                      ✓ {p.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col justify-between gap-3 sm:items-end sm:text-right">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Price for {nights} days: ${v.dailyRate * nights}
                  </p>
                  <p className="font-heading text-lg font-medium">${v.dailyRate}/day</p>
                </div>

                <div className="flex w-full items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-2">
                  <span className="text-sm text-muted-foreground">
                    {v.vendorName} · ★ {v.rating} ({v.tripCount} trips)
                  </span>
                  <Button
                    size="sm"
                    render={<Link href={`/prototype/vehicle/${v.id}`}>Choose this car</Link>}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
