import { describe, expect, it } from "vitest";
import { activityBucket } from "@/features/balances/ActivityFeed";

/*
 * Fixed local timestamps, built through the Date constructor rather than as
 * epoch literals, so the assertions hold in whatever timezone the test runs
 * in — the buckets are local calendar buckets by design.
 */
const NOW = new Date(2026, 7, 23, 14, 0, 0).getTime(); // 23 August 2026, 14:00

const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month, day, hour).getTime();

describe("activityBucket", () => {
  it("names today and yesterday", () => {
    expect(activityBucket(at(2026, 7, 23, 9), NOW).label).toBe("Today");
    expect(activityBucket(at(2026, 7, 22, 9), NOW).label).toBe("Yesterday");
  });

  it("keeps the last week as individual days", () => {
    expect(activityBucket(at(2026, 7, 20), NOW).label).toBe("20 Aug");
    expect(activityBucket(at(2026, 7, 18), NOW).label).toBe("18 Aug");
  });

  /*
   * Past a week nobody is looking for a day — they are looking for a tab. One
   * heading per month is a better index than fourteen headings with one row
   * each under them.
   */
  it("widens to whole months once an event is history", () => {
    expect(activityBucket(at(2026, 6, 14), NOW).label).toBe("July");
    expect(activityBucket(at(2026, 5, 30), NOW).label).toBe("June");
  });

  it("names the year once it is not this one", () => {
    expect(activityBucket(at(2025, 11, 24), NOW).label).toBe("December 2025");
  });

  it("gives two events in the same month the same key", () => {
    const a = activityBucket(at(2026, 6, 2), NOW);
    const b = activityBucket(at(2026, 6, 28), NOW);
    expect(a.key).toBe(b.key);
    expect(a.label).toBe(b.label);
  });

  /*
   * The same month in two different years must never collapse into one
   * section — that would file last July's tabs under this July's heading.
   */
  it("never merges the same month across years", () => {
    expect(activityBucket(at(2026, 6, 2), NOW).key).not.toBe(
      activityBucket(at(2025, 6, 2), NOW).key,
    );
  });

  it("gives two events on the same day the same key, and different days different keys", () => {
    expect(activityBucket(at(2026, 7, 20, 8), NOW).key).toBe(
      activityBucket(at(2026, 7, 20, 23), NOW).key,
    );
    expect(activityBucket(at(2026, 7, 20), NOW).key).not.toBe(
      activityBucket(at(2026, 7, 19), NOW).key,
    );
  });
});
