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

export function SearchFilters({
  vehicleClasses,
  locations,
  providers,
  defaultLocation,
  defaultPickupDate,
  defaultReturnDate,
  defaultVehicleClass,
  defaultDropOffLocation,
  defaultProviders,
}: {
  vehicleClasses: string[];
  locations: string[];
  providers: string[];
  defaultLocation: string;
  defaultPickupDate: string;
  defaultReturnDate: string;
  defaultVehicleClass: string;
  defaultDropOffLocation: string;
  defaultProviders: string[];
}) {
  const router = useRouter();
  const [location, setLocation] = useState(defaultLocation);
  const [pickupDate, setPickupDate] = useState(defaultPickupDate);
  const [returnDate, setReturnDate] = useState(defaultReturnDate);
  const [vehicleClass, setVehicleClass] = useState(defaultVehicleClass || 'All');
  const [sameLocation, setSameLocation] = useState(!defaultDropOffLocation);
  const [dropOffLocation, setDropOffLocation] = useState(defaultDropOffLocation);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set(defaultProviders));
  const [error, setError] = useState<string | null>(null);

  function toggleProvider(provider: string) {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }

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
    if (selectedProviders.size > 0) params.set('providers', Array.from(selectedProviders).join(','));
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Pickup location</label>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City or airport"
          className="w-full"
          aria-label="Pickup location"
          list="filters-pickup-location-options"
          required
        />
        <datalist id="filters-pickup-location-options">
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
            className="w-full"
            aria-label="Drop-off location"
            required
            list="filters-dropoff-location-options"
          />
          <datalist id="filters-dropoff-location-options">
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
        <label className="text-xs text-muted-foreground">Vehicle type</label>
        <Select value={vehicleClass} onValueChange={(value) => setVehicleClass(value ?? 'All')}>
          <SelectTrigger className="w-full">
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

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Suppliers</label>
        <div className="flex flex-col gap-1">
          {providers.map((provider) => (
            <label key={provider} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedProviders.has(provider)}
                onChange={() => toggleProvider(provider)}
              />
              {provider}
            </label>
          ))}
        </div>
      </div>

      <Button type="submit" className="w-full">
        Search
      </Button>
    </form>
  );
}
