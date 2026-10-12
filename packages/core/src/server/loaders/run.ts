import { statusOf } from "../../shared/errors/status.ts";
import { shapeIssues, type Issue } from "../../shared/validation/issues.ts";
import { finalize } from "../lifecycle/finalize.ts";

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
	kind: "document" | "data";
	session?: unknown;
	shared?: boolean;
	readStore?: () => void;
	overlay?: () => void;
	routes: readonly LoaderRoute[];
};

export async function runLoaders(input: RunInput): Promise<Response> {
	const invalid = collectIssues(input.routes);
	if (invalid !== undefined) return json(shapeIssues(invalid));
	const ctx = { auth: input.session ?? null };
	for (const route of input.routes) route.authenticate?.();
	const failed = await preload(input.routes, ctx);
	if (failed !== undefined) return failed;
	await authorizeAll(input.routes, ctx);
	input.readStore?.();
	await load(input.routes, ctx);
	for (const route of input.routes) finish(route);
	return finalize({ status: 200, body: "" });
}

function collectIssues(routes: readonly LoaderRoute[]): readonly Issue[] | undefined {
	for (const route of routes) {
		if (route.validate === undefined) continue;
		const found = route.validate();
		if (found !== undefined) return found;
	}
	return undefined;
}

async function preload(routes: readonly LoaderRoute[], ctx: LoaderContext): Promise<Response | undefined> {
	for (const route of routes) {
		if (route.preloader === undefined) continue;
		try {
			await route.preloader(ctx);
		} catch (error) {
			return finalize({ status: statusOf(error), body: "" });
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

async function load(routes: readonly LoaderRoute[], ctx: LoaderContext): Promise<void> {
	const pending: Promise<unknown>[] = [];
	for (const route of routes) {
		if (route.loader === undefined) continue;
		pending.push(Promise.resolve(route.loader(ctx)));
	}
	await Promise.all(pending);
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
