import { test, expect } from '@playwright/test';

test.describe('landing page', () => {
  test('renders header, hero form, carousel, and vendor marquee', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByLabel('Pickup location')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search cars' })).toBeVisible();

    const carouselCards = page.getByRole('button', { name: /from \$/i });
    await expect(carouselCards.first()).toBeVisible();
    expect(await carouselCards.count()).toBeGreaterThanOrEqual(6);

    await expect(page.getByText('rental partners', { exact: false })).toBeVisible();
  });

  test('hero form submit navigates to /search with matching params', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Pickup location').fill('Las Vegas');
    await page.getByRole('button', { name: 'Search cars' }).click();

    await expect(page).toHaveURL(/\/search\?.*location=Las(\+|%20)Vegas/);
  });
});

test.describe('search page', () => {
  test('without a location shows the pickup/date gate, not results', async ({ page }) => {
    await page.goto('/search');

    await expect(page.getByLabel('Pickup location')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search cars' })).toBeVisible();
  });

  test('renders shared filter sidebar and a result card with a real image', async ({ page }) => {
    await page.goto('/search?location=Las%20Vegas');

    await expect(page.getByLabel('Pickup location')).toBeVisible();
    await expect(page.getByText(/cars? available/i)).toBeVisible();

    const cardImages = page.locator('main img');
    await expect(cardImages.first()).toBeVisible();
  });
});

test.describe('auth pages', () => {
  test('sign-in renders', async ({ page }) => {
    const response = await page.goto('/sign-in');
    expect(response?.status()).toBeLessThan(400);
  });

  test('sign-up renders', async ({ page }) => {
    const response = await page.goto('/sign-up');
    expect(response?.status()).toBeLessThan(400);
  });
});

test.describe('checkout and confirmation routes', () => {
  test('/checkout is reachable', async ({ page }) => {
    const response = await page.goto('/checkout');
    expect(response?.status()).toBeLessThan(500);
  });

  test('/confirmation/[bookingId] is reachable', async ({ page }) => {
    const response = await page.goto('/confirmation/000000000000000000000000');
    expect(response?.status()).toBeLessThan(500);
  });

  // No Clerk test-auth fixture exists in this repo, so the enriched checkout
  // summary and extras toggles (which only render post sign-in) cannot be
  // driven end-to-end here. These two checks instead prove the new
  // getVendorPolicy/getAddOnsCatalog/getWaivedAddOnIds data-fetching added to
  // page.tsx doesn't throw before hitting the auth gate.
  test('/checkout with a valid inventoryId/vendorId still reaches the sign-in gate', async ({ page }) => {
    const response = await page.goto('/checkout?inventoryId=RC10001&vendorId=Alamo');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText('Sign in to book')).toBeVisible();
  });

  test('/checkout with an unknown inventoryId shows the not-available message', async ({ page }) => {
    const response = await page.goto('/checkout?inventoryId=does-not-exist&vendorId=Alamo');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText('This vehicle is no longer available.')).toBeVisible();
  });
});
