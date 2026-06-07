import type { Platform } from '../shared/platform';

export function usePlatform(): Platform {
  return window.platform;
}

export function useIsMac(): boolean {
  return window.platform === 'mac';
}
