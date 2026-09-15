import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMockVehicleById, mockBookings } from '../mock-data';

const statusVariant = {
  upcoming: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
} as const;

const statusLabel = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const;

export default async function PrototypeBookingsPage() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to see your bookings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Your reservations are tied to your account. Sign in or create an account to view
              them here.
            </p>
            <div className="flex gap-3">
              <Button render={<Link href="/sign-in" />}>Sign in</Button>
              <Button variant="secondary" render={<Link href="/sign-up" />}>
                Sign up
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-heading text-2xl font-medium">My bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your reservations, with your negotiated rate already applied.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {mockBookings.map((booking) => {
          const vehicle = getMockVehicleById(booking.vehicleId);
          if (!vehicle) return null;

          return (
            <Card key={booking.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>
                    {vehicle.class_name} — {vehicle.vendorName}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {booking.startDate} – {booking.endDate}
                  </p>
                </div>
                <Badge variant={statusVariant[booking.status]}>
                  {statusLabel[booking.status]}
                </Badge>
              </CardHeader>
              <CardContent className="flex justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium">${booking.total}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
