import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PRIVY_DIR = path.resolve(__dirname, "../../lib/privy");

function listPrivySourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return listPrivySourceFiles(fullPath);
    }
    return entry.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("Story 1.4 — lib/privy stays free of Convex imports", () => {
  it("imports nothing from convex/", () => {
    const files = listPrivySourceFiles(PRIVY_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from\s+["']convex\//);
      expect(source).not.toMatch(/from\s+["']@\/convex\//);
      expect(source).not.toMatch(/require\(["']convex\//);
    }
  });
});
