import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DOMAIN_DIR = path.resolve(__dirname, "../../lib/domain");

function listDomainSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return listDomainSourceFiles(fullPath);
    }
    return entry.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("AC4 — lib/domain is pure and independently testable", () => {
  it("imports nothing from convex/", () => {
    const files = listDomainSourceFiles(DOMAIN_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from\s+["']convex\//);
      expect(source).not.toMatch(/from\s+["']@\/convex\//);
      expect(source).not.toMatch(/require\(["']convex\//);
    }
  });

  it("performs no I/O or environment reads in source", () => {
    const forbiddenPatterns = [
      /process\.env/,
      /from\s+["']node:fs["']/,
      /from\s+["']fs["']/,
      /from\s+["']node:net["']/,
      /from\s+["']node:http["']/,
      /fetch\s*\(/,
    ];

    for (const file of listDomainSourceFiles(DOMAIN_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
