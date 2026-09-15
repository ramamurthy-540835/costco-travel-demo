import { loadEnvLocal } from './env';
loadEnvLocal();

import http from 'http';
import { ENV } from './env';
import { getOrCreateSession } from './session-store';
import { runChatTurn } from './chat-loop';
import type { ToolContext } from './tools';

interface ChatRequestBody {
  conversation_id: string;
  message: string;
  memberId: string;
  email: string;
}

// Browser clients (the chat widget, 09-02) call this cross-origin with
// credentials: 'include' to forward the Clerk session cookie — that requires
// an explicit Access-Control-Allow-Origin (not '*') plus Allow-Credentials.
function withCors(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', ENV.NEXTJS_APP_URL);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer(async (req, res) => {
  withCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      let payload: ChatRequestBody;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      if (!payload.conversation_id || !payload.message || !payload.memberId || !payload.email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'conversation_id, message, memberId, and email are required' }),
        );
        return;
      }

      // The Clerk session token is forwarded verbatim to Next's own API
      // routes, which re-validate it themselves — this service never
      // decodes it. memberId/email are resolved by the caller (the signed-in
      // browser session) and passed as request-level context, never as
      // model tool-call arguments (see tools.ts's ToolContext contract).
      const cookieHeader = req.headers['cookie'] ?? req.headers['authorization'] ?? '';
      const ctx: ToolContext = {
        conversationId: payload.conversation_id,
        memberId: payload.memberId,
        email: payload.email,
        cookieHeader: Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader,
      };

      const session = await getOrCreateSession(payload.conversation_id, payload.memberId);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      try {
        for await (const event of runChatTurn(
          payload.conversation_id,
          payload.message,
          session.compactedHistory,
          ctx,
        )) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (err) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err) })}\n\n`,
        );
      }

      res.end();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(ENV.PORT, () => {
  console.log(`Customer Assistant listening on port ${ENV.PORT}`);
  console.log(`connected: env loaded, Mongo will connect lazily on first session lookup`);
});
