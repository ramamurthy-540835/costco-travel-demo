import { ENV } from './env';

export interface VendorTaskError {
  error: true;
  message: string;
}

export async function callVendorSkill<T = unknown>(
  skill: string,
  args: Record<string, unknown>,
): Promise<T | VendorTaskError> {
  let res: Response;
  try {
    res = await fetch(`${ENV.VENDOR_AGENT_URL}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'message/send',
        params: { skill, ...args },
        id: `${skill}-${Date.now()}`,
      }),
    });
  } catch (err) {
    return { error: true, message: `Vendor Agent unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!res.ok) {
    return { error: true, message: `Vendor Agent HTTP ${res.status}` };
  }

  const rpc = await res.json();
  if (rpc.error) {
    return { error: true, message: rpc.error.message ?? 'Vendor Agent RPC error' };
  }

  const task = rpc.result as { status: { state: string; message?: string }; result?: unknown };
  if (task.status.state === 'failed') {
    return { error: true, message: task.status.message ?? 'Vendor Agent task failed' };
  }

  return task.result as T;
}

export function isVendorTaskError(value: unknown): value is VendorTaskError {
  return Boolean(value) && typeof value === 'object' && (value as VendorTaskError).error === true;
}
