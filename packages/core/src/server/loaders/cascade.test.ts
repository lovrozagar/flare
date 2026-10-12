import { expect, it } from "vitest";
import { notFound, unauthenticated, unauthorized } from "../../shared/errors/http.ts";
import { runLoaders, type LoaderRun, type LoaderRoute, type RunInput } from "./run.ts";

const boom = new Error("boom");

type Spied = {
	run: LoaderRun;
	finished: string[];
	overlay: unknown[];
	pageRan: boolean;
};

async function spied(
	kind: RunInput["kind"],
	layout: LoaderRoute["loader"],
	page: LoaderRoute["loader"],
): Promise<Spied> {
	const finished: string[] = [];
	const overlay: unknown[] = [];
	let pageRan = false;
	const run = await runLoaders({
		kind,
		overlay: (error) => overlay.push(error),
		routes: [
			{
				id: "layout",
				loader: layout,
				head: () => finished.push("layout head"),
				headers: () => finished.push("layout headers"),
			},
			{
				id: "page",
				loader: (ctx) => {
					pageRan = true;
					return page?.(ctx);
				},
				head: () => finished.push("page head"),
				headers: () => finished.push("page headers"),
			},
		],
	});
	return { run, finished, overlay, pageRan };
}

function throws(error: unknown): () => never {
	return () => {
		throw error;
	};
}

const layoutData = (): { a: number } => ({ a: 1 });

it("document throw", async () => {
	const { run, overlay } = await spied("document", layoutData, throws(boom));
	expect(run.response.status).toBe(500);
	expect(run.failed).toEqual({ m: "page", status: 500, boundary: "errorRender", error: boom });
	expect(run.frames).toEqual([{ t: "l", m: "layout", d: { a: 1 } }]);
	expect(overlay).toEqual([boom]);
});

it("data throw", async () => {
	const { run, finished } = await spied("data", layoutData, throws(boom));
	expect(run.response.status).toBe(200);
	expect(run.frames).toEqual([
		{ t: "l", m: "layout", d: { a: 1 } },
		{ t: "e", m: "page", e: boom },
	]);
	expect(finished).toEqual(["layout head", "layout headers"]);
});

it("prefetch throw", async () => {
	const { run, finished } = await spied("prefetch", layoutData, throws(boom));
	expect(run.response.status).toBe(200);
	expect(run.frames).toEqual([
		{ t: "l", m: "layout", d: { a: 1 } },
		{ t: "e", m: "page", e: boom },
	]);
	expect(finished).toEqual(["layout head", "layout headers"]);
});

it("named status", async () => {
	const named = [
		{ call: notFound, status: 404, boundary: "notFoundRender" },
		{ call: unauthenticated, status: 401, boundary: "unauthenticatedRender" },
		{ call: unauthorized, status: 403, boundary: "unauthorizedRender" },
	];
	for (const { call, status, boundary } of named) {
		const document = await spied("document", layoutData, call);
		expect(document.run.response.status).toBe(status);
		expect(document.run.failed?.boundary).toBe(boundary);
		expect(document.run.frames).toEqual([{ t: "l", m: "layout", d: { a: 1 } }]);
		expect(document.overlay).toEqual([]);
		const data = await spied("data", layoutData, call);
		expect(data.run.response.status).toBe(status);
		expect(data.run.failed?.boundary).toBe(boundary);
		expect(data.run.frames).toEqual([]);
		expect(data.overlay).toEqual([]);
	}
});

it("failed layout", async () => {
	const { run, finished } = await spied("data", throws(boom), () => ({ secret: 1 }));
	expect(run.response.status).toBe(200);
	expect(run.frames).toEqual([{ t: "e", m: "layout", e: boom }]);
	expect(finished).toEqual([]);
});

it("page loader did run", async () => {
	const { pageRan } = await spied("data", throws(boom), () => ({ secret: 1 }));
	expect(pageRan).toBe(true);
});
