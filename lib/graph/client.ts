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

  (global as any).graphPool = pool;
  return pool;
}

const AGTYPE_SUFFIX_RE = /::(vertex|edge)$/;

export function parseAgtype<T = Record<string, unknown>>(raw: string): T {
  const stripped = raw.replace(AGTYPE_SUFFIX_RE, '');
  return JSON.parse(stripped) as T;
}

// AGE's LOAD/search_path setup is session-scoped, and a pg.Pool recycles
// connections across queries, so every checked-out connection needs it — not
// just the first one. This must run and complete on the SAME connection
// before any cypher() query, in that order, on every checkout (not merely
// once via a `pool.on('connect', ...)` callback) — that fire-and-forget
// pattern raced a fresh connection's own query against its still-pending
// LOAD/SET, causing intermittent "function cypher(...) does not exist"
// failures that vanished on retry (a retry happened to reuse an
// already-warmed connection). Checking out the client explicitly and
// awaiting setup before releasing it back removes the race entirely.
async function withGraphSession<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('LOAD \'age\'; SET search_path = ag_catalog, "$user", public;');
    return await fn(client);
  } finally {
    client.release();
  }
}

// Plain SQL against the same Postgres database/pool (public schema, not
// Cypher) — used by the pgvector embedding tables, which are relational, not
// graph vertices/edges.
export async function runSql<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

export async function runCypher<T = Record<string, unknown>>(
  query: string,
  params?: Record<string, unknown>,
  columns?: string[],
): Promise<T[]> {
  // node-postgres uses $1-style placeholders (not psycopg2's %s) — the AGE
  // param convention itself (a single JSON-encoded agtype arg) still applies.
  // AGE requires the SQL column list to match the query's RETURN clause
  // arity exactly — single-column RETURN (the default/existing usage) maps
  // to `(result agtype)`; a multi-column RETURN must pass its column names.
  const columnList = columns && columns.length > 0 ? columns.map((c) => `${c} agtype`).join(', ') : 'result agtype';
  const sql = `SELECT * FROM cypher('rental_graph', $$ ${query} $$, $1::agtype) AS (${columnList});`;

  const result = await withGraphSession((client) => client.query(sql, [JSON.stringify(params ?? {})]));

  if (columns && columns.length > 0) {
    return result.rows.map((row) => {
      const parsed: Record<string, unknown> = {};
      for (const col of columns) {
        parsed[col] = row[col] === null ? null : parseAgtype(row[col]);
      }
      return parsed as T;
    });
  }

  return result.rows.map((row) => parseAgtype<T>(row.result));
}
