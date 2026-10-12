import { createComponent, createMemo, Loading } from "solid-js";
import { Dynamic, renderToStream, type JSX } from "@solidjs/web";
import { expect, it } from "vitest";
import { createRouter } from "../../shared/router/create-router.ts";
import { useRouter } from "../../shared/router/context.ts";
import { createDefer } from "../loaders/defer.ts";
import { clientUrl, renderDocument, type DocumentInput } from "./document.ts";

const router = createRouter({ layouts: {}, routeTree: [] });

const decoder = new TextDecoder();

function request(): Request {
	return new Request("http://localhost/");
}

function base(): Pick<DocumentInput, "request" | "router" | "matches"> {
	return { request: request(), router, matches: [] };
}

function text(body: ReadableStream<Uint8Array>): Promise<string> {
	return new Response(body).text();
}

// A stand-in for renderToStream that writes one string and records the options it was given.
function writes(html: string, seen: Parameters<NonNullable<DocumentInput["stream"]>>[1][]): DocumentInput["stream"] {
	return (_fn, options) => {
		seen.push(options);
		return {
			async pipeTo(writable) {
				const writer = writable.getWriter();
				await writer.write(html);
				await writer.close();
			},
		};
	};
}

function element(tag: string, children: () => JSX.Element): JSX.Element {
	return createComponent(Dynamic, {
		component: tag,
		get children() {
			return children();
		},
	});
}

function page(body: () => JSX.Element): JSX.Element {
	return element("html", () => [element("head", () => element("title", () => "T")), element("body", body)]);
}

it("calls renderToStream", async () => {
	const html = await text(await renderDocument({ ...base(), render: () => "home" }));
	expect(html).toContain("home");
	expect(html).toContain("self.flare=");
});

it("signal follows the request signal", async () => {
	const controller = new AbortController();
	const incoming = new Request("http://localhost/", { signal: controller.signal });
	const seen: Parameters<NonNullable<DocumentInput["stream"]>>[1][] = [];
	await renderDocument({ ...base(), request: incoming, render: () => "home", stream: writes("home", seen) });
	expect(seen[0].signal?.aborted).toBe(false);
	controller.abort();
	expect(seen[0].signal?.aborted).toBe(true);
	seen[0].onError?.();
	seen[0].onHead?.("");
});

it("nonce option", async () => {
	const seen: Parameters<NonNullable<DocumentInput["stream"]>>[1][] = [];
	await renderDocument({ ...base(), nonce: "abc", render: () => "home", stream: writes("x", seen) });
	await renderDocument({ ...base(), nonce: "", render: () => "home", stream: writes("x", seen) });
	expect(seen.map((options) => options.nonce)).toEqual(["abc", undefined]);
});

it("router context", async () => {
	let seen: unknown;
	await renderDocument({
		...base(),
		render() {
			seen = useRouter();
			return "ok";
		},
	});
	expect(seen).toBe(router);
});

it("shell hook", async () => {
	const order: string[] = [];
	const body = await renderDocument({
		...base(),
		render: () => page(() => "home"),
		stream: (fn, options) =>
			renderToStream(fn, {
				...options,
				onCompleteShell(info: { write: (chunk: string) => void }) {
					order.push("hook");
					options.onCompleteShell?.(info);
				},
			} as Parameters<typeof renderToStream>[1]),
	});
	const first = await body.getReader().read();
	order.push("chunk");
	expect(order).toEqual(["hook", "chunk"]);
	const shell = decoder.decode(first.value);
	expect(shell).toContain("</body>");
	expect(shell).toContain("self.flare=");
});

it("3 MiB shell", async () => {
	const big = "x".repeat(3 * 1024 * 1024);
	const body = await renderDocument({ ...base(), render: () => page(() => big) });
	const html = await text(body);
	expect(html.length).toBeGreaterThan(big.length);
	expect(html).toContain("self.flare=");
});

function slot(promise: Promise<string>, fallback: string): JSX.Element {
	return createComponent(Loading, {
		fallback,
		get children() {
			const value = createMemo(async () => promise);
			return [() => value()];
		},
	});
}

function twoSlots(): {
	fast: PromiseWithResolvers<string>;
	slow: PromiseWithResolvers<string>;
	render: () => JSX.Element;
} {
	const fast = Promise.withResolvers<string>();
	const slow = Promise.withResolvers<string>();
	const { defer } = createDefer({ stored: false, dev: false });
	const quick = defer(() => fast.promise);
	const late = defer(() => slow.promise);
	const render = (): JSX.Element => page(() => [slot(quick.promise, "wait-fast"), slot(late.promise, "wait-slow")]);
	return { fast, slow, render };
}

