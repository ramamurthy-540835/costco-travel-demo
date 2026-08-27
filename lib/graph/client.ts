import { Pool, type PoolClient } from 'pg';

let pool: Pool | undefined = (global as any).graphPool;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  // Read and validate the URL HERE, not at module scope — see lib/mongodb.ts
  // for why (next build's "Collecting page data" step imports every route module).
  const GRAPH_DATABASE_URL = process.env.GRAPH_DATABASE_URL;

  if (!GRAPH_DATABASE_URL) {
    throw new Error('Please define the GRAPH_DATABASE_URL environment variable');
  }

  pool = new Pool({ connectionString: GRAPH_DATABASE_URL });

  // AGE's LOAD/search_path setup is session-scoped, and a pg.Pool recycles
  // connections across queries, so every checked-out connection needs it —
  // not just the first one.
  pool.on('connect', (client: PoolClient) => {
    client.query('LOAD \'age\'; SET search_path = ag_catalog, "$user", public;');
  });

  (global as any).graphPool = pool;
  return pool;
}

const AGTYPE_SUFFIX_RE = /::(vertex|edge)$/;

export function parseAgtype<T = Record<string, unknown>>(raw: string): T {
  const stripped = raw.replace(AGTYPE_SUFFIX_RE, '');
  return JSON.parse(stripped) as T;
}

export async function runCypher<T = Record<string, unknown>>(
  query: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const p = getPool();
  // node-postgres uses $1-style placeholders (not psycopg2's %s) — the AGE
  // param convention itself (a single JSON-encoded agtype arg) still applies.
  const sql = `SELECT * FROM cypher('rental_graph', $$ ${query} $$, $1::agtype) AS (result agtype);`;
  const result = await p.query(sql, [JSON.stringify(params ?? {})]);
  return result.rows.map((row) => parseAgtype<T>(row.result));
}
