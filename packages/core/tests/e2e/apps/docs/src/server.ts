import {
	createAssetsStore,
	createMiddleware,
	createServer,
	mount,
	type FlareStore,
	type MiddlewareEntry,
} from "@lovrozagar/flare/server";
import { i18n } from "@lovrozagar/flare/i18n/server";
import { indexNow } from "@lovrozagar/flare/seo";
import { createCacheApiStore } from "@lovrozagar/flare/stores/cache-api";
import { createFilesystemStore, fileAssets } from "@lovrozagar/flare/stores/fs";
import { fileURLToPath } from "node:url";
import { serverFns } from "./_gen/server-fns.gen.ts";
import { sessionOf } from "./session.ts";
import { localeConfig, router } from "./router.ts";

export const INDEX_NOW_KEY = "docs-indexnow-key-2026";

// Workers has the Cache API and no filesystem. Node and Bun write one directory per process under the temp dir, so
// a run never writes into the app and never reads another run's entries. The store is built once, outside any request.
const cacheStorage: unknown = Reflect.get(globalThis, "caches");
const onWorkers = typeof cacheStorage === "object" && cacheStorage !== null && "default" in cacheStorage;
const storeKind = onWorkers ? "cache-api" : "fs";
const store: FlareStore = onWorkers
	? createCacheApiStore({ cacheName: "docs" })
	: createFilesystemStore({ dir: `${process.env["TMPDIR"] ?? "/tmp"}/flare-docs-${process.pid}` });

// The prerendered seeds. On Workers the ASSETS binding serves the client output. On Node and Bun the files sit beside
// the built server, in `<outDir>/client`. `vite dev` has none, so an SSG page renders live there.
function seeds(env: unknown): FlareStore {
	const binding: unknown = typeof env === "object" && env !== null ? Reflect.get(env, "ASSETS") : undefined;
	if (typeof binding === "object" && binding !== null && "fetch" in binding && typeof binding.fetch === "function") {
		const fetch = binding.fetch.bind(binding);
		return createAssetsStore((path) => fetch(new URL(path, "http://assets")));
	}
	return createAssetsStore(fileAssets(fileURLToPath(new URL("../client", import.meta.url))));
}

// A fake upstream the docs pages read through `withFetchDedupe`. It counts its calls per request, so a page can show
// that the layout's and the page's identical reads cost one call.
function upstream(): { fetch: (input: string | URL | Request) => Promise<Response>; calls: () => number } {
	let calls = 0;
	return {
		calls: () => calls,
		async fetch() {
			calls += 1;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return Response.json({ stars: 4200, contributors: 37 });
		},
	};
}

// The router's Response is the app's to annotate. Returning void keeps it (dx/server.md Middleware).
function withHeader(response: Response, name: string, value: string): void {
	response.headers.set(name, value);
}

// The e2e boot's capture check (docs.fixture.ts, BUGS.md 93): one console line at this server's first request, which
// the boot must capture on every runtime, workerd's console included.
const probe = { logged: false };

const timing = createMiddleware(async (ctx) => {
	if (!probe.logged) {
		probe.logged = true;
		console.error("[docs:probe] server up");
	}
	const started = Date.now();
	const response = await ctx.next();
	withHeader(response, "x-docs-time", `${Date.now() - started}ms`);
	withHeader(response, "x-docs-store", storeKind);
});

const middleware: MiddlewareEntry[] = [
	timing,
	indexNow.file(INDEX_NOW_KEY),
	{
		filter: { exact: ["/maintenance"] },
		handler: (ctx) =>
			ctx.respond(new Response("Down for maintenance", { status: 503, headers: { "retry-after": "60" } })),
	},
	{
		filter: { kind: ["serverFn"] },
		handler: (ctx) => {
			if (ctx.request.headers.get("x-docs-ping") === "1") ctx.bypass(new Response("pong"));
		},
	},
	{
		filter: { prefix: ["/docs"] },
		handler: async (ctx) => {
			withHeader(await ctx.next(), "x-docs-section", "docs");
		},
	},
];

export const server = createServer({
	router,
	serverFns,
	site: "https://flare.test",
	locale: i18n(localeConfig),
	authenticate: ({ request, callerData }) => sessionOf(request, callerData),
	serverContext: () => ({ requestId: crypto.randomUUID().slice(0, 8), upstream: upstream() }),
	middleware,
	mounts: [mount("/healthz", (request) => Response.json({ ok: true, path: new URL(request.url).pathname }))],
	security: { "X-Frame-Options": "SAMEORIGIN" },
	sameSite: ["docs.flare.test"],
	bodyLimit: 64 * 1024,
	store,
	static: seeds,
});
