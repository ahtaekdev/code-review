import type { RpcName, RpcSchema } from '../shared/rpc';
import type { PushEventName, PushEventPayloads } from '../shared/push';
import type { Platform } from '../shared/platform';

type RpcFn = <N extends RpcName>(
  name: N,
  args: RpcSchema[N]['args']
) => Promise<RpcSchema[N]['response']>;

type OnPushFn = (callback: (event: string, payload?: any) => void) => () => void;

declare global {
  interface Window {
    rpc: (name: string, args: unknown) => Promise<any>;
    onPush: OnPushFn;
    platform: Platform;
  }
}

export const rpc: RpcFn = async (name, args) => {
  const envelope = await window.rpc(name, args);
  if (!envelope.ok) throw new Error(envelope.error);
  return envelope.data;
};

export function onPush<E extends PushEventName>(
  event: E,
  callback: PushEventPayloads[E] extends undefined ? () => void : (payload: PushEventPayloads[E]) => void,
): () => void {
  return window.onPush((name, payload) => {
    if (name === event) (callback as any)(payload);
  });
}
