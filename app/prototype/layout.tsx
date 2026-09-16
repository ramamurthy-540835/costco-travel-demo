import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PrototypeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <Link href="/prototype/landing" className="font-heading text-lg font-medium">
          Agentic Travel
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" render={<Link href="/prototype/bookings" />}>
            My Bookings
          </Button>
          <Button variant="ghost" render={<Link href="/sign-in" />}>
            Sign in
          </Button>
          <Button render={<Link href="/sign-up" />}>Sign up</Button>
        </nav>
      </header>
      {children}
    </div>
  );
}
