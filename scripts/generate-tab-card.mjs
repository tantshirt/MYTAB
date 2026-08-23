#!/usr/bin/env node
/**
 * One-shot house still for the tab status card (U-8).
 *
 * Model: Kie `nano-banana-2`. Reads KIE_API_KEY from the environment or
 * .env.local. Never prints the key. Missing key is a hard fail — never
 * writes a fixture photo (D-11).
 *
 *   node scripts/generate-tab-card.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "public/tab-card");
const OUT_FILE = resolve(OUT_DIR, "house.webp");
const CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const DETAIL_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";
const POLL_MS = 4_000;
const TIMEOUT_MS = 15 * 60_000;

const PROMPT = [
  "35mm film photograph of a sociable restaurant table in Bangkok evening light.",
  "Friends mid-conversation, plates of food, glasses of water, wooden table, paper menus.",
  "Alive, warm, a little grain. Paper-and-ink warmth: cream, warm ochre, soft brown,",
  "muted terracotta. Matches a quiet analog launch photograph — not a campaign shot.",
  "No neon, no glass architecture, no gradient sky, no chrome, no bokeh orbs.",
  "No text, no logos, no watermarks, no receipts, no wallets, no phones showing money,",
  "no banknotes, no coins, no QR codes, no UI.",
  "Photographed as a still frame, 4:3, natural color, slight film grain.",
].join(" ");

function readKey() {
  const fromEnv = process.env.KIE_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  let text = "";
  try {
    text = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  } catch {
    return "";
  }
  for (const line of text.split("\n")) {
    if (!line.startsWith("KIE_API_KEY=")) {
      continue;
    }
    return line.slice("KIE_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function kieJson(url, key, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    fail(`Kie request failed (${response.status}).`);
  }
  return body;
}

function parseResultUrls(resultJson) {
  if (!resultJson) {
    return [];
  }
  if (typeof resultJson === "string") {
    try {
      return parseResultUrls(JSON.parse(resultJson));
    } catch {
      return [];
    }
  }
  if (Array.isArray(resultJson.resultUrls)) {
    return resultJson.resultUrls.filter((url) => typeof url === "string");
  }
  return [];
}

function writeWebp(bytes, sourceHint) {
  mkdirSync(OUT_DIR, { recursive: true });
  const tmp = resolve(OUT_DIR, `house-source${sourceHint}`);
  writeFileSync(tmp, bytes);
  if (sourceHint === ".webp") {
    writeFileSync(OUT_FILE, bytes);
    spawnSync("rm", ["-f", tmp]);
    return;
  }
  const converted = spawnSync("cwebp", ["-q", "86", tmp, "-o", OUT_FILE], {
    encoding: "utf8",
  });
  spawnSync("rm", ["-f", tmp]);
  if (converted.status !== 0) {
    fail("Could not write public/tab-card/house.webp (cwebp convert failed).");
  }
}

const key = readKey();
if (!key) {
  fail("Missing KIE_API_KEY. Set it in Convex env or .env.local. Never invent a fixture photo.");
}

const created = await kieJson(CREATE_URL, key, {
  method: "POST",
  body: JSON.stringify({
    model: "nano-banana-2",
    input: {
      prompt: PROMPT,
      aspect_ratio: "4:3",
      resolution: "2K",
      output_format: "jpg",
    },
  }),
});

if (typeof created?.code === "number" && created.code !== 200) {
  fail(`Kie createTask rejected (${created.code}: ${created.msg ?? "error"}).`);
}

const taskId = created?.data?.taskId ?? created?.data?.task_id ?? created?.taskId;
if (!taskId || typeof taskId !== "string") {
  fail("Kie createTask returned no task id.");
}

console.log("Kie task created. Polling…");

const deadline = Date.now() + TIMEOUT_MS;
let state = "waiting";
let resultJson;

while (Date.now() < deadline) {
  const detail = await kieJson(`${DETAIL_URL}?taskId=${encodeURIComponent(taskId)}`, key);
  if (typeof detail?.code === "number" && detail.code !== 200) {
    fail(`Kie recordInfo rejected (${detail.code}: ${detail.msg ?? "error"}).`);
  }
  const data = detail?.data ?? {};
  state = data?.state ?? data?.status ?? "unknown";
  resultJson = data?.resultJson;
  if (state === "success") {
    break;
  }
  if (state === "fail" || state === "failed") {
    fail(`Kie generation failed (${data.failCode ?? "?"}: ${data.failMsg ?? "no message"}).`);
  }
  const extra = [data.failMsg, data.progress != null ? `progress ${data.progress}` : ""]
    .filter(Boolean)
    .join(" · ");
  console.log(extra ? `Kie state: ${state} (${extra})` : `Kie state: ${state}`);
  await new Promise((resolveWait) => setTimeout(resolveWait, POLL_MS));
}

if (state !== "success") {
  fail("Kie generation timed out.");
}

const urls = parseResultUrls(resultJson);
const imageUrl = urls[0];
if (!imageUrl) {
  fail("Kie success had no result URL.");
}

const imageResponse = await fetch(imageUrl);
if (!imageResponse.ok) {
  fail(`Download failed (${imageResponse.status}).`);
}
const bytes = Buffer.from(await imageResponse.arrayBuffer());
if (bytes.length < 1_000) {
  fail("Downloaded image was empty.");
}

const contentType = imageResponse.headers.get("content-type") ?? "";
const hint = contentType.includes("webp")
  ? ".webp"
  : contentType.includes("jpeg")
    ? ".jpg"
    : contentType.includes("png")
      ? ".png"
      : ".bin";

writeWebp(bytes, hint);
console.log("Wrote public/tab-card/house.webp");
