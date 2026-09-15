import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VehicleImage } from '../../vehicle-image';
import { getMockVehicleById } from '../../mock-data';

export default async function PrototypeVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vehicle = getMockVehicleById(id);

  if (!vehicle) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/prototype/search" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to search
      </Link>

      <Card className="mt-4">
        <VehicleImage vehicleClass={vehicle.class_name} alt={vehicle.class_name} className="h-56" />
        <CardHeader>
          <CardTitle className="text-xl">{vehicle.class_name}</CardTitle>
          <p className="text-sm text-muted-foreground">{vehicle.vendorName}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Seats</div>
              <div>{vehicle.seats}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Transmission</div>
              <div>{vehicle.transmission}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Mileage</div>
              <div>{vehicle.mileage}</div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-sm text-muted-foreground">Included perks</div>
            <div className="flex flex-wrap gap-1.5">
              {vehicle.perks.map((p) => (
                <Badge key={p.perk_id} variant="secondary">
                  {p.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <span className="font-heading text-lg font-medium">${vehicle.dailyRate}/day</span>
          <Button render={<Link href="/prototype/checkout" />}>Book now</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
