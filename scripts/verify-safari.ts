import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { boot, type Boot } from "../packages/core/tests/e2e/boot.ts";
import { fnId } from "../packages/core/tests/e2e/docs.fixture.ts";
import { SafariSession, type Fetcher } from "./safari-driver.ts";

// `bun run verify:safari` (AGENTS.md, Every gate passes before moving on): the client's core flows in real Safari on
// the Mac, against a production docs server on this machine. It fails, and never skips, when the Mac, its driver, or
// this machine's address is not reachable: a Safari check that did not run is not a pass (BUGS.md 123: Playwright's
// WebKit missed what Safari 17.6 lacked).
//
// Inputs, by env: FLARE_SAFARI_SSH, the Mac's ssh destination (default `mac`); FLARE_SAFARI_DRIVER_PORT, the port
// `safaridriver -p` listens on there (default 4799); FLARE_SAFARI_HOST, this machine's address as the Mac reaches it
// (default the first address `tailscale ip -4` prints).

export type SafariConfig = { ssh: string; driverPort: number; host: string };

export function configOf(env: Record<string, string | undefined>, tailscale: () => string): SafariConfig {
	const host = env["FLARE_SAFARI_HOST"] ?? tailscale().split("\n")[0]?.trim() ?? "";
	if (host === "") {
		throw new Error("verify:safari needs this machine's address as the Mac reaches it: set FLARE_SAFARI_HOST");
	}
	const driverPort = Number(env["FLARE_SAFARI_DRIVER_PORT"] ?? "4799");
	return { ssh: env["FLARE_SAFARI_SSH"] ?? "mac", driverPort, host };
}

// One flow: what it checks, and the failure it saw, or undefined when it passed.
export type Flow = { name: string; run: (safari: SafariSession, site: Site) => Promise<string | undefined> };
// The docs app as Safari reaches it (`origin`), and a server function called from this machine.
export type Site = { origin: string; callFn: (id: string, data: unknown) => Promise<unknown> };

const HYDRATED = "return document.documentElement.hasAttribute('data-flare-hydrated')";
const SCROLL = "return Math.round(window.scrollY)";
// A mark on the window survives a client navigation and dies with a document load, so a flow can tell a client
// navigation from the document-load fallback (BUGS.md 123.3).
const MARK = "window.__flareMark = 1";
const MARKED = "return window.__flareMark === 1";
const STEPS = ["resolve routes", "bundle client", "bundle server", "prerender pages", "write sitemap", "done"];

async function open(safari: SafariSession, url: string): Promise<void> {
	await safari.go(url);
	if (!(await safari.wait(HYDRATED, 20_000))) throw new Error(`${url} never hydrated`);
	await safari.js(MARK);
}

