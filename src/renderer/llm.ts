import { rpc } from './rpc';
import type { LlmCallResult } from '../shared/rpc';

export function callLlm(prompt: string): Promise<LlmCallResult> {
  return rpc('callLlm', { prompt });
}
