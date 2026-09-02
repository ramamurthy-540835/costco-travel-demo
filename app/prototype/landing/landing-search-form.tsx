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
import { mockVehicleClasses } from '../mock-data';
import { LocationAutocomplete } from '../location-autocomplete';

export function LandingSearchForm() {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [vehicleType, setVehicleType] = useState('all');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (location) params.set('location', location);
    if (pickupDate) params.set('pickupDate', pickupDate);
    if (returnDate) params.set('returnDate', returnDate);
    if (vehicleType !== 'all') params.set('vehicleType', vehicleType);
    router.push(`/prototype/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex w-full max-w-3xl flex-wrap items-end justify-center gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Pickup location</label>
        <LocationAutocomplete value={location} onChange={setLocation} className="w-48" />
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
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Vehicle class</label>
        <Select value={vehicleType} onValueChange={(value) => setVehicleType(value ?? 'all')}>
          <SelectTrigger className="w-40">
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
      <Button type="submit" size="lg">
        Search
      </Button>
    </form>
  );
}
