import { defined } from "../../shared/errors/index.ts";
import type {
	CacheConfig,
	ChainAuth,
	LoaderContext,
	PreloaderContext,
	Respond,
	RouteHeaders,
	RouteInput,
	RouteSecurity,
	StepContext,
} from "../../shared/route-builder/chain.ts";
import { statusOf } from "../../shared/errors/status.ts";
import type { HeadConfig, SecurityConfig } from "../../shared/route-builder/types.ts";
import { runValidator, type Validated, type Validator } from "../../shared/validation/index.ts";
import { gate } from "../auth/gate.ts";
import type { PolicyClass } from "../auth/identity.ts";
import { finalize } from "../lifecycle/finalize.ts";
import { mergeHeaders } from "../security/apply.ts";
import { cascade, type Failed, type LoaderFrame, type Outcome, type RequestKind, type Settled } from "./cascade.ts";
import { createDefer, type DeferMode, type Started } from "./defer.ts";

export type LoaderRoute = {
	id: string;
	auth?: ChainAuth;
	input?: RouteInput;
	preloader?: (ctx: StepContext) => unknown;
	authorize?: (ctx: StepContext) => boolean | Promise<boolean>;
	loader?: (ctx: LoaderContext) => unknown;
	cache?: CacheConfig;
	head?: (ctx: View) => HeadConfig;
	headers?: (ctx: View) => RouteHeaders;
	security?: RouteSecurity;
};

type View = { params: unknown; search: unknown; loaderData: unknown; preloaderContext: PreloaderContext };

export type RunInput = {
	kind: RequestKind;
	request: Request;
	env: unknown;
	authenticate: () => unknown;
	shared?: boolean;
	readStore?: () => void;
	overlay?: (error: unknown) => void;
	response?: Respond;
	routes: readonly LoaderRoute[];
	// The raw records every match's `.input()` validators read.
	// The raw records each validator receives (dx/types.md): no absent optional param, and search as read.
	params?: Readonly<Record<string, string | string[]>>;
	search?: Readonly<Record<string, string | string[]>>;
	dev?: boolean;
	stored?: boolean;
	skip?: ReadonlySet<string>;
};

// One deferred value a kept match started. A live response writes it as a `c` or `e` frame.
export type DeferredFrame = { m: string; k: string; promise: Promise<unknown> };

type Loaded = Outcome & { started: readonly Started[] };

// A route after its `.input()`: `params` and `search` are the raw records or that side's validator output.
type ValidRoute = LoaderRoute & { params: unknown; search: unknown };

type ValidRun = Omit<RunInput, "routes"> & { routes: readonly ValidRoute[] };

type Loading = {
	routes: readonly ValidRoute[];
	base: Pick<StepContext, "auth" | "request" | "env">;
	contexts: readonly PreloaderContext[];
};

// `data`, `heads`, and `contexts` are the root-down matches above the first failure, the ones that render.
// `thrown` is what authenticate threw when the gate answered with its status. `deferred` is what the kept
// matches started. A match in `skip` runs no loader: the client still holds it (B30). `bugs` are .head() throws: that
// head is omitted and the status stays the loader status (B82). The caller reports them as dev bugs.
// A match with no .head() has an undefined head. `contexts` is the preloader context through each match.
export type LoaderRun = {
	response: Response;
	frames: readonly LoaderFrame[];
	data: readonly unknown[];
	heads: readonly (HeadConfig | undefined)[];
	contexts: readonly PreloaderContext[];
	// Each match's params and search, after its `.input()`. `validated` is a match that has one.
	inputs: readonly { params: unknown; search: unknown; validated: boolean }[];
	failed?: Failed | undefined;
	class?: PolicyClass;
	answer?: Response | undefined;
	thrown?: unknown;
	bugs: readonly unknown[];
	deferred: readonly DeferredFrame[];
	// The `.headers()` and `.security()` of every match whose loader resolved, merged root to page.
	headers: Readonly<Record<string, string | string[]>>;
	security: SecurityConfig;
};

