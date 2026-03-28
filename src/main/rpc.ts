import { ipcMain } from 'electron';
import type { RpcName, RpcSchema, RpcRequest } from '../shared/rpc';

type RpcHandler<N extends RpcName> = (
  args: RpcSchema[N]['args']
) => Promise<RpcSchema[N]['response']> | RpcSchema[N]['response'];

const handlers = new Map<string, RpcHandler<any>>();

export function registerRpc<N extends RpcName>(
  name: N,
  handler: RpcHandler<N>
): void {
  handlers.set(name as string, handler);
}

export function initRpc(): void {
  ipcMain.handle('rpc', async (_event, request: RpcRequest) => {
    const handler = handlers.get(request.name);
    if (!handler) {
      return { ok: false, error: `No RPC handler registered for "${request.name}"` };
    }
    try {
      const data = await handler(request.args);
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });
}
