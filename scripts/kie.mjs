#!/usr/bin/env node
/**
 * kie.ai asset generation — build-time only, never bundled.
 * Usage: node scripts/kie.mjs <spec.json> [outDir]
 * Spec: { model?, defaults?: {...input}, items: [{ name, prompt, ...inputOverrides }] }
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE = "https://api.kie.ai/api/v1/jobs";
const KEY = process.env.KIE_API_KEY;
if (!KEY) {
  console.error("KIE_API_KEY missing. Set it in .env.local and export it.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function createTask(model, input) {
  const res = await fetch(`${BASE}/createTask`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, input }),
  });
  const json = await res.json();
  if (json.code !== 200) throw new Error(`createTask ${json.code}: ${json.msg}`);
  return json.data.taskId;
}

async function poll(taskId, { timeoutMs = 420_000, intervalMs = 5_000 } = {}) {
  const started = Date.now();
  for (;;) {
    const res = await fetch(`${BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers });
    const json = await res.json();
    if (json.code !== 200) throw new Error(`recordInfo ${json.code}: ${json.msg}`);
    const { state, resultJson, failMsg } = json.data ?? {};
    if (state === "success") {
      const parsed = typeof resultJson === "string" ? JSON.parse(resultJson) : resultJson;
      return parsed.resultUrls ?? [];
    }
    if (state === "fail") throw new Error(`task failed: ${failMsg ?? "unknown"}`);
    if (Date.now() - started > timeoutMs) throw new Error("poll timeout");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

const specPath = process.argv[2];
const outDir = process.argv[3] ?? "scripts/assets/out";
const spec = JSON.parse(await readFile(specPath, "utf8"));
const model = spec.model ?? "nano-banana-2";
await mkdir(outDir, { recursive: true });

const results = [];
await Promise.all(
  spec.items.map(async (item) => {
    const { name, ...overrides } = item;
    const ext = (overrides.output_format ?? spec.defaults?.output_format ?? "jpg").replace("jpeg", "jpg");
    const dest = path.join(outDir, `${name}.${ext}`);
    if (existsSync(dest)) {
      console.log(`skip   ${name} (exists)`);
      results.push({ name, dest, skipped: true });
      return;
    }
    try {
      const input = { ...spec.defaults, ...overrides };
      const taskId = await createTask(model, input);
      console.log(`start  ${name} → ${taskId}`);
      const urls = await poll(taskId);
      if (!urls.length) throw new Error("no resultUrls");
      await download(urls[0], dest);
      console.log(`done   ${name} → ${dest}`);
      results.push({ name, dest, url: urls[0] });
    } catch (err) {
      console.error(`FAIL   ${name}: ${err.message}`);
      results.push({ name, error: err.message });
    }
  }),
);

await writeFile(path.join(outDir, "_manifest.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.error);
console.log(`\n${results.length - failed.length}/${results.length} succeeded`);
if (failed.length) process.exit(1);