export async function runLoaders(input: RunInput): Promise<LoaderRun> {
	const validated = await validateInputs(input);
	if (!validated.ok) return bare(json(validated.errors));
	const routes = validated.routes;
	const gated = await gate({ ...input, routes });
	if (gated.kind === "status") return { ...bare(finalize({ status: gated.status, body: "" })), thrown: gated.thrown };
	// A .response() page runs no loader and no render. A stopped gate answers with its status alone.
	if (input.response !== undefined) {
		if (gated.kind === "stopped") return bare(finalize({ status: statusOf(gated.error), body: "" }));
		return { ...bare(finalize({ status: 200, body: "" })), class: gated.class, answer: await gated.answer };
	}
	const base = { auth: gated.session, request: input.request, env: input.env };
	const contexts = gated.contexts;
	const run = { ...input, routes };
	if (gated.kind === "proceed") {
		const loaded = await load(run, { routes, base, contexts });
		return { ...conclude(run, loaded, contexts), class: gated.class };
	}
	// Matches outside the stopped one still load. It and everything inside it do not (B27, B29).
	const outer = await load(run, { routes: routes.slice(0, gated.index), base, contexts });
	const error = gated.error;
	const stopped = {
		id: defined(routes[gated.index], "the stopped match").id,
		settled: { ok: false as const, error },
		started: [],
	};
	return conclude(run, [...outer, stopped], contexts);
}

function bare(response: Response): LoaderRun {
	return {
		response,
		frames: [],
		data: [],
		heads: [],
		contexts: [],
		inputs: [],
		bugs: [],
		deferred: [],
		headers: {},
		security: {},
	};
}

function conclude(input: ValidRun, outcomes: readonly Loaded[], contexts: readonly PreloaderContext[]): LoaderRun {
	const result = cascade(input.kind, outcomes);
	const kept = contexts.slice(0, result.kept.length);
	const bugs: unknown[] = [];
	// A skipped match ran no loader, so its head would read no data. It writes no `h` either.
	const heads = result.kept.map((frame, index) => {
		const route = defined(input.routes[index], "the kept match");
		return input.skip?.has(route.id) === true
			? undefined
			: finish(route, { frame, kept: defined(kept[index], "the kept context"), bugs });
	});
	// Only a bug opens the dev overlay. A named status and an input failure do not (B76).
	if (result.failed?.status === 500) input.overlay?.(result.failed.error);
	return {
		response: finalize({ status: result.status, body: "" }),
		frames: result.frames,
		data: result.kept.map((frame) => frame.d),
		heads,
		contexts: kept,
		inputs: input.routes.map((route) => ({
			params: route.params,
			search: route.search,
			validated: route.input !== undefined,
		})),
		failed: result.failed,
		...routeSteps(input, { outcomes, contexts, bugs }),
		bugs,
		deferred: outcomes
			.slice(0, result.kept.length)
			.flatMap((outcome) => outcome.started.map((entry) => ({ m: outcome.id, k: entry.key, promise: entry.promise }))),
	};
}

// Every match's validators run root-down on the raw records, before authenticate (02-system step 10). The first
// failure is the whole answer.
async function validateInputs(
	input: RunInput,
): Promise<{ ok: true; routes: ValidRoute[] } | Extract<Validated, { ok: false }>> {
	const dev = input.dev ?? false;
	const routes: ValidRoute[] = [];
	for (const route of input.routes) {
		const params = await side(route.input?.params, input.params ?? {}, dev);
		if (!params.ok) return params;
		const search = await side(route.input?.searchParams, input.search ?? {}, dev);
		if (!search.ok) return search;
		routes.push({ ...route, params: params.value, search: search.value });
	}
	return { ok: true, routes };
}

