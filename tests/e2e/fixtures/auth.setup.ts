import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import { test as setup } from './base';

setup('authenticate', async ({ page }) => {
  await clerkSetup();
  await setupClerkTestingToken({ page });

  await page.goto('/sign-in');

  await page.getByLabel('Email address').fill(process.env.E2E_CLERK_TEST_EMAIL!);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_CLERK_TEST_PASSWORD!);
  const signInComplete = page.waitForResponse(
    (res) => res.url().includes('/attempt_first_factor') && res.status() === 200,
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await signInComplete;

  // Give clerk-js a beat to persist the session cookie client-side before we
  // navigate away — attempt_first_factor resolving doesn't mean the SPA has
  // finished writing __session yet. Not `waitForLoadState('networkidle')`:
  // the chat assistant keeps a persistent connection open on every page, so
  // networkidle never fires and the wait always times out.
  await page.waitForTimeout(1000);
  await page.goto('/');
  // "My Bookings" only renders inside <Show when="signed-in"> (components/header.tsx),
  // so its visibility is a reliable real-session indicator without depending on Clerk's
  // internal UserButton markup.
  await page.getByRole('link', { name: 'My Bookings' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.context().storageState({ path: 'tests/e2e/.auth/user.json' });
});
