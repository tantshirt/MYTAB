/**
 * Polls until a universal-link callback is present.
 *
 * A `visibilitychange` to visible is not failure — that is the normal return
 * into Telegram after Phantom / Solflare / Backpack. Fail closed only on timeout.
 */

export async function waitForUniversalLinkCallback<T>(input: {
  read: () => T | null | Promise<T | null>;
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  clearSchedule?: (id: unknown) => void;
  addVisibilityListener?: (fn: () => void) => () => void;
  onTimeout: () => Error;
}): Promise<T> {
  const timeoutMs = input.timeoutMs ?? 120_000;
  const pollMs = input.pollMs ?? 400;
  const now = input.now ?? Date.now;
  const schedule = input.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const clearSchedule = input.clearSchedule ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const started = now();

  return new Promise((resolve, reject) => {
    let settled = false;
    let scheduled: unknown;
    let removeVisibility = () => {};

    const finish = (error?: Error, value?: T) => {
      if (settled) {
        return;
      }
      settled = true;
      if (scheduled !== undefined) {
        clearSchedule(scheduled);
      }
      removeVisibility();
      if (error) {
        reject(error);
        return;
      }
      resolve(value as T);
    };

    const tick = () => {
      if (settled) {
        return;
      }
      void Promise.resolve(input.read())
        .then((found) => {
          if (settled) {
            return;
          }
          if (found != null) {
            finish(undefined, found);
            return;
          }
          if (now() - started > timeoutMs) {
            finish(input.onTimeout());
            return;
          }
          scheduled = schedule(tick, pollMs);
        })
        .catch(() => {
          if (settled) {
            return;
          }
          if (now() - started > timeoutMs) {
            finish(input.onTimeout());
            return;
          }
          scheduled = schedule(tick, pollMs);
        });
    };

    if (input.addVisibilityListener) {
      removeVisibility = input.addVisibilityListener(tick);
    } else if (typeof document !== "undefined") {
      const handler = () => {
        if (document.visibilityState === "visible") {
          tick();
        }
      };
      document.addEventListener("visibilitychange", handler);
      removeVisibility = () => {
        document.removeEventListener("visibilitychange", handler);
      };
    }

    tick();
  });
}
