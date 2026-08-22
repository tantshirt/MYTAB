#!/usr/bin/env node
/**
 * Vercel build entrypoint.
 *
 * Convex function deploys and frontend builds are coupled by design — `convex
 * deploy --cmd` pushes the backend, then injects NEXT_PUBLIC_CONVEX_URL into the
 * frontend build so the two can never disagree. That coupling requires a deploy
 * key, and the key is scoped per Vercel environment.
 *
 *   production  A missing key is a HARD FAILURE. Building the frontend without
 *               deploying the backend would ship a production bundle pointing at
 *               nothing, in fixture mode, silently. That must never happen.
 *
 *   preview     A missing key is tolerated and loudly announced. PR previews
 *               build the frontend only and fall back to fixture mode, which is
 *               enough to review UI work. To give previews a real ephemeral
 *               backend instead, generate a *preview* deploy key in the Convex
 *               dashboard (Settings -> Deploy Keys -> Generate Preview Deploy
 *               Key) and set it as CONVEX_DEPLOY_KEY for the Preview
 *               environment. Never reuse the production key here: every PR build
 *               would deploy schema and functions straight to production.
 *
 *   local       Frontend only. `npx convex dev` owns the backend.
 */
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "local";
const hasKey = Boolean(process.env.CONVEX_DEPLOY_KEY);

function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  process.exit(result.status ?? 1);
}

if (env === "production" && !hasKey) {
  console.error(
    "\nCONVEX_DEPLOY_KEY is not set for the Production environment.\n" +
      "Refusing to build: this would publish a production bundle with no Convex\n" +
      "backend behind it. Set it in Vercel -> Settings -> Environment Variables.\n",
  );
  process.exit(1);
}

if (hasKey) {
  console.log(`Convex: deploying backend (VERCEL_ENV=${env}).`);
  run("npx", ["convex", "deploy", "--cmd", "npm run build"]);
}

console.log(
  `Convex: no deploy key for VERCEL_ENV=${env} — building frontend only.\n` +
    "This build runs in fixture mode. Set a preview deploy key in Vercel to\n" +
    "give previews their own Convex backend.",
);
run("npm", ["run", "build"]);
