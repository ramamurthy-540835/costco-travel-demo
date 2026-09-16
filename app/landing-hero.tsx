'use client';

import { SearchFormFields } from '@/components/search-form-fields';

export function LandingHero({
  vehicleClasses,
  locations,
}: {
  vehicleClasses: string[];
  locations: string[];
}) {
  return (
    <section
      className="relative flex flex-col items-center gap-4 px-4 py-24 text-center"
      style={{
        backgroundImage:
          "url('https://commons.wikimedia.org/wiki/Special:FilePath/Highway%20Sunset%20PLC-HW-11.jpg?width=1600')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 to-black/45" />
      <div className="relative flex flex-col items-center gap-4">
        <h1 className="font-heading text-3xl font-medium text-white sm:text-4xl">
          Find your next rental car in seconds.
        </h1>
        <p className="max-w-xl text-sm text-white/85">
          Your member rate and included perks are applied automatically — across every major
          rental brand.
        </p>
        <div className="mt-2 w-full max-w-5xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <SearchFormFields
            vehicleClasses={vehicleClasses}
            locations={locations}
            idPrefix="hero"
          />
        </div>
      </div>
    </section>
  );
}
