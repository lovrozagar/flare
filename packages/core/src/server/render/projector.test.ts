import { markSafeError } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import type { DevErrorPayload } from "../../shared/errors/dev-report.ts";
import { notFound, unauthenticated } from "../../shared/errors/http.ts";
import type { RouteRecord } from "../../shared/route-builder/page.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import type { Logger } from "../lifecycle/logger.ts";
import { serveWith } from "../lifecycle/create.ts";
import { devSink, type ErrorSink } from "./projector.ts";

const FRAME = /\n\s+at /;

// A stack inside the state script is JSON, so its newline is the two characters \n.
const BODY_FRAME = /(\n|\\n)\s+at /;

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"]);

function probe(dev: boolean): { sink: ErrorSink; send: ReturnType<typeof vi.fn>; lines: string[] } {
	const lines: string[] = [];
	const write = (tag: string, message: string, data?: unknown): void => {
		lines.push([tag, message, data === undefined ? "" : String(data)].join(" "));
	};
	const log: Logger = { level: "error", error: write, warn: write, log: write };
	const send = vi.fn<(payload: DevErrorPayload) => void>();
	return { sink: { dev, send, log }, send, lines };
}

async function get(page: RouteRecord, sink: ErrorSink): Promise<{ status: number; body: string }> {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: page }] });
	const response = await serveWith({ router, authenticate: () => ({ user: "u" }) }, sink).fetch(
		new Request("http://localhost/"),
	);
	return { status: response.status, body: await response.text() };
}

function throwing(error: unknown): RouteRecord {
	return createPage("_root_/")
		.loader(() => {
			throw error;
		})
		.render(() => "page");
}

it("prod generic", async () => {
	const prod = probe(false);
	const { status, body } = await get(throwing(new Error("secret")), prod.sink);
	expect(status).toBe(500);
	expect(body).not.toContain("secret");
	expect(body).not.toMatch(BODY_FRAME);
	const digest = /"digest":"([0-9a-f]{12})"/.exec(body)?.[1];
	if (digest === undefined) throw new Error("no digest in the body");
	expect(body).toContain("Something went wrong");
	expect(prod.send).not.toHaveBeenCalled();
	expect(prod.lines.join("\n")).toContain(digest);
	expect(prod.lines.join("\n")).not.toContain("secret");
});

it("prod safe", async () => {
	const prod = probe(false);
	const { status, body } = await get(throwing(markSafeError(new Error("visible"))), prod.sink);
	expect(status).toBe(500);
	expect(body).toContain("visible");
	expect(body).not.toMatch(BODY_FRAME);
	expect(prod.send).not.toHaveBeenCalled();
});

it("dev detail", async () => {
	const dev = probe(true);
	const page = createPage("_root_/")
		.loader(() => {
			throw new Error("secret");
		})
		.render(() => "page")
		.errorRender(() => "custom");
	const { status, body } = await get(page, dev.sink);
	expect(status).toBe(500);
	expect(body).toContain("custom");
	expect(body).toContain("secret");
	expect(body).toMatch(BODY_FRAME);
	expect(dev.send).toHaveBeenCalledExactlyOnceWith({
		type: "error",
		err: { message: "secret", stack: expect.stringMatching(FRAME) },
	});
	expect(dev.lines.join("\n")).toContain("secret");
	expect(dev.lines.join("\n")).toMatch(FRAME);
});

it("string thrown", async () => {
	const dev = probe(true);
	const { status, body } = await get(throwing("plain secret"), dev.sink);
	expect(status).toBe(500);
	expect(body).toContain('"message":"plain secret","stack":""');
	expect(dev.send).toHaveBeenCalledExactlyOnceWith({ type: "error", err: { message: "plain secret", stack: "" } });
});

it("not found in render", async () => {
	const dev = probe(true);
	const page = createPage("_root_/").render(() => notFound());
	expect((await get(page, dev.sink)).status).toBe(404);
	expect(dev.send).not.toHaveBeenCalled();
});

it("unauthenticated in render", async () => {
	const dev = probe(true);
	const page = createPage("_root_/").render(() => unauthenticated());
	expect((await get(page, dev.sink)).status).toBe(401);
	expect(dev.send).not.toHaveBeenCalled();
});

it("render has no auth", async () => {
	const seen: object[] = [];
	const page = createPage("_root_/")
		.authenticate()
		.render((props) => {
			seen.push(props);
			return "page";
		});
	expect((await get(page, probe(false).sink)).status).toBe(200);
	expect(seen).toHaveLength(1);
	expect("auth" in seen[0]).toBe(false);
});

it("bigint", async () => {
	const prod = probe(false);
	const page = createPage("_root_/")
		.loader(() => ({ count: 1n }))
		.render(() => "page");
	expect(await get(page, prod.sink)).toEqual({ status: 500, body: "" });
});

it("null title", async () => {
	const page = createPage("_root_/")
		.head(() => JSON.parse('{"title":null}'))
		.render(() => "page");
	const { status, body } = await get(page, probe(false).sink);
	expect(status).toBe(200);
	expect(body).not.toContain("<title");
});

it("dev sink", () => {
	const send = vi.fn<(event: string, payload: unknown) => void>();
	const hot = devSink({ env: { DEV: true }, hot: { send } });
	expect(hot.dev).toBe(true);
	hot.send?.({ type: "error", err: { message: "m", stack: "" } });
	expect(send).toHaveBeenCalledExactlyOnceWith("flare:error", { type: "error", err: { message: "m", stack: "" } });
	const built = devSink({ env: { DEV: false } });
	expect(built.dev).toBe(false);
	expect(built.send).toBeUndefined();
});
