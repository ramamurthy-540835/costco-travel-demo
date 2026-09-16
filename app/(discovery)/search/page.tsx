import { searchInventory } from '@/lib/graph/queries';
import { VehicleCard } from '@/components/vehicle-card';
import { SearchFilters } from '@/components/search-filters';
import { SearchFormFields } from '@/components/search-form-fields';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string;
    vehicleClass?: string;
    pickupDate?: string;
    returnDate?: string;
    dropOffLocation?: string;
    providers?: string;
  }>;
}) {
  const params = await searchParams;
  const location = params.location ?? '';
  const vehicleClass = params.vehicleClass ?? 'All';
  const pickupDate = params.pickupDate ?? '';
  const returnDate = params.returnDate ?? '';
  const dropOffLocation = params.dropOffLocation ?? '';
  const selectedProviders = params.providers ? params.providers.split(',').filter(Boolean) : [];

  const [results, allResults] = await Promise.all([
    searchInventory(location || undefined),
    searchInventory(),
  ]);
  const classNames = Array.from(new Set(allResults.map((r) => r.vehicleClass.class_name))).sort();
  const locations = Array.from(
    new Set(allResults.map((r) => r.location?.city).filter((c): c is string => Boolean(c))),
  ).sort();
  const providers = Array.from(new Set(allResults.map((r) => r.vendor.provider))).sort();

  if (!location.trim()) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-heading text-2xl font-medium">Choose your pickup location and dates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select where and when you need the car to see availability and your member rate.
        </p>
        <div className="mt-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <SearchFormFields
            vehicleClasses={classNames}
            locations={locations}
            defaultVehicleClass={vehicleClass !== 'All' ? vehicleClass : undefined}
            idPrefix="search-gate"
          />
        </div>
      </main>
    );
  }

  const filtered = results
    .filter((r) => vehicleClass === 'All' || r.vehicleClass.class_name === vehicleClass)
    .filter((r) => selectedProviders.length === 0 || selectedProviders.includes(r.vendor.provider));

  let nights = 3;
  if (pickupDate && returnDate) {
    const from = new Date(pickupDate);
    const to = new Date(returnDate);
    const diff = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) nights = diff;
  }

  const returnToParams = new URLSearchParams();
  returnToParams.set('location', location);
  if (pickupDate) returnToParams.set('pickupDate', pickupDate);
  if (returnDate) returnToParams.set('returnDate', returnDate);
  if (vehicleClass !== 'All') returnToParams.set('vehicleClass', vehicleClass);
  if (dropOffLocation) returnToParams.set('dropOffLocation', dropOffLocation);
  if (selectedProviders.length > 0) returnToParams.set('providers', selectedProviders.join(','));
  const returnTo = `/search?${returnToParams.toString()}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-heading text-2xl font-medium">Find your car</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your negotiated rate and included perks are shown for every result.
      </p>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <aside className="flex w-full flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 lg:sticky lg:top-4 lg:h-fit lg:w-72">
          <SearchFilters
            vehicleClasses={classNames}
            locations={locations}
            providers={providers}
            defaultLocation={location}
            defaultPickupDate={pickupDate}
            defaultReturnDate={returnDate}
            defaultVehicleClass={vehicleClass}
            defaultDropOffLocation={dropOffLocation}
            defaultProviders={selectedProviders}
          />
          <p className="text-sm text-muted-foreground">
            {filtered.length} car{filtered.length === 1 ? '' : 's'} available
          </p>
        </aside>

        <div className="flex flex-1 flex-col gap-4">
          {filtered.map((result) => (
            <VehicleCard
              key={result.inventory.rental_id as string}
              result={result}
              nights={nights}
              pickupDate={pickupDate || undefined}
              returnDate={returnDate || undefined}
              returnTo={returnTo}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
