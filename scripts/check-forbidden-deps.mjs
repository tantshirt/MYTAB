#!/usr/bin/env node
/**
 * Fails CI when forbidden packages appear in package.json or package-lock.json.
 * See AD-2 and Story 1.1 acceptance criteria.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Packages that must never be added to this repository (AD-2, AD-20). */
export const FORBIDDEN_PACKAGES = [
  "@tanstack/react-query",
  "@tanstack/query-core",
  "shadcn-ui",
  "@prisma/client",
  "prisma",
  "drizzle-orm",
  "@supabase/supabase-js",
  "pg",
  "postgres",
  "redis",
  "ioredis",
  "express",
  "fastify",
  "@stylexjs/babel-plugin",
];

function collectDependencyNames(manifest) {
  const names = new Set();
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const block = manifest[section];
    if (block && typeof block === "object") {
      for (const name of Object.keys(block)) {
        names.add(name);
      }
    }
  }
  return names;
}

function scanLockfile(lockText) {
  const hits = [];
  for (const pkg of FORBIDDEN_PACKAGES) {
    const patterns = [
      `"node_modules/${pkg}"`,
      `"${pkg}":`,
      `"name": "${pkg}"`,
    ];
    if (patterns.some((p) => lockText.includes(p))) {
      hits.push(pkg);
    }
  }
  return hits;
}

function main() {
  const manifestPath = join(root, "package.json");
  const lockPath = join(root, "package-lock.json");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifestNames = collectDependencyNames(manifest);

  const violations = FORBIDDEN_PACKAGES.filter((pkg) => manifestNames.has(pkg));

  if (existsSync(lockPath)) {
    const lockText = readFileSync(lockPath, "utf8");
    for (const pkg of scanLockfile(lockText)) {
      if (!violations.includes(pkg)) {
        violations.push(pkg);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Forbidden dependencies detected:");
    for (const pkg of violations) {
      console.error(`  - ${pkg}`);
    }
    process.exit(1);
  }

  console.log("No forbidden dependencies found.");
}

main();
