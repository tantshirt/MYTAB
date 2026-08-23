import { describe, expect, it } from "vitest";
import { waitForUniversalLinkCallback } from "@/lib/wallet/waitForUniversalLinkCallback";

describe("waitForUniversalLinkCallback", () => {
  it("does not reject on a bare visibility event", async () => {
    let value: string | null = null;
    const visibility: Array<() => void> = [];
    const scheduled: Array<() => void> = [];

    const promise = waitForUniversalLinkCallback({
      read: () => value,
      timeoutMs: 10_000,
      pollMs: 25,
      now: () => 0,
      schedule: (fn) => {
        scheduled.push(fn);
        return scheduled.length;
      },
      clearSchedule: () => undefined,
      addVisibilityListener: (fn) => {
        visibility.push(fn);
        return () => undefined;
      },
      onTimeout: () => new Error("timed out"),
    });

    expect(visibility).toHaveLength(1);
    visibility[0]!();
    await Promise.resolve();

    value = "ready";
    visibility[0]!();
    await expect(promise).resolves.toBe("ready");
  });
});
