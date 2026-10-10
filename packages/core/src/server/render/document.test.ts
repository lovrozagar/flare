import { expect, it } from "vitest";
import { createRouter } from "../../shared/router/create-router.ts";
import { useRouter } from "../../shared/router/context.ts";
import { renderDocument } from "./document.ts";

const router = createRouter({ layouts: {}, routeTree: [] });

function request(): Request {
	return new Request("http://localhost/");
}

it("calls renderToStream", async () => {
	const html = await renderDocument({ request: request(), router, render: () => "home" });
	expect(html).toContain("home");
});

it("signal is the request signal", async () => {
	const controller = new AbortController();
	const incoming = new Request("http://localhost/", { signal: controller.signal });
	controller.abort();
	let seen: AbortSignal | undefined;
	await renderDocument({
		request: incoming,
		router,
		render: () => "home",
		stream(_fn, options) {
			seen = options.signal;
			options.onError?.();
			options.onHead?.("");
			options.onCompleteShell?.({ write() {} });
			return Promise.resolve("home");
		},
	});
	expect(seen).toBe(incoming.signal);
});

it("loader data reaches the component", async () => {
	const html = await renderDocument({
		request: request(),
		router,
		loader: () => ({ message: "hi" }),
		render: (data) => (data as { message: string }).message,
	});
	expect(html).toContain("hi");
});

it("router context", async () => {
	let seen: unknown;
	await renderDocument({
		request: request(),
		router,
		render() {
			seen = useRouter();
			return "ok";
		},
	});
	expect(seen).toBe(router);
});
