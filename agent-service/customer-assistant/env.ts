import fs from 'fs';
import path from 'path';

// A plain `tsx` invocation does not auto-load `.env.local` the way `next
// dev`/`next build` do, and this repo has no `dotenv` dependency. Load it
// ourselves before any import below can trigger a Mongo/graph connection —
// same convention as agent-service/vendor-agent/server.ts.
export function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '../../.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    process.env[key] = process.env[key] ?? value;
  }
}
loadEnvLocal();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const ENV = {
  PORT: Number(process.env.CUSTOMER_ASSISTANT_PORT ?? 4200),
  MONGODB_URI: required('MONGODB_URI'),
  VENDOR_AGENT_URL:
    process.env.VENDOR_AGENT_URL ?? `http://localhost:${process.env.VENDOR_AGENT_PORT ?? 4100}`,
  // Bare origin only — no basePath here. tools.ts's fetchJson appends
  // BASE_PATH (from lib/basePath.ts, the same constant the Next app itself
  // uses) so there's one source of truth for the prefix, not a copy that can
  // drift if NEXTJS_APP_URL is ever overridden for a different host.
  NEXTJS_APP_URL: process.env.NEXTJS_APP_URL ?? 'http://localhost:3000',
  AZURE_OPENAI_ENDPOINT: required('AZURE_OPENAI_ENDPOINT'),
  AZURE_OPENAI_API_KEY: required('AZURE_OPENAI_API_KEY'),
  // Azure's `model` param on every completions call must be the deployment
  // name, not a generic model id — fail fast on boot if this is missing
  // rather than surfacing a confusing 404 from Azure on the first request.
  AZURE_OPENAI_DEPLOYMENT_NAME: required('AZURE_OPENAI_DEPLOYMENT_NAME'),
  AZURE_API_VERSION: process.env.AZURE_API_VERSION,
  // Same model mastech-agentic-commerce uses for its pgvector product search
  // (agent-service/agent_service/storefront/tools/product_search_tool.py,
  // agent-service/scripts/backfill_embeddings.py there) — text-embedding-3-small,
  // 1536 dims, matching this repo's vehicle_class_embeddings.embedding column.
  // Azure requires the deployment to be named exactly this for the `model`
  // param below to resolve; override only if the portal deployment uses a
  // different name. Until that deployment is actually provisioned, the
  // embeddings API call itself 404s — embedVehicleClassQuery in tools.ts
  // catches that and degrades to today's zero-result behavior, never throws.
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME:
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME ?? 'text-embedding-3-small',
};
