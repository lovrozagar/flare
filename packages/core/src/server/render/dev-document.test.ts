import { createComponent } from "solid-js";
import { Dynamic, type JSX } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import { createRouter } from "../../shared/router/create-router.ts";
import { createMemoryStore } from "../cache/memory.ts";
import { serveWith } from "../lifecycle/create.ts";
import { devDocument, devToken } from "./dev-document.ts";

const HEAD = '<script type="module" src="/@vite/client"></script>';

function html(body: string | ReadableStream<Uint8Array>, headers: HeadersInit = {}): Response {
	return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

// devHead last in `<head>`, then the `csp-nonce` meta with the response's own nonce, then the tab meta (B95 (b)).
it("dev tags", async () => {
	const policy = { "content-security-policy": "script-src 'self' 'nonce-abc123'; style-src-elem 'nonce-abc123'" };
	const page = "<html><head _hk=1><title _hk=2>T</title></head><body>x</body></html>";
	const tagged = devDocument(html(page, policy), { head: HEAD, token: "T1" });
	expect(await tagged.text()).toBe(
		`<html><head _hk=1><title _hk=2>T</title>${HEAD}<meta property="csp-nonce" nonce="abc123">` +
			'<meta name="flare-dev-tab" content="T1"></head><body>x</body></html>',
	);
	// A document with no head, such as a failed render's page, gets them in front. Other bodies pass as they are.
	const bare = devDocument(html("<pre>boom</pre>"), { head: HEAD, token: "T1" });
	expect(await bare.text()).toBe(`${HEAD}<meta name="flare-dev-tab" content="T1"><pre>boom</pre>`);
	const data = new Response("{}", { headers: { "content-type": "application/x-ndjson" } });
	expect(devDocument(data, { head: HEAD, token: "T1" })).toBe(data);
	const empty = new Response(null, { status: 204, headers: { "content-type": "text/html" } });
	expect(devDocument(empty, { head: HEAD, token: "T1" })).toBe(empty);
	const untyped = new Response(null, { status: 204 });
	expect(devDocument(untyped, { head: HEAD, token: "T1" })).toBe(untyped);
});

// `</head>` split across chunks, and a character split across the chunk that holds it, arrive whole (BUGS.md B8).
it("chunks", async () => {
	const bytes = new TextEncoder().encode("<html><head></he" + "ad><body>é</body></html>");
	const at = bytes.indexOf(0xc3) + 1;
	const split = [bytes.slice(0, 18), bytes.slice(18, at), bytes.slice(at)];
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of split) controller.enqueue(chunk);
			controller.close();
		},
	});
	const tagged = devDocument(html(body), { head: "", token: "T" });
	expect(await tagged.text()).toBe('<html><head><meta name="flare-dev-tab" content="T"></head><body>é</body></html>');
});

// A tab's own request names its token, so the tab keeps its routing (B42). A document gets a fresh one, and a header
// that is not a token is not written into the page.
it("request token", () => {
	expect(devToken(new Request("http://x/", { headers: { "flare-dev-tab": "tab-7" } }))).toBe("tab-7");
	expect(devToken(new Request("http://x/"))).toMatch(/^[0-9a-f-]{36}$/);
	expect(devToken(new Request("http://x/", { headers: { "flare-dev-tab": '"><script>' } }))).toMatch(/^[0-9a-f-]{36}$/);
});

it("no nonce", async () => {
	const tagged = devDocument(html("<html><head></head></html>"), { head: HEAD, token: "T" });
	expect(await tagged.text()).not.toContain("csp-nonce");
});

function element(tag: string, children: () => JSX.Element): JSX.Element {
	return createComponent(Dynamic, {
		component: tag,
		get children() {
			return children();
		},
	});
}

const root = createRootLayout("_root_").render((props) =>
	element("html", () => [element("head", () => element("title", () => "T")), element("body", () => props.children)]),
);

function app(sink: { dev: boolean; toTab?: (token: string | undefined) => () => void }) {
	const page = createPage("_root_/isr")
		.cache({ isr: true })
		.render(() => "stored");
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/isr", path: "/isr", module: page }],
	});
	const log = { level: "error" as const, error: () => undefined, warn: () => undefined, log: () => undefined };
	return serveWith({ router, site: "https://x.test", store: createMemoryStore() }, { ...sink, log });
}

// Production writes none of the three. Under Vite's dev server each tab's document carries its own token, a stored
// page included, so the stored body never keeps one; outside one, as under a test runner, none is written.
it("production", async () => {
	const prod = await (await app({ dev: false }).fetch(new Request("https://x.test/isr"))).text();
	expect(prod).not.toContain("flare-dev-tab");
	expect(prod).not.toContain("csp-nonce");
	const toTab = vi.fn<(token: string | undefined) => () => void>(() => () => undefined);
	const dev = app({ dev: true, toTab });
	const first = await (
		await dev.fetch(new Request("https://x.test/isr", { headers: { "flare-dev-tab": "A" } }))
	).text();
	const second = await (
		await dev.fetch(new Request("https://x.test/isr", { headers: { "flare-dev-tab": "B" } }))
	).text();
	expect(first).toContain('<meta name="flare-dev-tab" content="A">');
	expect(second).toContain('<meta name="flare-dev-tab" content="B">');
	expect(second).not.toContain('content="A"');
	expect(toTab.mock.calls.map(([token]) => token)).toEqual(["A", "B"]);
	const tested = await (await app({ dev: true }).fetch(new Request("https://x.test/isr"))).text();
	expect(tested).not.toContain("flare-dev-tab");
});
