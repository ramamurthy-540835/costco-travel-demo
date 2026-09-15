import { CarFront, ShieldCheck, Tags } from 'lucide-react';
import { searchInventory } from '@/lib/graph/queries';
import { LandingHero } from './landing-hero';
import { VehicleTypeCarousel } from '@/components/vehicle-type-carousel';
import { VendorMarquee } from '@/components/vendor-marquee';

const whyUs = [
  {
    icon: Tags,
    title: 'Your member rate, guaranteed',
    text: 'The price you see already includes your negotiated discount — no surprises at pickup.',
  },
  {
    icon: ShieldCheck,
    title: 'No hidden charges',
    text: "If a perk is already included in your membership, we won't let a vendor upsell it to you.",
  },
  {
    icon: CarFront,
    title: 'One search, every vendor',
    text: 'Compare cars across top rental brands side by side, all in one place.',
  },
];

export default async function Home() {
  const results = await searchInventory();

  const vendors = Array.from(new Map(results.map((r) => [r.vendor.provider, r.vendor])).values());
  const locations = Array.from(
    new Set(results.map((r) => r.location?.city).filter((c): c is string => Boolean(c))),
  );

  const classToMinRate = new Map<string, number>();
  const classOrder: string[] = [];
  for (const r of results) {
    const className = r.vehicleClass.class_name;
    const rate = r.inventory.daily_rate;
    if (typeof rate !== 'number') continue;
    if (!classToMinRate.has(className)) {
      classOrder.push(className);
      classToMinRate.set(className, rate);
    } else {
      classToMinRate.set(className, Math.min(classToMinRate.get(className)!, rate));
    }
  }
  const vehicleTypes = classOrder.map((className) => ({
    className,
    minRate: classToMinRate.get(className)!,
  }));

  return (
    <main>
      <LandingHero vehicleClasses={classOrder} locations={locations} />

      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {whyUs.map((w) => (
            <div key={w.title} className="flex flex-col gap-2">
              <w.icon className="size-6 text-primary" strokeWidth={1.5} />
              <h3 className="font-heading text-base font-medium">{w.title}</h3>
              <p className="text-sm text-muted-foreground">{w.text}</p>
            </div>
          ))}
        </div>
      </section>

      {vendors.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="font-heading text-xl font-medium">Our rental partners</h2>
          <div className="mt-4">
            <VendorMarquee providers={vendors.map((v) => v.provider)} />
          </div>
        </section>
      )}

      {vehicleTypes.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="font-heading text-xl font-medium">Browse by vehicle type</h2>
          <div className="mt-4">
            <VehicleTypeCarousel items={vehicleTypes} locations={locations} />
          </div>
        </section>
      )}
    </main>
  );
}
