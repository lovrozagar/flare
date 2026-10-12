import type {
	CacheConfig,
	ChainAuth,
	LoaderContext,
	PreloaderContext,
	Respond,
	StepContext,
} from "../../shared/route-builder/chain.ts";
import { statusOf } from "../../shared/errors/status.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import { shapeIssues, type Issue } from "../../shared/validation/issues.ts";
import { gate } from "../auth/gate.ts";
import type { PolicyClass } from "../auth/identity.ts";
import { finalize } from "../lifecycle/finalize.ts";
import { cascade, type Failed, type LoaderFrame, type Outcome, type RequestKind, type Settled } from "./cascade.ts";
import { createDefer, type DeferMode, type Started } from "./defer.ts";

export type LoaderRoute = {
	id: string;
	auth?: ChainAuth;
	validate?: () => readonly Issue[] | undefined;
	preloader?: (ctx: StepContext) => unknown;
	authorize?: (ctx: StepContext) => boolean | Promise<boolean>;
	loader?: (ctx: LoaderContext) => unknown;
	cache?: CacheConfig;
	head?: (ctx: { loaderData: unknown; preloaderContext: PreloaderContext }) => HeadConfig;
	headers?: () => void;
};

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
	dev?: boolean;
	stored?: boolean;
	skip?: ReadonlySet<string>;
};

// One deferred value a kept match started. A live response writes it as a `c` or `e` frame.
export type DeferredFrame = { m: string; k: string; promise: Promise<unknown> };

type Loaded = Outcome & { started: readonly Started[] };

type Loading = { routes: readonly LoaderRoute[]; base: StepContext; contexts: readonly PreloaderContext[] };

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
	failed?: Failed;
	class?: PolicyClass;
	answer?: Response;
	thrown?: unknown;
	bugs: readonly unknown[];
	deferred: readonly DeferredFrame[];
};

export async function runLoaders(input: RunInput): Promise<LoaderRun> {
	const invalid = collectIssues(input.routes);
	if (invalid !== undefined) return bare(json(shapeIssues(invalid)));
	const gated = await gate(input);
	if (gated.kind === "status") return { ...bare(finalize({ status: gated.status, body: "" })), thrown: gated.thrown };
	// A .response() page runs no loader and no render. A stopped gate answers with its status alone.
	if (input.response !== undefined) {
		if (gated.kind === "stopped") return bare(finalize({ status: statusOf(gated.error), body: "" }));
		return { ...bare(finalize({ status: 200, body: "" })), class: gated.class, answer: await gated.answer };
	}
	const base = { auth: gated.session, request: input.request, env: input.env };
	const contexts = gated.contexts;
	if (gated.kind === "proceed") {
		const loaded = await load(input, { routes: input.routes, base, contexts });
		return { ...conclude(input, loaded, contexts), class: gated.class };
	}
	// Matches outside the stopped one still load. It and everything inside it do not (B27, B29).
	const outer = await load(input, { routes: input.routes.slice(0, gated.index), base, contexts });
	const error = gated.error;
	const stopped = { id: input.routes[gated.index].id, settled: { ok: false as const, error }, started: [] };
	return conclude(input, [...outer, stopped], contexts);
}

function bare(response: Response): LoaderRun {
	return { response, frames: [], data: [], heads: [], contexts: [], bugs: [], deferred: [] };
}

function conclude(input: RunInput, outcomes: readonly Loaded[], contexts: readonly PreloaderContext[]): LoaderRun {
	const result = cascade(input.kind, outcomes);
	const kept = contexts.slice(0, result.kept.length);
	const bugs: unknown[] = [];
	// A skipped match ran no loader, so its head would read no data. It writes no `h` either.
	const heads = result.kept.map((frame, index) => {
		const route = input.routes[index];
		return input.skip?.has(route.id) === true ? undefined : finish(route, { frame, kept: kept[index], bugs });
	});
	// Only a bug opens the dev overlay. A named status and an input failure do not (B76).
	if (result.failed?.status === 500) input.overlay?.(result.failed.error);
	return {
		response: finalize({ status: result.status, body: "" }),
		frames: result.frames,
		data: result.kept.map((frame) => frame.d),
		heads,
		contexts: kept,
		failed: result.failed,
		bugs,
		deferred: outcomes
			.slice(0, result.kept.length)
			.flatMap((outcome) => outcome.started.map((entry) => ({ m: outcome.id, k: entry.key, promise: entry.promise }))),
	};
}

function collectIssues(routes: readonly LoaderRoute[]): readonly Issue[] | undefined {
	for (const route of routes) {
		if (route.validate === undefined) continue;
		const found = route.validate();
		if (found !== undefined) return found;
	}
	return undefined;
}

// Each loader sees the preloader context through its own match: parents, then its own return. Each gets its
// own defer scope, so default keys count from d0 per loader.
function load(input: RunInput, loading: Loading): Promise<Loaded[]> {
	return Promise.all(
		loading.routes.map(async (route, index): Promise<Loaded> => {
			const scope = createDefer({
				stored: input.stored ?? false,
				route: deferMode(route.cache),
				dev: input.dev ?? false,
				prefetch: input.kind === "prefetch",
			});
			const ctx = { ...loading.base, preloaderContext: loading.contexts[index], defer: scope.defer };
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

function finish(route: LoaderRoute, at: Finish): HeadConfig | undefined {
	const head = headOf(route, at);
	route.headers?.();
	return head;
}

function headOf(route: LoaderRoute, at: Finish): HeadConfig | undefined {
	try {
		return route.head?.({ loaderData: at.frame.d, preloaderContext: at.kept });
	} catch (error) {
		at.bugs.push(error);
		return undefined;
	}
}

function json(value: unknown): Response {
	return finalize({
		status: 400,
		body: JSON.stringify(value),
		headers: new Headers({ "content-type": "application/json" }),
	});
}
