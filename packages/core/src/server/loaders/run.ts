import type { ChainAuth, StepContext } from "../../shared/route-builder/chain.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import { shapeIssues, type Issue } from "../../shared/validation/issues.ts";
import { gate } from "../auth/gate.ts";
import { finalize } from "../lifecycle/finalize.ts";
import { cascade, type Failed, type LoaderFrame, type Outcome, type RequestKind, type Settled } from "./cascade.ts";

export type LoaderRoute = {
	id: string;
	auth?: ChainAuth;
	validate?: () => readonly Issue[] | undefined;
	preloader?: (ctx: StepContext) => unknown;
	authorize?: (ctx: StepContext) => boolean | Promise<boolean>;
	loader?: (ctx: StepContext) => unknown;
	head?: (ctx: { loaderData: unknown }) => HeadConfig;
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
	routes: readonly LoaderRoute[];
};

// `data` and `heads` are the root-down matches above the first failure, the ones that render.
export type LoaderRun = {
	response: Response;
	frames: readonly LoaderFrame[];
	data: readonly unknown[];
	heads: readonly HeadConfig[];
	failed?: Failed;
};

export async function runLoaders(input: RunInput): Promise<LoaderRun> {
	const invalid = collectIssues(input.routes);
	if (invalid !== undefined) return bare(json(shapeIssues(invalid)));
	const gated = await gate(input);
	if (gated.kind === "status") return bare(finalize({ status: gated.status, body: "" }));
	const ctx = { auth: gated.session, request: input.request, env: input.env };
	if (gated.kind === "proceed") return conclude(input, await load(input.routes, ctx));
	// Matches outside the stopped one still load. It and everything inside it do not (B27, B29).
	const outer = await load(input.routes.slice(0, gated.index), ctx);
	const stopped = { id: input.routes[gated.index].id, settled: { ok: false as const, error: gated.error } };
	return conclude(input, [...outer, stopped]);
}

function bare(response: Response): LoaderRun {
	return { response, frames: [], data: [], heads: [] };
}

function conclude(input: RunInput, outcomes: readonly Outcome[]): LoaderRun {
	const result = cascade(input.kind, outcomes);
	const heads = result.kept.flatMap((frame, index) => finish(input.routes[index], frame.d));
	// Only a bug opens the dev overlay. A named status and an input failure do not (B76).
	if (result.failed?.status === 500) input.overlay?.(result.failed.error);
	return {
		response: finalize({ status: result.status, body: "" }),
		frames: result.frames,
		data: result.kept.map((frame) => frame.d),
		heads,
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

function load(routes: readonly LoaderRoute[], ctx: StepContext): Promise<Outcome[]> {
	return Promise.all(
		routes.map(async (route): Promise<Outcome> => ({ id: route.id, settled: await settle(route, ctx) })),
	);
}

async function settle(route: LoaderRoute, ctx: StepContext): Promise<Settled> {
	try {
		return { ok: true, data: await route.loader?.(ctx) };
	} catch (error) {
		return { ok: false, error };
	}
}

function finish(route: LoaderRoute, loaderData: unknown): HeadConfig[] {
	const head = route.head?.({ loaderData });
	route.headers?.();
	return head === undefined ? [] : [head];
}

function json(value: unknown): Response {
	return finalize({
		status: 400,
		body: JSON.stringify(value),
		headers: new Headers({ "content-type": "application/json" }),
	});
}
