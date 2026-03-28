import type { Platform } from '../shared/platform';

export function usePlatform(): Platform {
  return window.platform;
}

export function useIsMac(): boolean {
  return window.platform === 'mac';
}

export function useIsWindows(): boolean {
  return window.platform === 'windows';
}

export function useIsLinux(): boolean {
  return window.platform === 'linux';
}
