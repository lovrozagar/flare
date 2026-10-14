import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync } from "node:fs";
import * as nodeModule from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { packCore, type Packed } from "../../../../scripts/release.ts";
import { flarePage } from "../../src/testing/index.ts";
import { bootApp, type Boot } from "./boot.ts";

// The golden proof (bits/14, B75): apps/minimal over the installed tarball, not the workspace. The stage holds the
// extracted package in its own node_modules, so `@lovrozagar/flare` resolves there, and the peers resolve from the
// repo's node_modules as an install would provide them (G2).
const minimal = fileURLToPath(new URL("./apps/minimal/", import.meta.url));
const STAGE = 240_000;
const RUN = 180_000;
let packed: Packed;

beforeAll(() => {
	packed = packCore();
	for (const name of ["package.json", "vite.config.ts", "wrangler.jsonc", "src"]) {
		cpSync(join(minimal, name), join(packed.stage, name), {
			recursive: true,
			filter: (path) => !path.includes("/_gen"),
		});
	}
	// `flare codegen` from the tarball's compiled bin, under plain Node: no Bun and no type stripping.
	execFileSync(process.execPath, [join(packed.stage, "node_modules/.bin/flare"), "codegen"], { cwd: packed.stage });
}, STAGE);

afterAll(() => packed?.close());

// B41: sha256 of the root-relative path, NUL, and the export name, as 16 hex characters.
const ECHO = createHash("sha256").update("src/fns/echo.ts\0echo").digest("hex").slice(0, 16);

async function threeRequests(origin: string): Promise<void> {
	const home = await fetch(`${origin}/`);
	expect(home.status).toBe(200);
	await home.body?.cancel();
	const call = await fetch(`${origin}/_flare/fn/${ECHO}`, {
		method: "POST",
		headers: { origin, "content-type": "application/json" },
		body: JSON.stringify({ text: "golden" }),
	});
	expect(call.status).toBe(200);
	expect(await call.json()).toMatchObject({ name: "echo", status: 200, data: "golden" });
	const data = await fetch(`${origin}/?_flare=data`);
	expect(data.status).toBe(200);
	expect(data.headers.get("content-type")).toMatch(/^application\/x-ndjson/);
	await data.body?.cancel();
}

async function served(runtime: string, mode: string, check: (origin: string) => Promise<void>): Promise<void> {
	const session: Boot = await bootApp({ appDir: packed.stage, runtime, mode });
	try {
		await check(session.origin);
	} finally {
		await session.close();
	}
}

it(
	"node",
	async () => {
		expect(existsSync(join(packed.stage, "src/_gen/routes.gen.ts"))).toBe(true);
		expect(existsSync(join(packed.stage, "src/_gen/server-fns.gen.ts"))).toBe(true);
		await served("node", "dev", threeRequests);
		await served("node", "prod", threeRequests);
	},
	RUN,
);

it("bun", () => served("bun", "prod", threeRequests), RUN);

// The Workers build composes the Cloudflare plugin, which needs node:module's registerHooks: the Bun run skips it (B109).
it.skipIf(typeof Reflect.get(nodeModule, "registerHooks") !== "function")(
	"workers",
	() => served("workers", "prod", threeRequests),
	RUN,
);

// The packed code's `import.meta.env?.DEV` is replaced on both graphs under `vite dev`: the server answers with the
// dev policy and the csp-nonce meta, Stylesheet renders nothing, and the client hydrates cleanly.
it(
	"dev from tarball",
	() =>
		served("node", "dev", async (origin) => {
			const browser = await chromium.launch();
			try {
				const page = await browser.newPage();
				const helper = flarePage(page);
				const warnings: string[] = [];
				page.on("console", (message) => {
					if (message.type() === "warning" && /hydration/i.test(message.text())) warnings.push(message.text());
				});
				const response = await page.goto(`${origin}/`);
				expect(response?.headers()["content-security-policy"]).toMatch(/worker-src [^;]*blob:/);
				await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" });
				expect(await page.locator('meta[property="csp-nonce"]').count()).toBe(1);
				expect(await page.locator("#flare-stylesheet").count()).toBe(0);
				expect(helper.consoleErrors()).toEqual([]);
				expect(warnings).toEqual([]);
			} finally {
				await browser.close();
			}
		}),
	RUN,
);
