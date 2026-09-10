'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Car, Cog, Fuel, Gauge, Timer, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InventorySearchResult } from '@/lib/graph/queries';
import { CLASS_IMAGE_MAP, VEHICLE_IMAGE_MAP } from '@/lib/vehicle-images';
import { BRAND_COLORS } from '@/lib/vendor-brand-colors';

export function CardImage({
  className,
  make,
  model,
  compact = false,
}: {
  className: string;
  make?: string;
  model?: string;
  compact?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const src = (make && model && VEHICLE_IMAGE_MAP[`${make} ${model}`]) || CLASS_IMAGE_MAP[className];
  const alt = make && model ? `${make} ${model}` : className;
  const sizeClasses = compact ? 'h-24 w-full' : 'h-40 w-full sm:h-full sm:w-48';

  if (errored || !src) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 ${sizeClasses}`}
      >
        <Car className={compact ? 'size-6 text-primary/60' : 'size-10 text-primary/60'} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`rounded-lg object-cover ${compact ? sizeClasses : 'h-40 w-full sm:h-auto sm:w-48'}`}
      onError={() => setErrored(true)}
    />
  );
}

export function VehicleCard({
  result,
  nights = 3,
  pickupDate,
  returnDate,
  returnTo,
  compact = false,
}: {
  result: InventorySearchResult;
  nights?: number;
  pickupDate?: string;
  returnDate?: string;
  returnTo?: string;
  compact?: boolean;
}) {
  const { inventory, vehicleClass, vendor, negotiatedTerm, perks } = result;
  const dailyRate = (inventory.daily_rate as number | undefined) ?? 0;
  const accentColor = BRAND_COLORS[vendor.provider] ?? 'transparent';
  const vehicleType = inventory.vehicle_type as string | undefined;
  const fuelPolicy = inventory.fuel_policy as string | undefined;
  const includedMiles = negotiatedTerm?.included_miles as string | number | undefined;
  const cancellationWindow = negotiatedTerm?.cancellation_window_hours as number | undefined;
  const depositAmount = inventory.deposit_amount as number | undefined;
  const make = inventory.vehicle_make as string | undefined;
  const model = inventory.vehicle_model as string | undefined;

  if (compact) {
    return (
      <div
        className="flex flex-col gap-2 rounded-xl border-l-4 bg-card p-3 ring-1 ring-foreground/10"
        style={{ borderLeftColor: accentColor }}
      >
        <CardImage className={vehicleClass.class_name} make={make} model={model} compact />
        <h2 className="text-sm font-medium">{vehicleClass.class_name}</h2>
        {Boolean(make || model) && <p className="text-xs text-muted-foreground">{make} {model}</p>}
        <p className="text-xs text-muted-foreground">
          {vendor.provider}
          {typeof vendor.rating === 'number' ? ` · ★ ${vendor.rating as number}` : ''}
        </p>
        {perks.slice(0, 2).map((p) => (
          <span key={p.perk_id} className="text-xs text-muted-foreground">
            ✓ {p.name as string}
          </span>
        ))}
        <div>
          <p className="text-xs text-muted-foreground">
            {nights} {nights === 1 ? 'day' : 'days'}: ${(dailyRate * nights).toFixed(2)}
          </p>
          <p className="text-base font-medium">${dailyRate.toFixed(2)}/day</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Say &quot;book the {make || model || vehicleClass.class_name}&quot; to reserve this one.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border-l-4 bg-card p-4 ring-1 ring-foreground/10 sm:flex-row"
      style={{ borderLeftColor: accentColor }}
    >
      <CardImage className={vehicleClass.class_name} make={make} model={model} />
      <div className="flex flex-1 flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">{vehicleClass.class_name}</h2>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {typeof inventory.gearbox === 'string' && (
            <span className="flex items-center gap-1.5">
              <Cog className="size-4" strokeWidth={1.5} /> {inventory.gearbox as string}
            </span>
          )}
          {typeof inventory.seats === 'number' && (
            <span className="flex items-center gap-1.5">
              <Users className="size-4" strokeWidth={1.5} /> {inventory.seats as number}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {typeof vehicleType === 'string' && (
            <span className="flex items-center gap-1.5">
              <Car className="size-4" strokeWidth={1.5} /> {vehicleType}
            </span>
          )}
          {typeof fuelPolicy === 'string' && (
            <span className="flex items-center gap-1.5">
              <Fuel className="size-4" strokeWidth={1.5} /> {fuelPolicy}
            </span>
          )}
          {Boolean(includedMiles) && (
            <span className="flex items-center gap-1.5">
              <Gauge className="size-4" strokeWidth={1.5} />{' '}
              {typeof includedMiles === 'number' ? `${includedMiles} mi included` : includedMiles}
            </span>
          )}
          {typeof cancellationWindow === 'number' && (
            <span className="flex items-center gap-1.5">
              <Timer className="size-4" strokeWidth={1.5} /> Free cancel up to {cancellationWindow}h before pickup
            </span>
          )}
          {typeof depositAmount === 'number' && depositAmount > 0 && (
            <span className="flex items-center gap-1.5">
              <Wallet className="size-4" strokeWidth={1.5} /> ${depositAmount.toFixed(2)} deposit
            </span>
          )}
        </div>

        {Boolean(make || model) && (
          <p className="text-sm text-muted-foreground">
            {make} {model}
          </p>
        )}

        <div className="flex flex-col gap-0.5">
          {perks.map((p) => (
            <span key={p.perk_id} className="text-sm text-muted-foreground">
              ✓ {p.name as string}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 sm:items-end sm:text-right">
        <div>
          <p className="text-sm text-muted-foreground">
            Price for {nights} days: ${(dailyRate * nights).toFixed(2)}
          </p>
          <p className="font-heading text-lg font-medium">${dailyRate.toFixed(2)}/day</p>
          {negotiatedTerm && typeof negotiatedTerm.discount_pct === 'number' && (
            <p className="text-xs text-muted-foreground">
              Member rate: {negotiatedTerm.discount_pct as number}% off
            </p>
          )}
        </div>

        <div className="flex w-full items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-2">
          <span className="text-sm text-muted-foreground">
            {vendor.provider}
            {typeof vendor.rating === 'number' ? ` · ★ ${vendor.rating as number}` : ''}
          </span>
          <Button
            size="sm"
            render={
              <Link
                href={`/checkout?inventoryId=${encodeURIComponent(inventory.rental_id)}&vendorId=${encodeURIComponent(vendor.provider)}${
                  pickupDate ? `&from=${encodeURIComponent(pickupDate)}` : ''
                }${returnDate ? `&to=${encodeURIComponent(returnDate)}` : ''}${
                  returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''
                }`}
              />
            }
          >
            Choose this car
          </Button>
        </div>
      </div>
    </div>
  );
}