it("two fragments", async () => {
	const { fast, slow, render } = twoSlots();
	const reader = (await renderDocument({ ...base(), render })).getReader();
	const shell = decoder.decode((await reader.read()).value);
	expect(shell).toContain("wait-fast");
	expect(shell).toContain("wait-slow");
	expect(shell).not.toContain("FAST");
	expect(shell).not.toContain("SLOW");
	fast.resolve("FAST");
	const next = decoder.decode((await reader.read()).value);
	expect(next).toContain("FAST");
	expect(next).not.toContain("SLOW");
	slow.resolve("SLOW");
	let rest = "";
	for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += decoder.decode(chunk.value);
	expect(rest).toContain("SLOW");
});

it("reject keeps shell", async () => {
	const { fast, slow, render } = twoSlots();
	const body = await renderDocument({ ...base(), render });
	fast.reject(new Error("fast failed"));
	slow.resolve("SLOW");
	const html = await text(body);
	expect(html).toContain("wait-fast");
	expect(html).toMatch(/<template id="\d+">SLOW<\/template>/);
	expect(html).toContain("</html>");
});

it("client import", async () => {
	const html = await text(
		await renderDocument({ ...base(), nonce: "n", client: "/src/client.tsx", render: () => "home" }),
	);
	expect(html).toMatch(
		/<script[^>]*>self\.flare=.*?<\/script><script type="module" async nonce="n">import\("\/src\/client\.tsx"\)<\/script>/,
	);
	const plain = await text(await renderDocument({ ...base(), client: "/src/client.tsx", render: () => "home" }));
	expect(plain).toContain('<script type="module" async>import("/src/client.tsx")</script>');
	expect(clientUrl({ entry: "src/client.tsx" })).toBe("/src/client.tsx");
	const manifest = { "src/client.tsx": { file: "assets/client-1a2b3c.js" } };
	expect(clientUrl({ entry: "src/client.tsx", manifest })).toBe("/assets/client-1a2b3c.js");
	expect(() => clientUrl({ entry: "src/main.tsx", manifest })).toThrow(/src\/main\.tsx/);
});

it("hydration capture", async () => {
	const html = await text(await renderDocument({ ...base(), nonce: "n", render: () => page(() => "home") }));
	const head = html.slice(html.indexOf("<head"), html.indexOf("</head>"));
	expect(html.split("_$HY={").length).toBe(2);
	expect(head).toMatch(/<script nonce="n">window\._\$HY\|\|/);
	expect(head).toContain('["click","input"]');
	expect(head).toContain("<!--xs-->");
	const plain = await text(await renderDocument({ ...base(), render: () => page(() => "home") }));
	expect(plain).toMatch(/<script>window\._\$HY\|\|/);
});

it("abort after shell", async () => {
	const { slow, render } = twoSlots();
	const controller = new AbortController();
	const incoming = new Request("http://localhost/", { signal: controller.signal });
	const reader = (await renderDocument({ ...base(), request: incoming, render })).getReader();
	expect(decoder.decode((await reader.read()).value)).toContain("wait-slow");
	controller.abort();
	expect(await reader.read()).toEqual({ done: true, value: undefined });
	slow.resolve("SLOW");
});

// Writes the shell, then fails the way a render that throws after the shell does.
const failing: DocumentInput["stream"] = () => ({
	async pipeTo(writable) {
		const writer = writable.getWriter();
		await writer.write("<html><head></head><body>shell</body></html>");
		await writer.abort(new Error("late"));
		throw new Error("late");
	},
});

it("failure after shell", async () => {
	const body = await renderDocument({ ...base(), render: () => "home", stream: failing });
	const reader = body.getReader();
	expect(decoder.decode((await reader.read()).value)).toContain("shell");
	await expect(reader.read()).rejects.toThrow("late");
});

function stateTag(html: string): string {
	return html.slice(html.lastIndexOf("<script", html.indexOf("self.flare=")), html.indexOf("self.flare="));
}

it("state nonce", async () => {
	const signed = await text(await renderDocument({ ...base(), nonce: "n", render: () => "home" }));
	expect(stateTag(signed)).toBe('<script nonce="n">');
	expect(signed).toContain('"nonce":"n"');
	const plain = await text(await renderDocument({ ...base(), nonce: "", render: () => "home" }));
	expect(stateTag(plain)).toBe("<script>");
});

it("matches required", () => {
	// @ts-expect-error A document needs its real matches. There is no placeholder entry (B83).
	const input: DocumentInput = { request: request(), router, render: () => "home" };
	expect(input).not.toHaveProperty("matches");
});

it("head identity", async () => {
	const head = { title: "T", description: "D", jsonLd: [{ a: 1 }] };
	const bare = (): JSX.Element => element("html", () => [element("head", () => []), element("body", () => "home")]);
	const html = await text(await renderDocument({ ...base(), nonce: "n", head, render: bare }));
	expect(html).toContain('<title data-dh="title">T</title>');
	expect(html).toContain('<meta name="description" content="D" data-dh="meta:key:meta:description:0">');
	expect(html).toMatch(/<script type="application\/ld\+json" nonce="n" data-dh="script:key:script:[0-9a-z]+:0">/);
});