export const FLOWS: readonly Flow[] = [
	{
		name: "sidebar navigation from the bottom of a page",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/docs/server-functions`);
			await safari.js("window.scrollTo(0, document.documentElement.scrollHeight)");
			await safari.wait("return window.scrollY > 300");
			await safari.click("#sidebar a[href='/docs/defer']");
			const landed = await safari.wait("return location.pathname === '/docs/defer' && /Defer/.test(document.title)");
			if (!landed) return `stuck at ${String(await safari.js("return location.pathname"))}`;
			return (await safari.js(MARKED)) === true ? undefined : "the page loaded as a document";
		},
	},
	{
		name: "Back restores the scroll position",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/docs/routing`);
			await safari.js("window.scrollTo(0, 900)");
			await safari.wait("return Math.round(window.scrollY) === 900");
			await safari.click("#nav a[href^='/api']");
			if (!(await safari.wait("return location.pathname.startsWith('/api')"))) return "the API link did not land";
			await safari.back();
			const restored = await safari.wait("return location.pathname === '/docs/routing' && Math.abs(scrollY - 900) < 2");
			if (!restored) return `Back left scrollY at ${String(await safari.js(SCROLL))}, not 900`;
			return (await safari.js(MARKED)) === true ? undefined : "Back loaded a document";
		},
	},
	{
		// WebDriver scrolls a link into view before it clicks, so /hr's own position at the click is what Back restores.
		name: "Back restores the position at the click",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/hr`);
			await safari.js(
				"document.querySelector(\"a[href='/hr/docs/media']\").addEventListener('click', () => { window.__at = Math.round(scrollY) }, { capture: true, once: true })",
			);
			await safari.click("a[href='/hr/docs/media']");
			if (!(await safari.wait("return location.pathname === '/hr/docs/media'"))) return "the media link did not land";
			await safari.js("window.scrollTo(0, document.documentElement.scrollHeight)");
			await safari.back();
			const at = Number(await safari.js("return window.__at"));
			if (await safari.wait(`return location.pathname === '/hr' && Math.abs(scrollY - ${at}) < 2`)) return undefined;
			return `Back left scrollY at ${String(await safari.js(SCROLL))}, not ${at}`;
		},
	},
	{
		name: "a streamed server function",
		run: async (safari, site) => {
			await open(safari, `${site.origin}/playground`);
			await safari.click("#stream-start");
			const done = await safari.wait("return document.querySelectorAll('#stream-log li').length === 6", 15_000);
			return done
				? undefined
				: `${String(await safari.js("return document.querySelectorAll('#stream-log li').length"))} of 6 lines`;
		},
	},
	{
		// The playground's gated run sends each line only after a release, so each line must reach the page while the
		// server still holds the next: the stream is read as it arrives, not at its end.
		name: "the stream gate: each line arrives while the next is held",
		run: async (safari, site) => {
			const run = `safari${Date.now() % 100_000}`;
			const hold = await site.callFn(fnId("src/fns/build-log.ts", "holdBuild"), { run });
			if (Reflect.get(Object(Reflect.get(Object(hold), "data")), "held") !== true) return "the gate did not hold";
			await open(safari, `${site.origin}/playground?run=${run}`);
			await safari.click("#stream-start");
			for (let count = 1; count <= STEPS.length; count += 1) {
				if (!(await safari.wait(`return document.querySelectorAll('#stream-log li').length === ${count}`))) {
					return `line ${count} never arrived`;
				}
				if (count < STEPS.length) await site.callFn(fnId("src/fns/build-log.ts", "releaseBuild"), { run });
			}
			return (await safari.wait("return document.querySelector('#stream-status')?.textContent === 'done'"))
				? undefined
				: "the run never reported done";
		},
	},
];

// Every flow, each reported as it ends. The exit code is the number of failed flows, capped at 1.
export async function runFlows(
	safari: SafariSession,
	site: Site,
	input: { log: (line: string) => void; flows?: readonly Flow[] },
): Promise<number> {
	const { log, flows = FLOWS } = input;
	let failed = 0;
	for (const flow of flows) {
		const problem = await flow.run(safari, site).catch((error: unknown) => String(error));
		if (problem !== undefined) failed += 1;
		log(`${problem === undefined ? "PASS" : "FAIL"}  ${flow.name}${problem === undefined ? "" : `: ${problem}`}`);
	}
	log(`verify:safari: ${flows.length - failed} of ${flows.length} flows passed in Safari ${safari.version}`);
	return failed === 0 ? 0 : 1;
}

// The tunnel to the Mac's driver, ready once the driver answers `/status` as ready.
export async function tunnel(config: SafariConfig, fetch: Fetcher): Promise<{ base: string; close: () => void }> {
	const port = await freePort();
	const ssh: ChildProcess = spawn(
		"ssh",
		[
			"-N",
			"-o",
			"BatchMode=yes",
			"-o",
			"ExitOnForwardFailure=yes",
			"-L",
			`${port}:127.0.0.1:${config.driverPort}`,
			config.ssh,
		],
		{ stdio: ["ignore", "ignore", "pipe"] },
	);
	let stderr = "";
	ssh.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
	const base = `http://127.0.0.1:${port}`;
	const close = (): void => void ssh.kill();
	for (let attempt = 0; attempt < 60 && ssh.exitCode === null; attempt += 1) {
		const ready = await fetch(`${base}/status`, { method: "GET" })
			.then(async (response) => Reflect.get(Object(Reflect.get(Object(await response.json()), "value")), "ready"))
			.catch(() => false);
		if (ready === true) return { base, close };
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	close();
	throw new Error(
		`The Mac's safaridriver is not reachable through \`ssh ${config.ssh}\` on port ${config.driverPort}${stderr === "" ? "" : ` (${stderr.trim()})`}. Run \`safaridriver -p ${config.driverPort}\` in a Terminal on the Mac.`,
	);
}

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as AddressInfo;
			server.close(() => resolve(port));
		});
	});
}

