import { expect, it } from "vitest";
import type { Issue } from "../../shared/validation/issues.ts";
import { runLoaders, type LoaderRoute, type RunInput } from "./run.ts";

const session = { id: "ada" };
const issue: Issue = { message: "required", path: ["email"] };
const boom = new Error("boom");

function noop(): void {}

function request(routes: readonly LoaderRoute[], extra: Partial<RunInput> = {}): RunInput {
	return { kind: "document", authenticate: () => null, routes, ...extra };
}

function throws(): never {
	throw boom;
}

type Traced = { seen: string[]; status: number };

async function traced(extra: Partial<RunInput>, authorized = true): Promise<Traced> {
	const seen: string[] = [];
	const route: LoaderRoute = {
		id: "page",
		auth: { authenticateOptional: true },
		validate: () => {
			seen.push("validate");
			return undefined;
		},
		preloader: () => seen.push("preloader"),
		authorize: () => {
			seen.push("authorize");
			return authorized;
		},
		loader: () => seen.push("loader"),
		head: () => seen.push("head"),
		headers: () => seen.push("headers"),
	};
	const run = await runLoaders(
		request([route], {
			authenticate: () => {
				seen.push("authenticate");
				return session;
			},
			shared: true,
			readStore: () => seen.push("store"),
			...extra,
		}),
	);
	return { seen, status: run.response.status };
}

it("order", async () => {
	const shared = await traced({});
	expect(shared.seen).toEqual([
		"validate",
		"authenticate",
		"preloader",
		"authorize",
		"store",
		"loader",
		"head",
		"headers",
	]);
	const data = await traced({ kind: "data" });
	expect(data.seen).toEqual(["validate", "authenticate", "preloader", "authorize", "loader", "head", "headers"]);
	const prefetch = await traced({ kind: "prefetch" });
	expect(prefetch.seen).not.toContain("store");
	const notShared = await traced({ shared: false });
	expect(notShared.seen).toEqual(["validate", "authenticate", "preloader", "authorize", "loader", "head", "headers"]);
	const denied = await traced({}, false);
	expect(denied.status).toBe(403);
	expect(denied.seen).toEqual(["validate", "authenticate", "preloader", "authorize"]);
	const broken = await traced({ authenticate: throws });
	expect(broken.status).toBe(500);
	expect(broken.seen).toEqual(["validate"]);
});

it("auth args", async () => {
	const seen: unknown[] = [];
	await runLoaders(
		request(
			[
				{
					id: "page",
					auth: { authenticate: true },
					preloader: (ctx) => seen.push(ctx.auth),
					authorize: (ctx) => {
						seen.push(ctx.auth);
						return true;
					},
					loader: (ctx) => seen.push(ctx.auth),
				},
			],
			{ authenticate: () => session },
		),
	);
	expect(seen).toEqual([session, session, session]);
	const authorizeOnly: unknown[] = [];
	await runLoaders(
		request(
			[
				{
					id: "page",
					authorize: (ctx) => {
						authorizeOnly.push(ctx.auth);
						return true;
					},
				},
			],
			{ authenticate: () => session },
		),
	);
	expect(authorizeOnly).toEqual([session]);
});

it("authorize is sequential", async () => {
	let release: () => void = noop;
	const gate = new Promise<boolean>((resolve) => {
		release = () => resolve(true);
	});
	let loaderStarted = false;
	const pending = runLoaders(
		request([
			{ id: "layout", authorize: () => gate },
			{
				id: "page",
				loader: () => {
					loaderStarted = true;
				},
			},
		]),
	);
	await flush();
	expect(loaderStarted).toBe(false);
	release();
	await pending;
	expect(loaderStarted).toBe(true);
	const seen: string[] = [];
	const denied = await runLoaders(
		request([
			{
				id: "root",
				loader: () => {
					seen.push("root loader");
					return "root data";
				},
			},
			{
				id: "layout",
				preloader: () => seen.push("layout pre"),
				authorize: () => {
					seen.push("layout authz");
					return false;
				},
				loader: () => seen.push("layout loader"),
			},
			{ id: "page", preloader: () => seen.push("page pre"), loader: () => seen.push("page loader") },
		]),
	);
	expect(denied.response.status).toBe(403);
	expect(seen).toEqual(["layout pre", "layout authz", "root loader"]);
	expect(denied.frames).toEqual([{ t: "l", m: "root", d: "root data" }]);
});

it("loaders are parallel", async () => {
	let started = 0;
	let release: () => void = noop;
	const both = new Promise<void>((resolve) => {
		release = resolve;
	});
	const loader = (): Promise<void> => {
		started += 1;
		return both;
	};
	const pending = runLoaders(
		request([
			{ id: "a", loader },
			{ id: "b", loader },
		]),
	);
	await flush();
	expect(started).toBe(2);
	release();
	await pending;
});

it("input failure", async () => {
	const result = await fail("document");
	expect(result.status).toBe(400);
	expect(result.contentType).toBe("application/json");
	expect(result.body).not.toContain("<");
	expect(JSON.parse(result.body)).toEqual({
		issues: [issue],
		fieldErrors: { email: ["required"] },
	});
	expect(result.authenticated).toBe(false);
	expect(result.overlay).toBe(false);
});

it("data input", async () => {
	const result = await fail("data");
	expect(result.status).toBe(400);
	expect(result.contentType).toBe("application/json");
	expect(JSON.parse(result.body)).toEqual({
		issues: [issue],
		fieldErrors: { email: ["required"] },
	});
	expect(result.body).not.toContain('"t":"e"');
});

it("preloader throw", async () => {
	const page = await runLoaders(request([{ id: "page", preloader: throws }]));
	expect(page.response.status).toBe(500);
	expect(page.failed).toEqual({ m: "page", status: 500, boundary: "errorRender", error: boom });
	let descendant = false;
	const layout = await runLoaders(
		request([
			{ id: "layout", preloader: throws },
			{
				id: "page",
				loader: () => {
					descendant = true;
				},
			},
		]),
	);
	expect(layout.response.status).toBe(500);
	expect(descendant).toBe(false);
	const data = await runLoaders(request([{ id: "page", preloader: throws }], { kind: "data" }));
	expect(data.response.status).toBe(200);
	expect(data.frames).toEqual([{ t: "e", m: "page", e: boom }]);
	const authorize = await runLoaders(request([{ id: "page", authorize: throws }]));
	expect(authorize.response.status).toBe(500);
	expect(authorize.failed?.boundary).toBe("errorRender");
});

async function fail(kind: RunInput["kind"]): Promise<{
	status: number;
	contentType: string | null;
	body: string;
	authenticated: boolean;
	overlay: boolean;
}> {
	let authenticated = false;
	let overlay = false;
	const { response } = await runLoaders(
		request([{ id: "page", auth: { authenticate: true }, validate: () => [issue] }], {
			kind,
			authenticate: () => {
				authenticated = true;
				return session;
			},
			overlay: () => {
				overlay = true;
			},
		}),
	);
	return {
		status: response.status,
		contentType: response.headers.get("content-type"),
		body: await response.text(),
		authenticated,
		overlay,
	};
}

// A macrotask: every microtask the gate and the loaders queue has run before this resolves.
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
