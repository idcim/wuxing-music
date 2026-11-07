import { TOKEN_KEY } from '@/constants/env';
import { storage } from '@/services/storage';

let onExpired: (() => void) | undefined;

export function registerSessionExpiry(handler: () => void): void {
  onExpired = handler;
}

export function expireSession(requestToken: string): void {
  if (requestToken && storage.get<string>(TOKEN_KEY) === requestToken) onExpired?.();
}
