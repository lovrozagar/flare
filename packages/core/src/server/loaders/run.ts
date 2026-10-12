import { shapeIssues, type Issue } from "../../shared/validation/issues.ts";
import type { AuthModule } from "../auth/effective.ts";
import { gate, type AuthContext } from "../auth/gate.ts";
import { finalize } from "../lifecycle/finalize.ts";
import { cascade, type Failed, type LoaderFrame, type Outcome, type RequestKind, type Settled } from "./cascade.ts";

export type LoaderRoute = {
	id: string;
	auth?: Omit<AuthModule, "authorize">;
	validate?: () => readonly Issue[] | undefined;
	preloader?: (ctx: AuthContext) => unknown;
	authorize?: (ctx: AuthContext) => boolean | Promise<boolean>;
	loader?: (ctx: AuthContext) => unknown;
	head?: () => void;
	headers?: () => void;
};

export type RunInput = {
	kind: RequestKind;
	authenticate: () => unknown;
	shared?: boolean;
	readStore?: () => void;
	overlay?: (error: unknown) => void;
	routes: readonly LoaderRoute[];
};

export type LoaderRun = {
	response: Response;
	frames: readonly LoaderFrame[];
	failed?: Failed;
};

export async function runLoaders(input: RunInput): Promise<LoaderRun> {
	const invalid = collectIssues(input.routes);
	if (invalid !== undefined) return { response: json(shapeIssues(invalid)), frames: [] };
	const gated = await gate(input);
	if (gated.kind === "status") return { response: finalize({ status: gated.status, body: "" }), frames: [] };
	if (gated.kind === "proceed") return conclude(input, await load(input.routes, { auth: gated.session }));
	// Matches outside the stopped one still load. It and everything inside it do not (B27, B29).
	const outer = await load(input.routes.slice(0, gated.index), { auth: gated.session });
	const stopped = { id: input.routes[gated.index].id, settled: { ok: false as const, error: gated.error } };
	return conclude(input, [...outer, stopped]);
}

function conclude(input: RunInput, outcomes: readonly Outcome[]): LoaderRun {
	const result = cascade(input.kind, outcomes);
	for (const route of input.routes) {
		if (result.finished.includes(route.id)) finish(route);
	}
	// Only a bug opens the dev overlay. A named status and an input failure do not (B76).
	if (result.failed?.status === 500) input.overlay?.(result.failed.error);
	return { response: finalize({ status: result.status, body: "" }), frames: result.frames, failed: result.failed };
}

function collectIssues(routes: readonly LoaderRoute[]): readonly Issue[] | undefined {
	for (const route of routes) {
		if (route.validate === undefined) continue;
		const found = route.validate();
		if (found !== undefined) return found;
	}
	return undefined;
}

function load(routes: readonly LoaderRoute[], ctx: AuthContext): Promise<Outcome[]> {
	return Promise.all(
		routes.map(async (route): Promise<Outcome> => ({ id: route.id, settled: await settle(route, ctx) })),
	);
}

async function settle(route: LoaderRoute, ctx: AuthContext): Promise<Settled> {
	try {
		return { ok: true, data: await route.loader?.(ctx) };
	} catch (error) {
		return { ok: false, error };
	}
}

function finish(route: LoaderRoute): void {
	route.head?.();
	route.headers?.();
}

function json(value: unknown): Response {
	return finalize({
		status: 400,
		body: JSON.stringify(value),
		headers: new Headers({ "content-type": "application/json" }),
	});
}
