import type { Page } from "@playwright/test";
import { isRunnableDevEnvironment, type ViteDevServer } from "vite";
import { STYLES_EVENT, stylesRequest } from "../../src/shared/protocol/index.ts";
import type { Api, Side } from "./hydrate.harness.ts";
import type { createClient } from "../../src/client/boot/create-client.ts";

// The harness's app mode (B96): a real document `createServer(...).fetch` serves from Solid's server build in Vite's SSR
// runner, hydrated in a real engine by the real `createClient` with Solid's browser build. A case is its app (the
// router, built on both sides from the same source, as an app's one source builds twice) and its client callbacks.

// `app` and `client` are compiled into each side as source, so they read only their arguments.
export type AppCase = {
	app: (api: Api, side: Side) => { router: unknown };
	// Given what `createClient(router)` returned and the page's record, which the result reads back.
	client: (client: ReturnType<typeof createClient>, record: unknown[]) => void;
	// The path the page loads. `/` when omitted.
	path?: string;
	// Runs on the hydrated page before the record is read: a click, a key, a wait.
	steps?: (tab: Page) => Promise<void>;
};

export type AppResult = { status: number; html: string; problems: string[]; record: unknown[] };

export const APP = "virtual:flare-hydrate/app-";
export const APP_CLIENT = "virtual:flare-hydrate/app-client-";

// The app module both sides import: the shared api and the case's app function.
export function appModule(imports: readonly string[], names: string, source: string): string {
	return [...imports, `export const api = { ${names} };`, `export const app = ${asExpression(source)};`].join("\n");
}

// A function's source as an expression: a method shorthand (`client(client, record) { … }`), as an object literal
// writes it, becomes a function expression; an arrow or a `function` stays as it is.
function asExpression(source: string): string {
	if (/^(?:async\s+)?(?:function\b|\()/.test(source) || /^(?:async\s+)?\w+\s*=>/.test(source)) return source;
	return source.replace(/^(async\s+)?/, (_, prefix: string | undefined) => `${prefix ?? ""}function `);
}

// The page's client entry: the real createClient over the app's router, then the case's callbacks, which push into
// the record the harness reads back. A throw is reported on the console with the other problems.
export function appClientModule(id: string, clientSource: string): string {
	return [
		`import { api, app } from ${JSON.stringify(`${APP}${id}`)};`,
		`import { createClient } from "/src/client/boot/create-client.ts";`,
		`const record = [];`,
		`window.__flareRecord = record;`,
		`try {`,
		`	const client = createClient(app(api, "client").router);`,
		`	(${asExpression(clientSource)})(client, record);`,
		`} catch (error) {`,
		`	console.error(String(error));`,
		`}`,
	].join("\n");
}

// A request the app answers rather than Vite: anything that is not one of Vite's own module paths.
export function isAppRequest(url: string): boolean {
	return !/^\/(?:@|src\/|node_modules\/|__)/.test(url);
}

// The real server's answer for the app, with the harness's client entry added before `</body>`: without flare(), the
// document carries no client script of its own (server/lifecycle/build-info.ts).
export async function appDocument(
	vite: ViteDevServer,
	input: { id: string; url: string; origin: string },
): Promise<{ status: number; headers: Headers; body: string }> {
	const ssr = vite.environments.ssr;
	if (!isRunnableDevEnvironment(ssr)) throw new Error("the SSR environment cannot run modules");
	const loaded: { api: Api; app: AppCase["app"] } = await ssr.runner.import(`${APP}${input.id}`);
	const create: { createServer: (options: { router: unknown }) => { fetch: (request: Request) => Promise<Response> } } =
		await ssr.runner.import("/src/server/lifecycle/create.ts");
	const response = await create
		.createServer({ router: loaded.app(loaded.api, "server").router })
		.fetch(new Request(`${input.origin}${input.url}`));
	const entry = `<script type="module" src="/@id/${APP_CLIENT}${input.id}"></script>`;
	const text = await response.text();
	// A root that renders no `<body>` leaves the document without one: the entry then goes last.
	const body = text.includes("</body>") ? text.replace("</body>", `${entry}</body>`) : `${text}${entry}`;
	return { status: response.status, headers: response.headers, body };
}

// Loads the app's page in a fresh context, waits for `createClient` to mark the document hydrated, runs the case's
// steps, and reads back the record and everything the page reported.
export async function appIn(at: { origin: string; tab: Page }, input: AppCase): Promise<AppResult> {
	const problems: string[] = [];
	const seen: string[] = [];
	at.tab.on("console", (message) => {
		seen.push(`${message.type()}: ${message.text()}`);
		if (message.type() === "error" || /hydration|key miss|unclaimed|STRICT_READ_UNTRACKED/i.test(message.text())) {
			problems.push(message.text());
		}
	});
	at.tab.on("pageerror", (error) => {
		seen.push(`pageerror: ${error.message}`);
		problems.push(`pageerror: ${error.message}`);
	});
	at.tab.on("requestfailed", (request) => void seen.push(`failed: ${request.url()} ${request.failure()?.errorText}`));
	at.tab.on("response", (answer) => {
		if (answer.status() >= 400) seen.push(`${answer.status()}: ${answer.url()}`);
	});
	const response = await at.tab.goto(`${at.origin}${input.path ?? "/"}`);
	const html = (await response?.text()) ?? "";
	await at.tab
		.waitForSelector("html[data-flare-hydrated]", { state: "attached", timeout: 10_000 })
		.catch((error: unknown) => {
			throw new Error(`the client did not hydrate: ${String(error)}\n${seen.join("\n")}\n${html.slice(-600)}`);
		});
	await input.steps?.(at.tab);
	const record: unknown[] = await at.tab.evaluate(() => Reflect.get(window, "__flareRecord") ?? []);
	return { status: response?.status() ?? 0, html, problems, record };
}

// Without flare(), nothing answers the dev server's `flare:styles` request, and a dev document would wait for it.
// The harness plays the dev server for an app with no stylesheet: every chain has no styles.
export function answerStyles(vite: ViteDevServer): void {
	vite.environments.ssr?.hot.on(
		STYLES_EVENT,
		(payload: unknown, client: { send: (event: string, data: unknown) => void }) => {
			const asked = stylesRequest(payload);
			if (asked !== undefined) client.send(STYLES_EVENT, { request: asked.request, styles: [] });
		},
	);
}
