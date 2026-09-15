import fs from 'fs';
import path from 'path';
import http from 'http';

// A plain `tsx` invocation does not auto-load `.env.local` the way `next
// dev`/`next build` do, and this repo has no `dotenv` dependency. Load it
// ourselves before any import below can trigger a Mongo/graph connection.
function loadEnvLocal() {
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

import { AGENT_CARD } from './agent-card';
import { SKILLS } from './skills';

export type TaskState =
  | 'submitted'
  | 'working'
  | 'completed'
  | 'failed'
  // Forward-compatible members, unimplemented in this plan — Phase 9 adds
  // real dispatch branches for these without restructuring the Task shape.
  | 'input-required'
  | 'auth-required';

export interface Task {
  id: string;
  status: { state: TaskState; message?: string };
  result?: unknown;
}

const PORT = Number(process.env.VENDOR_AGENT_PORT ?? 4100);

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(AGENT_CARD));
    return;
  }

  if (req.method === 'POST' && req.url === '/a2a') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      let rpc: { jsonrpc?: string; method?: string; params?: any; id?: unknown };
      try {
        rpc = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
        return;
      }

      if (rpc.method !== 'message/send') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: rpc.id ?? null }),
        );
        return;
      }

      const skillName = rpc.params?.skill;
      const handler = SKILLS[skillName];
      const task: Task = handler
        ? await handler(rpc.params ?? {})
        : {
            id: String(rpc.id ?? Date.now()),
            status: { state: 'failed', message: `Unknown skill: ${skillName}` },
          };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', result: task, id: rpc.id ?? null }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Vendor Agent listening on port ${PORT}`);
  console.log(`Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
});
