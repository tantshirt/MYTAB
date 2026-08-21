import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PROVIDERS_PATH = path.resolve(__dirname, "../../app/providers.tsx");

function expectAscendingOrder(source: string, components: string[]) {
  const indices = components.map((component) => source.indexOf(`<${component}`));
  for (const index of indices) {
    expect(index).toBeGreaterThan(-1);
  }
  for (let i = 0; i < indices.length - 1; i += 1) {
    expect(indices[i]).toBeLessThan(indices[i + 1]!);
  }
}

describe("Story 1.4 — provider order (AD-15)", () => {
  it("nests TelegramRuntimeProvider → PrivyProvider → PrivyConvexProvider → theme", () => {
    const source = readFileSync(PROVIDERS_PATH, "utf8");

    const providersSection = source.slice(source.indexOf("export function Providers"));
    const providerStackSection = source.slice(
      source.indexOf("function ProviderStack"),
      source.indexOf("export function Providers"),
    );

    expect(providersSection).toMatch(
      /<TelegramRuntimeProvider[\s\S]*<ProviderStack[\s\S]*<\/TelegramRuntimeProvider>/,
    );

    const fixtureBranch =
      providerStackSection.match(
        /if \(isPrivyFixtureMode\(\)\) \{[\s\S]*?return \([\s\S]*?\);/,
      )?.[0] ?? "";
    const productionBranch =
      providerStackSection.match(
        /return \(\s*<PrivyProvider[\s\S]*?\);\s*\}/,
      )?.[0] ?? "";

    expect(fixtureBranch).toContain("isPrivyFixtureMode");
    expectAscendingOrder(fixtureBranch, [
      "FixtureAuthProvider",
      "PrivyConvexProvider",
      "MyTabThemeProvider",
    ]);
    expectAscendingOrder(productionBranch, [
      "PrivyProvider",
      "PrivyConvexProvider",
      "MyTabThemeProvider",
    ]);
  });
});
