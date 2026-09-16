'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { mockVehicleClasses } from '../mock-data';

const bookedVehicle = mockVehicleClasses[0];
const nights = 3;

export default function PrototypeCheckoutPage() {
  const [open, setOpen] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Prototype only — no network call, no real Stripe Elements mount.
    setOpen(true);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/prototype/search" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to search
      </Link>

      <h1 className="mt-4 font-heading text-2xl font-medium">Checkout</h1>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Booking summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vehicle class</span>
              <span>{bookedVehicle.class_name} — {bookedVehicle.vendorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dates</span>
              <span>Sep 12 – Sep 15, 2026</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rate</span>
              <span>
                ${bookedVehicle.dailyRate}/night &times; {nights}
              </span>
            </div>
            <div className="flex justify-between border-t pt-3 font-medium">
              <span>Total</span>
              <span>${bookedVehicle.dailyRate * nights}</span>
            </div>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Payment details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Full name</label>
                <Input required placeholder="Jane Doe" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Email</label>
                <Input required type="email" placeholder="jane@example.com" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Card details</label>
                {/* Stripe Elements mount placeholder — not wired to a live payment intent */}
                <div className="rounded-lg border border-input bg-muted/40 px-2.5 py-3 text-sm text-muted-foreground">
                  Card number, expiry, CVC
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full">
                Confirm booking
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Booking confirmed</DialogTitle>
            <DialogDescription>
              A confirmation email has been sent to your inbox. You can view your reservation
              anytime from your bookings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button render={<Link href="/prototype/bookings" />}>View my bookings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
