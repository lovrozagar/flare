import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test as base } from "./crash.ts";
import { loadHydrated } from "../../src/testing/playwright.ts";
import { boot, type Boot } from "./boot.ts";

// The docs app's shared boot (B94). The fixture is worker-scoped, so the docs spec files of one project share one
// build per worker instead of one per file.
export const test = base.extend<{ docs: Boot }, { docsBoot: Boot }>({
	docsBoot: [
		async ({ browserName }, use, workerInfo) => {
			const [runtime, mode] = (workerInfo.project.name || `node-dev-${browserName}`).split("-");
			const session = await boot({ app: "docs", runtime: runtime ?? "node", mode: mode ?? "dev" });
			await use(session);
			await session.close();
		},
		{ scope: "worker", timeout: 240_000 },
	],
	// A failing case keeps the server lines logged while it ran, and the whole boot's, in its own output directory beside
	// the trace, which CI uploads, so a failure shows the server's side too (BUGS.md 93). The first case of a boot also
	// checks the capture: the docs server logs one line at its first request, and it must reach the boot's log.
	docs: async ({ docsBoot }, use, testInfo) => {
		const start = docsBoot.logs().length;
		if (!probed.has(docsBoot)) {
			probed.add(docsBoot);
			// A setup failure is not yet the case's status, so this one attaches the logs itself.
			try {
				await fetch(`${docsBoot.origin}/maintenance`);
				const logged = () => docsBoot.logs().some((line) => line.includes(PROBE));
				await expect.poll(logged, { message: `the boot's log has no "${PROBE}"`, timeout: 2000 }).toBe(true);
			} catch (error) {
				await attachLogs(testInfo, docsBoot, start);
				throw error;
			}
		}
		await use(docsBoot);
		if (testInfo.status !== testInfo.expectedStatus) await attachLogs(testInfo, docsBoot, start);
	},
});

export { expect };

// The line the docs server logs at its first request (src/server.ts), and the boots already checked for it.
const PROBE = "[docs:probe] server up";
const probed = new WeakSet<Boot>();

async function attachLogs(testInfo: TestInfo, session: Boot, start: number): Promise<void> {
	for (const [name, lines] of [
		["server log", session.logs().slice(start)],
		["server session log", session.logs()],
	] as const) {
		const path = testInfo.outputPath(`${name.replaceAll(" ", "-")}.txt`);
		writeFileSync(path, `${lines.join("\n")}\n`);
		await testInfo.attach(name, { path, contentType: "text/plain" });
	}
}

// The deep set's browser, on every machine: the OS chooses no input to a run (B70). macOS CI names its webkit projects,
// so the deep specs run there on all of them.
const FIRST_BROWSER = "chromium";
const DEEP_SERVERS = ["node-dev", "node-prod", "workers-prod"];

export function serverOf(info: TestInfo): string {
	const [runtime, mode] = info.project.name.split("-");
	return `${runtime}-${mode}`;
}

export function isProd(info: TestInfo): boolean {
	return serverOf(info).endsWith("-prod");
}

// Every spec but the smoke spec runs on the deep set only (B94). The skip runs in a hook that reads no boot, so a
// skipped project never builds the app. A run that names its projects (`--project`, which playwright.config.ts passes on) chose them on purpose, so the
// deep specs run on every named project: that is how a tester runs a deep spec on another browser or on bun-prod.
const chosen = process.env["FLARE_E2E_PROJECTS_CHOSEN"] === "1";

export function deepOnly(): void {
	test.beforeEach(({ browserName }, info) => {
		const deep = chosen || (browserName === FIRST_BROWSER && DEEP_SERVERS.includes(serverOf(info)));
		test.skip(!deep, "deep set only (B94)");
	});
}

// A case that reads what a production build wrote: SSG seeds, the sitemap, critical CSS, optimized images.
export function prodOnly(info: TestInfo): void {
	test.skip(!isProd(info), "needs a production build (B94)");
}

