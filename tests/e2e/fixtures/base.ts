import { test as base, expect, APIRequestContext } from '@playwright/test';
import { BASE_PATH } from '@/lib/basePath';

// Playwright resolves a relative URL against `baseURL` via `new URL(path, baseURL)`
// (both for `page.goto` and for `APIRequestContext.get/post/put/delete/fetch`). A
// leading-slash path is treated as absolute and REPLACES baseURL's own path segment,
// silently dropping `/agentic-travels` even though baseURL includes it. Every spec in
// this suite was written pre-basePath using leading-slash paths, so we patch both
// entry points here once rather than touching every call site.
function withBasePath(url: string): string {
  return url.startsWith('/') && !url.startsWith(BASE_PATH) ? `${BASE_PATH}${url}` : url;
}

function patchRequestContext(request: APIRequestContext): void {
  for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head', 'fetch'] as const) {
    const original = request[method].bind(request);
    (request[method] as unknown) = (url: string, options?: unknown) =>
      (original as (u: string, o?: unknown) => ReturnType<typeof original>)(withBasePath(url), options);
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = ((url: string, options?: Parameters<typeof originalGoto>[1]) =>
      originalGoto(withBasePath(url), options)) as typeof originalGoto;
    patchRequestContext(page.request);
    await use(page);
  },
  request: async ({ request }, use) => {
    patchRequestContext(request);
    await use(request);
  },
});

export { expect };
