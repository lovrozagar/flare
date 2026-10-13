import { expect, it } from "vitest";
import { flare } from "../plugin/flare.ts";
import { devEndpoints, guardDev } from "./guard.ts";

// A dev endpoint that answers with a CORS star, which the guard must not pass on.
const endpoint = guardDev(
	() => new Response("ran", { headers: { "access-control-allow-origin": "*", "x-kept": "1" } }),
);

function call(site?: string): Promise<Response> {
	const headers: Record<string, string> = site === undefined ? {} : { "sec-fetch-site": site };
	return endpoint(new Request("http://localhost/_flare/dev/x", { headers }));
}

it("same origin", async () => {
	const response = await call("same-origin");
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("ran");
});

// A client that sends no fetch metadata, such as curl, is not a browser on another site.
it("missing site", async () => {
	expect(await (await call()).text()).toBe("ran");
});

it("same site", async () => {
	const response = await call("same-site");
	expect(response.status).toBe(403);
	expect(await response.text()).toBe("");
});

// A navigation typed into the address bar, or a bookmark.
it("none", async () => {
	expect((await call("none")).status).toBe(403);
});

it("cross site", async () => {
	expect((await call("cross-site")).status).toBe(403);
});

it("no star", async () => {
	const response = await call("same-origin");
	expect(response.headers.has("access-control-allow-origin")).toBe(false);
	expect(response.headers.get("x-kept")).toBe("1");
	const named = guardDev(() => new Response("", { headers: { "access-control-allow-origin": "http://localhost" } }));
	const kept = await named(new Request("http://localhost/x"));
	expect(kept.headers.get("access-control-allow-origin")).toBe("http://localhost");
});

// The endpoints exist only on the dev server: a build has no server, and the plugin applies to serve alone.
it("absent in prod", () => {
	const plugin = flare().find((item) => item.name === "flare:dev-endpoints");
	expect(plugin?.apply).toBe("serve");
	const used: Array<[string, unknown]> = [];
	const server = { middlewares: { use: (path: string, handler: unknown) => void used.push([path, handler]) } };
	const hook = devEndpoints([{ path: "/_flare/dev/x", handle: () => new Response("ran") }]).configureServer;
	if (typeof hook !== "function") throw new Error("configureServer");
	Reflect.apply(hook, null, [server]);
	expect(used.map(([path]) => path)).toEqual(["/_flare/dev/x"]);
	expect(typeof used[0]?.[1]).toBe("function");
});