// A page error, a console error, or a console warning is a problem: a Solid hydration mismatch arrives on the
// console without throwing. The returned list grows for the life of the page.
export function watch(page: Page): string[] {
	const problems: string[] = [];
	page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning")
			problems.push(`${message.type()}: ${message.text()}`);
	});
	return problems;
}

// Load a path and wait for hydrate on two channels, so a reply Playwright's Firefox driver loses cannot hang the case
// (BUGS.md 107). The problems list starts before the navigation. A query sent again is logged and annotated on the
// case, so a run that met the lost reply says so.
export async function open(page: Page, origin: string, path: string): Promise<string[]> {
	const problems = watch(page);
	await loadHydrated(page, `${origin}${path}`, {
		onReissue: (attempt) => {
			const note = `hydration query ${attempt + 1} sent for ${path}`;
			console.log(`[b107] ${test.info().project.name} › ${test.info().title}: ${note}`);
			test.info().annotations.push({ type: "b107", description: note });
		},
	});
	return problems;
}

// Document requests a page makes from now on. A client navigation adds none.
export function documents(page: Page): string[] {
	const urls: string[] = [];
	page.on("request", (request) => {
		if (request.resourceType() === "document") urls.push(new URL(request.url()).pathname);
	});
	return urls;
}

// Data requests (`?_flare=data`, `prefetch`, `fill`) a page makes from now on, by their `_flare` value.
export function dataRequests(page: Page): { kind: string; path: string }[] {
	const seen: { kind: string; path: string }[] = [];
	page.on("request", (request) => {
		const url = new URL(request.url());
		const kind = url.searchParams.get("_flare");
		if (kind !== null) seen.push({ kind, path: url.pathname });
	});
	return seen;
}

// The docs client's onIdle has run (src/client.tsx): the page hydrated and the browser went idle after it, so the
// work the boot defers to idle has started.
export async function idle(page: Page): Promise<void> {
	await page.waitForFunction(() => {
		const steps: unknown = Reflect.get(window, "__docsLifecycle");
		return Array.isArray(steps) && steps.includes("idle");
	});
}

// Data requests (`?_flare=`) from now on: how many started, and how many have not ended. A request ends when its body
// finishes or when it fails, an aborted one included.
export function dataTraffic(page: Page): { started: () => number; pending: () => number } {
	const pending = new Set<unknown>();
	let started = 0;
	page.on("request", (request) => {
		if (!new URL(request.url()).searchParams.has("_flare")) return;
		started += 1;
		pending.add(request);
	});
	page.on("requestfinished", (request) => void pending.delete(request));
	page.on("requestfailed", (request) => void pending.delete(request));
	return { started: () => started, pending: () => pending.size };
}

// A desktop browser user agent. Headless Chromium says "HeadlessChrome", which isbot counts as a bot, and a bot
// never follows the locale cookie or Accept-Language.
export const DESKTOP_UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

// A server function's id: sha256 of the root-relative path, NUL, and the export name, as 16 hex characters (B41).
export function fnId(file: string, name: string): string {
	return createHash("sha256").update(`${file}\0${name}`).digest("hex").slice(0, 16);
}

// The CSP header nonce and every nonce attribute in the body of one document response.
export function nonces(csp: string | undefined, body: string): { header: string; body: string[] } {
	const header = /'nonce-([0-9a-f]+)'/.exec(csp ?? "")?.[1] ?? "";
	return { header, body: [...new Set([...body.matchAll(/nonce="([^"]*)"/g)].map((match) => String(match[1])))] };
}

// The docs session cookie for a context, as the login server function writes it.
export function sessionCookie(origin: string, user: string, role: "admin" | "reader") {
	return { name: "docs.session", value: encodeURIComponent(`${user}.${role}`), url: origin };
}

// The IndexNow key the docs server answers at `/<key>.txt` (apps/docs/src/server.ts).
export const INDEX_NOW_KEY = "docs-indexnow-key-2026";
