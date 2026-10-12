import { expect, it } from "vitest";
import type { Issue } from "../../shared/validation/issues.ts";
import { runLoaders, type LoaderRoute, type RunInput } from "./run.ts";

const session = { id: "ada" };
const issue: Issue = { message: "required", path: ["email"] };

function noop(): void {}

function request(routes: readonly LoaderRoute[], extra: Partial<RunInput> = {}): RunInput {
	return { kind: "document", routes, ...extra };
}

it("order", async () => {
	const seen: string[] = [];
	const route: LoaderRoute = {
		id: "page",
		validate: () => {
			seen.push("validate");
			return undefined;
		},
		authenticate: () => seen.push("authenticate"),
		preloader: () => seen.push("preloader"),
		authorize: () => {
			seen.push("authorize");
			return true;
		},
		loader: () => seen.push("loader"),
		head: () => seen.push("head"),
		headers: () => seen.push("headers"),
	};
	await runLoaders(
		request([route], {
			shared: true,
			readStore: () => seen.push("store"),
		}),
	);
	expect(seen).toEqual(["validate", "authenticate", "preloader", "authorize", "store", "loader", "head", "headers"]);
	expect(seen.indexOf("validate")).toBe(0);
	expect(seen.indexOf("preloader")).toBeLessThan(seen.indexOf("store"));
	expect(seen.indexOf("authorize")).toBeLessThan(seen.indexOf("store"));
});

it("auth args", async () => {
	const seen: unknown[] = [];
	await runLoaders(
		request(
			[
				{
					id: "page",
					preloader: (ctx) => seen.push(ctx.auth),
					authorize: (ctx) => {
						seen.push(ctx.auth);
						return true;
					},
					loader: (ctx) => seen.push(ctx.auth),
				},
			],
			{ session },
		),
	);
	expect(seen).toEqual([session, session, session]);
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
	const page = await runLoaders(
		request([
			{
				id: "page",
				preloader: () => {
					throw new Error("boom");
				},
			},
		]),
	);
	expect(page.status).toBe(500);
	let descendant = false;
	const layout = await runLoaders(
		request([
			{
				id: "layout",
				preloader: () => {
					throw new Error("boom");
				},
			},
			{
				id: "page",
				loader: () => {
					descendant = true;
				},
			},
		]),
	);
	expect(layout.status).toBe(500);
	expect(descendant).toBe(false);
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
	const response = await runLoaders(
		request(
			[
				{
					id: "page",
					validate: () => [issue],
					authenticate: () => {
						authenticated = true;
					},
				},
			],
			{
				kind,
				overlay: () => {
					overlay = true;
				},
			},
		),
	);
	return {
		status: response.status,
		contentType: response.headers.get("content-type"),
		body: await response.text(),
		authenticated,
		overlay,
	};
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}
