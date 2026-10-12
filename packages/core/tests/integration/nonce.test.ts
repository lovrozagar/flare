import { createComponent, type Element } from "solid-js";
import { expect, it } from "vitest";
import { createServer } from "../../src/server/lifecycle/create.ts";
import type { SecurityConfig } from "../../src/server/security/apply.ts";
import { nonce } from "../../src/shared/csp/nonce.ts";
import { createPage } from "../../src/shared/route-builder/page.ts";
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts";
import { createRouter, type Router } from "../../src/shared/router/create-router.ts";
import type { Head } from "../../src/server/render/head.ts";

const head: Head = {
	jsonLd: [{ "@type": "Thing" }],
	custom: {
		scripts: [{ children: "var x = 1" }],
		styles: [{ children: "a{}" }],
	},
};

function printed(): string {
	return `NONCE[${nonce()}]`;
}

function Grandchild(): Element {
	return printed();
}

function Child(): Element {
	return createComponent(Grandchild, {});
}

function Page(): Element {
	return createComponent(Child, {});
}

type Render = () => Element;

function router(render: Render): Router {
	const page = createPage("_root_/")
		.loader(() => "Home")
		.head(() => head)
		.render(render);
	return createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
		routeTree: [{ id: "_root_/", path: "/", module: page }],
	});
}

function server(render: Render, security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig)) {
	return createServer({ router: router(render), security });
}

function headerNonce(headers: Headers): string {
	const policy = headers.get("content-security-policy");
	if (policy === null) throw new Error("csp");
	const matched = /'nonce-([^']+)'/.exec(policy);
	const value = matched?.[1];
	if (value === undefined) throw new Error("csp");
	return value;
}

function capture(body: string, pattern: RegExp): string {
	const value = pattern.exec(body)?.[1];
	if (value === undefined) throw new Error("nonce");
	return value;
}

function tagNonces(body: string): { script: string; json: string; style: string } {
	return {
		script: capture(body, /<script nonce="([^"]+)">var x = 1<\/script>/),
		json: capture(body, /<script type="application\/ld\+json" nonce="([^"]+)">/),
		style: capture(body, /<style nonce="([^"]+)">a\{\}<\/style>/),
	};
}

async function document(
	render: Render,
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig),
): Promise<Response> {
	return server(render, security).fetch(new Request("http://localhost/"));
}

it("same value", async () => {
	const response = await document(() => printed());
	const body = await response.text();
	const value = headerNonce(response.headers);
	const tags = tagNonces(body);
	expect(tags.script).toBe(value);
	expect(tags.json).toBe(value);
	expect(tags.style).toBe(value);
	expect(body).toContain(`NONCE[${value}]`);
});

it("nested", async () => {
	const response = await document(() => Page());
	const body = await response.text();
	const value = headerNonce(response.headers);
	const tags = tagNonces(body);
	expect(tags.script).toBe(value);
	expect(tags.json).toBe(value);
	expect(tags.style).toBe(value);
	expect(body).toContain(`NONCE[${value}]`);
});

it("second request", async () => {
	const first = await document(() => printed());
	const second = await document(() => printed());
	const firstBody = await first.text();
	const secondBody = await second.text();
	const firstNonce = headerNonce(first.headers);
	const secondNonce = headerNonce(second.headers);
	const firstTags = tagNonces(firstBody);
	const secondTags = tagNonces(secondBody);
	expect(firstNonce).not.toBe(secondNonce);
	expect(firstTags.script).toBe(firstNonce);
	expect(firstTags.json).toBe(firstNonce);
	expect(firstTags.style).toBe(firstNonce);
	expect(firstBody).toContain(`NONCE[${firstNonce}]`);
	expect(secondTags.script).toBe(secondNonce);
	expect(secondTags.json).toBe(secondNonce);
	expect(secondTags.style).toBe(secondNonce);
	expect(secondBody).toContain(`NONCE[${secondNonce}]`);
});

it("string omits", async () => {
	const response = await document(
		() => printed(),
		() => ({ "Content-Security-Policy": "default-src 'none'" }),
	);
	const body = await response.text();
	expect(response.headers.get("content-security-policy")).toBe("default-src 'none'");
	expect(body).not.toContain("nonce=");
	expect(body).toContain("NONCE[]");
});

it("false omits", async () => {
	const response = await document(
		() => printed(),
		() => ({ "Content-Security-Policy": false }),
	);
	const body = await response.text();
	expect(response.headers.get("content-security-policy")).toBeNull();
	expect(body).not.toContain("nonce=");
	expect(body).toContain("NONCE[]");
});
