'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const PICKUP_OFFSET_DAYS = 14;
const RETURN_OFFSET_DAYS = 17;

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toDateInputValue(d);
}

export function SearchFormFields({
  vehicleClasses,
  locations,
  defaultVehicleClass,
  idPrefix = 'search',
  submitLabel = 'Search cars',
  onSubmitted,
}: {
  vehicleClasses: string[];
  locations: string[];
  defaultVehicleClass?: string;
  idPrefix?: string;
  submitLabel?: string;
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [pickupDate, setPickupDate] = useState(() => defaultDate(PICKUP_OFFSET_DAYS));
  const [returnDate, setReturnDate] = useState(() => defaultDate(RETURN_OFFSET_DAYS));
  const [vehicleClass, setVehicleClass] = useState(defaultVehicleClass || 'All');
  const [sameLocation, setSameLocation] = useState(true);
  const [dropOffLocation, setDropOffLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!location.trim()) {
      setError('Pickup location is required.');
      return;
    }
    if (!sameLocation && !dropOffLocation.trim()) {
      setError('Drop-off location is required when returning to a different location.');
      return;
    }
    setError(null);

    const params = new URLSearchParams();
    params.set('location', location.trim());
    if (pickupDate) params.set('pickupDate', pickupDate);
    if (returnDate) params.set('returnDate', returnDate);
    if (vehicleClass !== 'All') params.set('vehicleClass', vehicleClass);
    if (!sameLocation && dropOffLocation) params.set('dropOffLocation', dropOffLocation.trim());
    router.push(`/search?${params.toString()}`);
    onSubmitted?.();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-wrap items-start justify-center gap-4 text-left"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Pickup location</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City or airport"
            className="w-48"
            aria-label="Pickup location"
            list={`${idPrefix}-pickup-location-options`}
            required
          />
          <datalist id={`${idPrefix}-pickup-location-options`}>
            {locations.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        </div>
        {!sameLocation && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Drop-off location</label>
            <Input
              value={dropOffLocation}
              onChange={(e) => setDropOffLocation(e.target.value)}
              placeholder="City or airport"
              className="w-48"
              aria-label="Drop-off location"
              required
              list={`${idPrefix}-dropoff-location-options`}
            />
            <datalist id={`${idPrefix}-dropoff-location-options`}>
              {locations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={sameLocation}
            onChange={(e) => {
              setSameLocation(e.target.checked);
              setError(null);
            }}
          />
          Return to the same location
        </label>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Pickup date</label>
        <Input
          type="date"
          value={pickupDate}
          onChange={(e) => setPickupDate(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Return date</label>
        <Input
          type="date"
          value={returnDate}
          onChange={(e) => setReturnDate(e.target.value)}
          className="w-44"
        />
      </div>
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Vehicle type</label>
          <Select value={vehicleClass} onValueChange={(value) => setVehicleClass(value ?? 'All')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Vehicles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Vehicles</SelectItem>
              {vehicleClasses.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="lg">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
