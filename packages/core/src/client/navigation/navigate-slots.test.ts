import { createComponent, createMemo, Errored, Loading } from "solid-js";
import type { JSX } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts";
import { createPage } from "../../shared/route-builder/page.ts";
import type { Deferred } from "../../shared/route-builder/register.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { mountNavigator, settled, unmountAll } from "./navigate.fixture.ts";

// Deferred values arrive as `c` and `e` frames after the commit at `r` (B80).

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"]);
const home = createPage("_root_/").render((props) => `home:${String(props.loaderData)}`);
type Slots = { fast: Deferred<string>; slow: Deferred<string> };

function slot(deferred: Deferred<string>, fallback: string): JSX.Element {
	return createComponent(Loading, {
		fallback,
		get children() {
			const value = createMemo(async () => deferred.promise);
			return [() => value()];
		},
	});
}

const slotted = createPage("_root_/slots")
	.render((props) => {
		const data = props.loaderData as Slots;
		return [slot(data.fast, "wait-fast"), "|", slot(data.slow, "wait-slow")];
	})
	.errorRender(() => "page-error");
const caught = createPage("_root_/caught").render((props) => {
	const data = props.loaderData as Slots;
	return [
		createComponent(Errored, {
			fallback: () => "caught",
			get children() {
				return slot(data.fast, "wait-fast");
			},
		}),
		"|",
		slot(data.slow, "wait-slow"),
	];
});
const escaped = createPage("_root_/escaped").render((props) => {
	const data = props.loaderData as Slots;
	return [slot(data.fast, "wait-fast"), "|", slot(data.slow, "wait-slow")];
});

const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/slots", path: "/slots", module: slotted },
		{ id: "_root_/caught", path: "/caught", module: caught },
		{ id: "_root_/escaped", path: "/escaped", module: escaped },
	],
});

beforeEach(() => {
	history.replaceState(null, "", "/");
});

afterEach(unmountAll);

// A data response the test writes into frame by frame.
function streamed(route: string): { response: Response; write: (frame: Frame) => void; close: () => void } {
	const encoder = new TextEncoder();
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({ start: (opened) => void (controller = opened) });
	const write = (frame: Frame): void => controller.enqueue(encoder.encode(encodeFrame(frame)));
	write({ t: "l", m: "_root_", d: null });
	write({ t: "l", m: route, d: { fast: { __deferred: true, key: "d0" }, slow: { __deferred: true, key: "d1" } } });
	return {
		response: new Response(body, { headers: { "content-type": "application/x-ndjson" } }),
		write,
		close: () => controller.close(),
	};
}

it("two slots", async () => {
	const data = streamed("_root_/slots");
	const app = await mountNavigator(router, async () => data.response);
	const pushes: string[] = [];
	const push = vi.spyOn(history, "pushState").mockImplementation(function (this: History, ...args) {
		pushes.push(app.text());
		History.prototype.pushState.apply(this, args);
	});
	const navigated = app.navigator.navigate({ to: "_root_/slots" });
	data.write({ t: "r" });
	await navigated;
	await settled();
	expect(pushes).toEqual(["root[wait-fast|wait-slow]"]);
	data.write({ t: "c", m: "_root_/slots", k: "d0", d: "FAST" });
	await settled();
	expect(app.text()).toBe("root[FAST|wait-slow]");
	data.write({ t: "c", m: "_root_/slots", k: "d1", d: "SLOW" });
	data.write({ t: "d" });
	data.close();
	await settled();
	expect(app.text()).toBe("root[FAST|SLOW]");
	expect(pushes).toHaveLength(1);
	push.mockRestore();
});

it("slot catches", async () => {
	const data = streamed("_root_/caught");
	const send = vi.fn<(error: unknown) => void>();
	const app = await mountNavigator(router, async () => data.response, { onBoundaryError: send });
	const navigated = app.navigator.navigate({ to: "_root_/caught" });
	data.write({ t: "r" });
	await navigated;
	data.write({ t: "e", m: "_root_/caught", k: "d0", e: { message: "fast failed", digest: "0" } });
	data.write({ t: "c", m: "_root_/caught", k: "d1", d: "SLOW" });
	data.close();
	await settled();
	await settled();
	expect(app.text()).toBe("root[caught|SLOW]");
	expect(send).not.toHaveBeenCalled();
});

it("slot escapes", async () => {
	const data = streamed("_root_/escaped");
	const send = vi.fn<(error: unknown) => void>();
	const app = await mountNavigator(router, async () => data.response, { onBoundaryError: send });
	const navigated = app.navigator.navigate({ to: "_root_/escaped" });
	data.write({ t: "r" });
	await navigated;
	data.write({ t: "e", m: "_root_/escaped", k: "d0", e: { message: "fast failed", digest: "0" } });
	data.close();
	await settled();
	await settled();
	expect(app.text()).toBe("root[Something went wrong]");
	// The slow value never came either, so it rejects when the stream ends: a second report.
	expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: "fast failed" }));
});
