import { CarFront, ShieldCheck, Tags } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VehicleImage } from '../vehicle-image';
import { mockVehicleClasses, mockVendors } from '../mock-data';
import { LandingSearchForm } from './landing-search-form';

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

export default function PrototypeLandingPage() {
  return (
    <main>
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
          <LandingSearchForm />
        </div>
      </section>

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

      <section className="mx-auto max-w-5xl px-4 py-14">
        <h2 className="font-heading text-xl font-medium">Our rental partners</h2>
        <div className="mt-4 flex flex-wrap gap-4">
          {mockVendors.map((vendor) => (
            <div
              key={vendor.id}
              className="flex min-w-32 flex-1 items-center justify-center rounded-xl bg-card px-6 py-5 ring-1 ring-foreground/10"
            >
              <span className="font-heading text-lg font-medium text-foreground/80">
                {vendor.name}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14">
        <h2 className="font-heading text-xl font-medium">Browse by vehicle type</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {mockVehicleClasses.slice(0, 3).map((v) => (
            <Card key={v.id}>
              <VehicleImage vehicleClass={v.class_name} alt={v.class_name} className="h-24" />
              <CardHeader>
                <CardTitle>{v.class_name}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-muted-foreground">from ${v.dailyRate}/day</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
