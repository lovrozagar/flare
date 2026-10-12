import { expect, it } from "vitest";
import { createRouter } from "../../shared/router/create-router.ts";
import { renderDocument } from "./document.ts";
import { insertState, stateScript } from "./state.ts";

it("one script", async () => {
	const body = await renderDocument({
		request: new Request("http://localhost/"),
		router: createRouter({ layouts: {}, routeTree: [] }),
		matches: [{ id: "_root_", params: {}, search: {}, data: { n: 1 }, preloader: {}, head: null, error: null }],
		render: () => "page",
	});
	const html = await new Response(body).text();
	expect(html.match(/self\.flare/g)).toHaveLength(1);
	const start = html.indexOf("self.flare=");
	const source = html.slice(start, html.indexOf("</script>", start));
	const value = Function(`const self = {}; ${source}; return self.flare;`)() as {
		matches: Array<Record<string, unknown> & { data: { n: number } }>;
	};
	expect(value.matches[0]?.data.n).toBe(1);
	expect(Object.keys(value.matches[0] ?? {}).sort()).toEqual([
		"data",
		"error",
		"head",
		"id",
		"params",
		"preloader",
		"search",
	]);
});

it("nonce field", async () => {
	const html = await new Response(
		await renderDocument({
			request: new Request("http://localhost/"),
			router: createRouter({ layouts: {}, routeTree: [] }),
			matches: [],
			nonce: "abc",
			render: () => "page",
		}),
	).text();
	expect(html).toContain('"nonce":"abc"');
});

it("empty nonce", async () => {
	const html = await new Response(
		await renderDocument({
			request: new Request("http://localhost/"),
			router: createRouter({ layouts: {}, routeTree: [] }),
			matches: [],
			nonce: "",
			render: () => "page",
		}),
	).text();
	expect(html).toContain('"nonce":""');
});

it("insertion", () => {
	const script = "<script>self.flare=1</script>";
	const html = insertState("<body>hi</body>", script);
	expect(html.indexOf(script)).toBeGreaterThan(-1);
	expect(html.indexOf(script)).toBeLessThan(html.indexOf("</body>"));
});

// A render that left a `"stream"` hole says so, so the client sends one fill after hydrate. Without a hole the field
// is absent. `build` is the id `flare-build` carries.
it("fill flag", () => {
	expect(stateScript({ matches: [], nonce: "", build: "b", fill: true })).toBe(
		'<script>self.flare={"matches":[],"nonce":"","build":"b","fill":true}</script>',
	);
	expect(stateScript({ matches: [], nonce: "", build: "b" })).toBe(
		'<script>self.flare={"matches":[],"nonce":"","build":"b"}</script>',
	);
});
