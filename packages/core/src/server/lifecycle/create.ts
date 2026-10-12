import type { FlareRegister, RegisteredEnv, RegisteredServerContext } from "../../shared/route-builder/register.ts";
import type { ChainEntry, Router } from "../../shared/router/create-router.ts";
import { resolveCaller, type Caller } from "../auth/caller.ts";
import { withServerContext, type ServerContextInput } from "../context/ctx.ts";
import { runLoaders, type LoaderRun, type RunInput } from "../loaders/run.ts";
import { renderDocument } from "../render/document.ts";
import { mergeHead } from "../render/head.ts";
import { applySecurity, type SecurityConfig } from "../security/apply.ts";
import { applyCanonical } from "./canonical-redirect.ts";
import { finalize } from "./finalize.ts";
import { routeMethod } from "./methods.ts";

type Authenticate = (ctx: { request: Request; env: unknown } & Caller) => unknown;

type BaseOptions = {
	router: Router;
	authenticate?: Authenticate;
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig);
};

type ContextFn<R extends FlareRegister> = (ctx: {
	request: Request;
	env: RegisteredEnv<R>;
}) => RegisteredServerContext<R>;

// Required once the app's FlareRegister declares serverContext (B75).
type ContextOption<R extends FlareRegister> = unknown extends R["serverContext"]
	? { serverContext?: ContextFn<R> }
	: { serverContext: ContextFn<R> };

export type ServerOptions<R extends FlareRegister = FlareRegister> = BaseOptions & ContextOption<R>;

type RuntimeOptions = BaseOptions & { serverContext?: ServerContextInput["serverContext"] };

export type FlareServer = {
	fetch: (request: Request, env?: unknown) => Promise<Response>;
};

type Exchange = { options: RuntimeOptions; request: Request; env: unknown };

// The stages of order.ts, in that order: canonical, serverContext, match, method, then validate, the auth
// gate, and the loaders inside runLoaders, then render and finalize.
export function createServer<R extends FlareRegister = FlareRegister>(options: ServerOptions<R>): FlareServer;
export function createServer(options: RuntimeOptions): FlareServer {
	return {
		fetch(request, env) {
			const step = applyCanonical({
				url: request.url,
				trailingSlash: options.router.trailingSlash,
				caseSensitive: options.router.caseSensitive,
			});
			if (step.status !== 200) {
				return Promise.resolve(finalize({ status: step.status, body: "", location: step.location, url: request.url }));
			}
			return withServerContext(
				{ request, env, serverContext: options.serverContext },
				() => route({ options, request, env }),
				() => finalize({ status: 500, body: "", url: request.url }),
			);
		},
	};
}

function route(exchange: Exchange): Promise<Response> {
	const matched = exchange.options.router.match(new URL(exchange.request.url).pathname);
	const method = exchange.request.method;
	if (matched.id === undefined && (method === "GET" || method === "HEAD")) return notFound(exchange, matched.chain);
	return routeMethod(exchange.request, {
		match: () => (matched.id === undefined ? undefined : { kind: "page", render: () => page(exchange, matched.chain) }),
	});
}

// An unknown path runs the loaders of its not-found chain: the root layout, or the fuzzy owner and its
// ancestors (B73). Ranking a failure there against the 404 belongs to bit 05.
async function notFound(exchange: Exchange, chain: readonly ChainEntry[]): Promise<Response> {
	await runLoaders(loaderInput(exchange, chain));
	return finalize({ status: 404, body: "", url: exchange.request.url });
}

async function page(exchange: Exchange, chain: readonly ChainEntry[]): Promise<Response> {
	const run = await runLoaders(loaderInput(exchange, chain));
	if (run.response.status !== 200) return failed(exchange, run);
	const secured = applySecurity({
		url: exchange.request.url,
		headers: new Headers(),
		security: exchange.options.security,
	});
	const html = await renderDocument({
		request: exchange.request,
		router: exchange.options.router,
		nonce: secured.nonce,
		head: run.heads.reduce((merged, head) => mergeHead(merged, head), {}),
		render: () =>
			chain.slice(0, run.data.length).map((entry, index) => entry.module.render?.({ loaderData: run.data[index] })),
	});
	return finalize({ status: 200, body: html, render: "ssr", url: exchange.request.url, headers: secured.headers });
}

// The walked boundary that paints a failure is bit 05. Until then a failed chain answers with its status.
async function failed(exchange: Exchange, run: LoaderRun): Promise<Response> {
	const body = await run.response.text();
	return finalize({ status: run.response.status, body, headers: run.response.headers, url: exchange.request.url });
}

function loaderInput(exchange: Exchange, chain: readonly ChainEntry[]): RunInput {
	const routes = chain.map((entry) => ({ ...entry.module, id: entry.id }));
	return {
		kind: "document",
		request: exchange.request,
		env: exchange.env,
		authenticate: () => authenticate(exchange, routes),
		routes,
	};
}

// The app function runs once, when the chain reads identity. No function means no session.
function authenticate(exchange: Exchange, routes: RunInput["routes"]): unknown {
	const app = exchange.options.authenticate;
	if (app === undefined) return null;
	return resolveCaller(routes, (caller) => app({ request: exchange.request, env: exchange.env, ...caller }));
}
