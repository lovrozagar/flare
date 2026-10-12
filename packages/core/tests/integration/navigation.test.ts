import { createComponent } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { expect, it } from "vitest";
import { createServer } from "../../src/server/lifecycle/create.ts";
import { decodeLine, type Frame } from "../../src/shared/protocol/index.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter } from "../../src/shared/router/create-router.ts";

// The server half of a client navigation: the URL selects the response, never a header (B7).

const calls: string[] = [];

const root = createRootLayout("_root_")
	.loader(() => {
		calls.push("root");
		return "root";
	})
	.render((props) =>
		createComponent(Dynamic, {
			component: "html",
			get children() {
				return [
					createComponent(Dynamic, { component: "head" }),
					createComponent(Dynamic, {
						component: "body",
						get children() {
							return props.children;
						},
					}),
				];
			},
		}),
	);
const about = createPage("_root_/about")
	.loader(() => {
		calls.push("about");
		return "about data";
	})
	.head(() => ({ title: "About" }))
	.render((props) => `about:${String(props.loaderData)}`);

const app = createServer({
	router: createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/about", path: "/about", module: about }],
	}),
});

function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
	calls.length = 0;
	return app.fetch(new Request(`http://localhost${path}`, { headers }));
}

function framesOf(body: string): Frame[] {
	return body
		.split("\n")
		.filter((line) => line !== "")
		.map((line) => decodeLine(line));
}

it("document is html", async () => {
	const response = await get("/about");
	const body = await response.text();
	expect(response.headers.get("content-type")).toMatch(/^text\/html/);
	expect(body).toContain("about:about data");
	expect(body).toContain("_$HY");
});

it("data is ndjson", async () => {
	const response = await get("/about?_flare=data");
	const body = await response.text();
	expect(response.headers.get("content-type")).toMatch(/^application\/x-ndjson/);
	expect(framesOf(body)).toEqual([
		{ t: "l", m: "_root_", d: "root" },
		{ t: "l", m: "_root_/about", d: "about data" },
		{ t: "h", m: "_root_/about", d: { title: "About" } },
		{ t: "r" },
		{ t: "d" },
	]);
	expect(body).not.toContain("_$HY");
	expect(body).not.toContain("<html");
});

it("header ignored", async () => {
	const response = await get("/about", { "flare-data": "1", "flare-prefetch": "1", "flare-stale": "&" });
	expect(response.headers.get("content-type")).toMatch(/^text\/html/);
	expect(calls).toEqual(["root", "about"]);
});

it("stale layout", async () => {
	const response = await get("/about?_flare=data&_flare_stale=%26");
	const frames = framesOf(await response.text());
	expect(calls).toEqual(["root"]);
	expect(frames.map((frame) => frame.t)).toEqual(["l", "r", "d"]);
	expect(frames[0]).toEqual({ t: "l", m: "_root_", d: "root" });
});