function side(
	validator: Validator<Record<string, string | string[]>> | undefined,
	raw: Readonly<Record<string, string | string[]>>,
	dev: boolean,
): Promise<Validated> {
	return validator === undefined ? Promise.resolve({ ok: true, value: raw }) : runValidator(validator, raw, { dev });
}

// Each loader sees the preloader context through its own match: parents, then its own return. Each gets its
// own defer scope, so default keys count from d0 per loader.
function load(input: ValidRun, loading: Loading): Promise<Loaded[]> {
	return Promise.all(
		loading.routes.map(async (route, index): Promise<Loaded> => {
			const scope = createDefer({
				stored: input.stored ?? false,
				route: deferMode(route.cache),
				dev: input.dev ?? false,
				prefetch: input.kind === "prefetch",
			});
			const ctx = {
				...loading.base,
				params: route.params,
				search: route.search,
				preloaderContext: loading.contexts[index],
				defer: scope.defer,
			};
			const settled =
				input.skip?.has(route.id) === true
					? { ok: true as const, data: undefined }
					: await settle(route, ctx, input.dev ?? false);
			return { id: route.id, settled, started: scope.started };
		}),
	);
}

// The route's stored defer mode, from `cache.ssr.defer` or `cache.ssg.defer`.
function deferMode(cache: CacheConfig | undefined): DeferMode | undefined {
	if (cache?.ssr !== undefined) return cache.ssr.defer;
	return typeof cache?.ssg === "object" ? cache.ssg.defer : undefined;
}

async function settle(route: LoaderRoute, ctx: LoaderContext, dev: boolean): Promise<Settled> {
	try {
		const data: unknown = await route.loader?.(ctx);
		// `null` is an object here. A primitive cannot stay live through the hooks (dx/builder.md).
		if (dev && data !== undefined && typeof data !== "object") {
			throw new Error(`${route.id}: a loader returns an object or nothing, not a ${typeof data}`);
		}
		return { ok: true, data };
	} catch (error) {
		return { ok: false, error };
	}
}

type Finish = { frame: { d: unknown }; kept: PreloaderContext; bugs: unknown[] };

function finish(route: ValidRoute, at: Finish): HeadConfig | undefined {
	try {
		const values = { params: route.params, search: route.search };
		return route.head?.({ ...values, loaderData: at.frame.d, preloaderContext: at.kept });
	} catch (error) {
		at.bugs.push(error);
		return undefined;
	}
}

// Each match whose loader resolved writes its `.headers()` and `.security()`, root to page (dx/builder.md). A match
// whose loader threw writes neither, though a later match may, and a throw omits that match's step alone (B82).
// Headers merge with `set-cookie` appending. Security merges outside-in: a set key replaces, and `false` removes.
function routeSteps(
	input: ValidRun,
	{ outcomes, contexts, bugs }: { outcomes: readonly Loaded[]; contexts: readonly PreloaderContext[]; bugs: unknown[] },
): Pick<LoaderRun, "headers" | "security"> {
	let headers: Record<string, string | string[]> = {};
	let security: SecurityConfig = {};
	const step = (run: () => void): void => {
		try {
			run();
		} catch (error) {
			bugs.push(error);
		}
	};
	for (const [index, outcome] of outcomes.entries()) {
		const route = defined(input.routes[index], "the loaded match");
		if (!outcome.settled.ok || input.skip?.has(route.id) === true) continue;
		const preloaderContext = defined(contexts[index], "the loaded context");
		const view = { params: route.params, search: route.search, loaderData: outcome.settled.data, preloaderContext };
		const { headers: own, security: policy } = route;
		if (own !== undefined) step(() => (headers = mergeHeaders(headers, own(view))));
		if (policy !== undefined)
			step(() => (security = { ...security, ...(typeof policy === "function" ? policy(view) : policy) }));
	}
	return { headers, security };
}

function json(value: unknown): Response {
	return finalize({
		status: 400,
		body: JSON.stringify(value),
		headers: new Headers({ "content-type": "application/json" }),
	});
}
