import type { ChainAuth, PreloaderContext, Respond, StepContext } from "../../shared/route-builder/chain.ts";
import { statusOf } from "../../shared/errors/status.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import { shapeIssues, type Issue } from "../../shared/validation/issues.ts";
import { gate } from "../auth/gate.ts";
import type { PolicyClass } from "../auth/identity.ts";
import { finalize } from "../lifecycle/finalize.ts";
import { cascade, type Failed, type LoaderFrame, type Outcome, type RequestKind, type Settled } from "./cascade.ts";

export type LoaderRoute = {
	id: string;
	auth?: ChainAuth;
	validate?: () => readonly Issue[] | undefined;
	preloader?: (ctx: StepContext) => unknown;
	authorize?: (ctx: StepContext) => boolean | Promise<boolean>;
	loader?: (ctx: StepContext) => unknown;
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
};

// `data`, `heads`, and `contexts` are the root-down matches above the first failure, the ones that render.
// `thrown` is what authenticate threw when the gate answered with its status.
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
		return { ...conclude(input, await load(input.routes, base, contexts), contexts), class: gated.class };
	}
	// Matches outside the stopped one still load. It and everything inside it do not (B27, B29).
	const outer = await load(input.routes.slice(0, gated.index), base, contexts);
	const stopped = { id: input.routes[gated.index].id, settled: { ok: false as const, error: gated.error } };
	return conclude(input, [...outer, stopped], contexts);
}

function bare(response: Response): LoaderRun {
	return { response, frames: [], data: [], heads: [], contexts: [] };
}

function conclude(input: RunInput, outcomes: readonly Outcome[], contexts: readonly PreloaderContext[]): LoaderRun {
	const result = cascade(input.kind, outcomes);
	const kept = contexts.slice(0, result.kept.length);
	const heads = result.kept.map((frame, index) => finish(input.routes[index], frame.d, kept[index]));
	// Only a bug opens the dev overlay. A named status and an input failure do not (B76).
	if (result.failed?.status === 500) input.overlay?.(result.failed.error);
	return {
		response: finalize({ status: result.status, body: "" }),
		frames: result.frames,
		data: result.kept.map((frame) => frame.d),
		heads,
		contexts: kept,
		failed: result.failed,
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

// Each loader sees the preloader context through its own match: parents, then its own return.
function load(
	routes: readonly LoaderRoute[],
	base: StepContext,
	contexts: readonly PreloaderContext[],
): Promise<Outcome[]> {
	return Promise.all(
		routes.map(async (route, index): Promise<Outcome> => ({
			id: route.id,
			settled: await settle(route, { ...base, preloaderContext: contexts[index] }),
		})),
	);
}

async function settle(route: LoaderRoute, ctx: StepContext): Promise<Settled> {
	try {
		return { ok: true, data: await route.loader?.(ctx) };
	} catch (error) {
		return { ok: false, error };
	}
}

function finish(route: LoaderRoute, loaderData: unknown, preloaderContext: PreloaderContext): HeadConfig | undefined {
	const head = route.head?.({ loaderData, preloaderContext });
	route.headers?.();
	return head;
}

function json(value: unknown): Response {
	return finalize({
		status: 400,
		body: JSON.stringify(value),
		headers: new Headers({ "content-type": "application/json" }),
	});
}
