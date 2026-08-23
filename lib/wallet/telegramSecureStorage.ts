/**
 * Telegram SecureStorage (Bot API 9.0) — official place for secrets.
 * Not a substitute for the Convex copy of the X25519 secret.
 */

const SECURE_KEY = "mytab-wallet-ul-secret";

type SecureStorageApi = {
  setItem?: (key: string, value: string, callback?: (error: unknown) => void) => void;
  getItem?: (
    key: string,
    callback: (error: unknown, value?: string | null) => void,
  ) => void;
};

function secureStorage(): SecureStorageApi | null {
  if (typeof window === "undefined") {
    return null;
  }
  const webApp = window.Telegram?.WebApp as { SecureStorage?: SecureStorageApi } | undefined;
  return webApp?.SecureStorage ?? null;
}

export function writeTelegramSecureStorage(secret: string): void {
  const store = secureStorage();
  if (!store?.setItem) {
    return;
  }
  try {
    store.setItem(SECURE_KEY, secret);
  } catch {
    /* older clients — Convex still holds the secret */
  }
}

export function readTelegramSecureStorage(): Promise<string | null> {
  const store = secureStorage();
  if (!store?.getItem) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      store.getItem?.(SECURE_KEY, (error, value) => {
        resolve(error || !value ? null : value);
      });
    } catch {
      resolve(null);
    }
  });
}
