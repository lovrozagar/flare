import { shapeIssues, type Issue } from "../../shared/validation/issues.ts";
import { finalize } from "../lifecycle/finalize.ts";
import { cascade, type Failed, type LoaderFrame, type Outcome, type RequestKind, type Settled } from "./cascade.ts";

export type LoaderContext = { auth: unknown };

export type LoaderRoute = {
	id: string;
	validate?: () => readonly Issue[] | undefined;
	authenticate?: () => void;
	preloader?: (ctx: LoaderContext) => unknown;
	authorize?: (ctx: LoaderContext) => boolean | Promise<boolean>;
	loader?: (ctx: LoaderContext) => unknown;
	head?: () => void;
	headers?: () => void;
};

export type RunInput = {
	kind: RequestKind;
	session?: unknown;
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
	const ctx = { auth: input.session ?? null };
	for (const route of input.routes) route.authenticate?.();
	const blocked = await preload(input.routes, ctx);
	if (blocked !== undefined) return conclude(input, [blocked]);
	await authorizeAll(input.routes, ctx);
	input.readStore?.();
	return conclude(input, await load(input.routes, ctx));
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

async function preload(routes: readonly LoaderRoute[], ctx: LoaderContext): Promise<Outcome | undefined> {
	for (const route of routes) {
		if (route.preloader === undefined) continue;
		try {
			await route.preloader(ctx);
		} catch (error) {
			return { id: route.id, settled: { ok: false, error } };
		}
	}
	return undefined;
}

async function authorizeAll(routes: readonly LoaderRoute[], ctx: LoaderContext): Promise<void> {
	for (const route of routes) {
		if (route.authorize === undefined) continue;
		await route.authorize(ctx);
	}
}

function load(routes: readonly LoaderRoute[], ctx: LoaderContext): Promise<Outcome[]> {
	return Promise.all(
		routes.map(async (route): Promise<Outcome> => ({ id: route.id, settled: await settle(route, ctx) })),
	);
}

async function settle(route: LoaderRoute, ctx: LoaderContext): Promise<Settled> {
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
