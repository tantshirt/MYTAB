#!/usr/bin/env node
/**
 * Configure MYTAB Telegram bot + Convex secrets + webhook.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN='123:ABC...' node scripts/setup-telegram.mjs
 *   TELEGRAM_BOT_TOKEN='...' node scripts/setup-telegram.mjs --deployment dev
 *
 * Optional:
 *   TELEGRAM_WEBHOOK_SECRET='your-secret'  (generated if omitted)
 *   TELEGRAM_MINIAPP_NAME='app'            (default: app)
 *   MINI_APP_URL='https://mytab-liart.vercel.app'
 */

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const deploymentFlag = args.includes("--deployment")
  ? args[args.indexOf("--deployment") + 1]
  : "prod";

const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!botToken) {
  console.error("Missing TELEGRAM_BOT_TOKEN.");
  console.error("Create a bot with @BotFather, then rerun:");
  console.error("  TELEGRAM_BOT_TOKEN='123:ABC...' node scripts/setup-telegram.mjs");
  process.exit(1);
}

const webhookSecret =
  process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ??
  randomBytes(32).toString("base64url");

const miniAppName = process.env.TELEGRAM_MINIAPP_NAME?.trim() || "app";
const miniAppUrl =
  process.env.MINI_APP_URL?.trim() || "https://mytab-liart.vercel.app";

function readConvexSiteUrl(deployment) {
  const envLocal = resolve(process.cwd(), ".env.local");
  try {
    const text = readFileSync(envLocal, "utf8");
    const key =
      deployment === "dev" ? "peaceful-monitor-218" : "tremendous-partridge-849";
    for (const line of text.split("\n")) {
      if (line.includes("NEXT_PUBLIC_CONVEX_SITE_URL=") && line.includes(key)) {
        return line.split("=")[1]?.trim();
      }
    }
    const siteMatch = text.match(/^NEXT_PUBLIC_CONVEX_SITE_URL=(.+)$/m);
    if (siteMatch?.[1]) {
      return siteMatch[1].trim();
    }
  } catch {
    // fall through
  }
  return deployment === "dev"
    ? "https://peaceful-monitor-218.convex.site"
    : "https://tremendous-partridge-849.convex.site";
}

async function telegramApi(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!json.ok) {
    throw new Error(`${method} failed: ${JSON.stringify(json)}`);
  }
  return json.result;
}

function convexEnvSet(name, value, deployment) {
  const deploymentArgs =
    deployment === "prod" ? [] : ["--deployment", deployment === "dev" ? "dev" : deployment];
  const result = spawnSync(
    "npx",
    ["convex", "env", "set", name, ...deploymentArgs],
    {
      cwd: process.cwd(),
      input: value,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (result.status !== 0) {
    throw new Error(`convex env set ${name} failed (exit ${result.status})`);
  }
}

const siteUrl = readConvexSiteUrl(deploymentFlag);
const webhookUrl = `${siteUrl.replace(/\/$/, "")}/telegram/webhook`;

console.log("MYTAB Telegram setup");
console.log("====================");
console.log(`Deployment target : Convex ${deploymentFlag}`);
console.log(`Webhook URL       : ${webhookUrl}`);
console.log(`Mini App URL      : ${miniAppUrl}`);
console.log(`Mini App shortname: ${miniAppName}`);
console.log("");

const me = await telegramApi("getMe", {});
const botUsername = me.username;
console.log(`Bot               : @${botUsername} (${me.first_name})`);

console.log("\nSetting Convex environment variables...");
convexEnvSet("TELEGRAM_BOT_TOKEN", botToken, deploymentFlag);
convexEnvSet("TELEGRAM_WEBHOOK_SECRET", webhookSecret, deploymentFlag);
convexEnvSet("TELEGRAM_BOT_USERNAME", botUsername, deploymentFlag);
convexEnvSet("TELEGRAM_MINIAPP_NAME", miniAppName, deploymentFlag);
convexEnvSet("TELEGRAM_MINIAPP_URL", miniAppUrl, deploymentFlag);

console.log("\nRegistering Telegram webhook...");
const webhook = await telegramApi("setWebhook", {
  url: webhookUrl,
  secret_token: webhookSecret,
  allowed_updates: ["message", "chat_member", "my_chat_member"],
  drop_pending_updates: true,
});

console.log(`Webhook registered: ${webhook ? "ok" : "ok"}`);

console.log("\nRegistering command menus and Menu button...");
await telegramApi("setMyCommands", {
  commands: [
    { command: "tab", description: "Start a tab" },
    { command: "balance", description: "Where you stand" },
    { command: "tip", description: "Send someone a tip" },
    { command: "help", description: "What My Tab does" },
  ],
  scope: { type: "all_private_chats" },
});
await telegramApi("setMyCommands", {
  commands: [
    { command: "tab", description: "Start a tab for this group" },
    { command: "balance", description: "Where you stand" },
    { command: "tip", description: "Send someone a tip" },
  ],
  scope: { type: "all_group_chats" },
});
await telegramApi("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Open My Tab",
    web_app: { url: miniAppUrl },
  },
});
console.log("Commands and Menu button registered.");

const info = await telegramApi("getWebhookInfo", {});
console.log("\nWebhook info:");
console.log(`  url                 : ${info.url}`);
console.log(`  pending_update_count: ${info.pending_update_count}`);

console.log("\n============================================");
console.log("Manual steps (BotFather + Privy dashboard)");
console.log("============================================");
console.log(`
1. BotFather — Mini App
   • Open @BotFather → your bot → Bot Settings → Menu Button / Mini App
   • Web App URL: ${miniAppUrl}
   • Short name for deep links: ${miniAppName}
     (deep links look like https://t.me/${botUsername}/${miniAppName}?startapp=...)

2. BotFather — domain for Privy
   • Message @BotFather: /setdomain
   • Choose @${botUsername}
   • Domain: ${new URL(miniAppUrl).hostname}

3. Privy dashboard (app ${process.env.PRIVY_APP_ID ?? "cmt3uuk7b01mm0cl8083tqq55"})
   • Login methods → enable Telegram
   • Add bot: @${botUsername}
   • Enable seamless Mini App login

4. Add the bot as admin in a test group (required for /tab commands and member updates)

5. Test in Telegram
   • Open ${miniAppUrl} from the bot menu
   • In a group: /tab Dinner
   • Confirm non-production badge is hidden on production Vercel URL
`);

console.log("Done. TELEGRAM_WEBHOOK_SECRET was saved to Convex (not printed).");
