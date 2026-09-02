import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
      <Link href="/" className="font-heading text-lg font-medium">
        Agentic Travel
      </Link>
      <nav className="flex items-center gap-3">
        <Show when="signed-out">
          <SignInButton mode="redirect">
            <button className="text-sm font-medium text-foreground/80 hover:text-foreground">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="redirect">
            <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              Sign up
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </nav>
    </header>
  );
}