// The docs server on every interface, so the Mac reaches it. Bodies stream through as they arrive. A browser that
// closes its request aborts the upstream one, and an upstream that breaks, as the server's own close does to a held
// stream, ends that one response instead of the run.
function expose(upstream: string): Promise<{ port: number; server: Server }> {
	const server = createServer((request, response) => {
		const chunks: Buffer[] = [];
		const abort = new AbortController();
		response.on("close", () => abort.abort());
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			const body =
				request.method === "GET" || request.method === "HEAD" ? undefined : Uint8Array.from(Buffer.concat(chunks));
			forward({ upstream, request, body, signal: abort.signal }, response).catch(() => response.destroy());
		});
	});
	return new Promise((resolve) =>
		server.listen(0, "0.0.0.0", () => resolve({ port: (server.address() as AddressInfo).port, server })),
	);
}

type Forwarded = {
	upstream: string;
	request: IncomingMessage;
	body: Uint8Array<ArrayBuffer> | undefined;
	signal: AbortSignal;
};

async function forward(input: Forwarded, response: ServerResponse): Promise<void> {
	const headers = Object.fromEntries(
		Object.entries(input.request.headers).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
	);
	const answer = await fetch(`${input.upstream}${input.request.url ?? "/"}`, {
		method: input.request.method,
		headers,
		body: input.body,
		redirect: "manual",
		signal: input.signal,
	});
	const out = Object.fromEntries(
		[...answer.headers].filter(([key]) => !["content-length", "content-encoding"].includes(key)),
	);
	response.writeHead(answer.status, out);
	const reader = answer.body?.getReader();
	for (let next = await reader?.read(); next !== undefined && !next.done; next = await reader?.read()) {
		response.write(next.value);
	}
	response.end();
}

export async function verifySafari(env: Record<string, string | undefined>): Promise<number> {
	const config = configOf(env, () => spawnSync("tailscale", ["ip", "-4"], { encoding: "utf8" }).stdout ?? "");
	const driver = await tunnel(config, fetch);
	let docs: Boot | undefined;
	let exposed: { port: number; server: Server } | undefined;
	try {
		docs = await boot({ app: "docs", runtime: "node", mode: "prod" });
		exposed = await expose(docs.origin);
		const upstream = docs.origin;
		const site: Site = {
			origin: `http://${config.host}:${exposed.port}`,
			callFn: async (id, data) =>
				(
					await fetch(`${upstream}/_flare/fn/${id}`, {
						method: "POST",
						headers: { origin: upstream, "content-type": "application/json" },
						body: JSON.stringify(data),
					})
				).json(),
		};
		const safari = await SafariSession.open(driver.base, fetch);
		try {
			return await runFlows(safari, site, { log: (line) => console.log(line) });
		} finally {
			await safari.close().catch(() => undefined);
		}
	} finally {
		exposed?.server.close();
		await docs?.close();
		driver.close();
	}
}

if (import.meta.main) {
	process.exitCode = await verifySafari(process.env).catch((error: unknown) => {
		console.error(`verify:safari: ${error instanceof Error ? error.message : String(error)}`);
		return 1;
	});
}
