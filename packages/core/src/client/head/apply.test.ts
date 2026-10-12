import { createSignal, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import { applyHeads } from "./apply.ts";

type FlareScope = typeof globalThis & { flare?: { nonce: string } };

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

// A hydrated client always has self.flare. An empty nonce is a string CSP.
beforeEach(() => {
	(globalThis as FlareScope).flare = { nonce: "" };
});

const mounted: (() => void)[] = [];

afterEach(() => {
	for (const dispose of mounted.splice(0)) dispose();
	delete (globalThis as FlareScope).flare;
	document.head.innerHTML = "";
});

function mount(initial: readonly (HeadConfig | undefined)[]) {
	const [heads, setHeads] = createSignal(initial);
	const dispose = render(
		() => {
			applyHeads(heads);
			return "";
		},
		document.body.appendChild(document.createElement("div")),
	);
	mounted.push(dispose);
	flush();
	return { setHeads, dispose };
}

it("slot order", async () => {
	mount([{ title: "Root", description: "root" }, undefined, { title: "About" }]);
	await settle();
	expect(document.title).toBe("About");
	expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("root");
});

it("replace", async () => {
	const view = mount([{ title: "Root" }, { title: "About", keywords: "a" }]);
	await settle();
	view.setHeads([{ title: "Root" }, { title: "Contact" }]);
	flush();
	await settle();
	expect(document.title).toBe("Contact");
	expect(document.head.querySelectorAll("title")).toHaveLength(1);
	expect(document.head.querySelector('meta[name="keywords"]')).toBeNull();
});

it("nonce", async () => {
	(globalThis as FlareScope).flare = { nonce: "n" };
	mount([{ custom: { scripts: [{ children: "window.x = 1" }] } }]);
	await settle();
	const script = [...document.head.querySelectorAll("script")].find((node) => node.textContent === "window.x = 1");
	expect(script?.getAttribute("nonce")).toBe("n");
});

// The head Solid's server writes for [{ title: "Root", description: "D" }]: the identities headTags' keys give.
const serverHead =
	'<title data-dh="title">Root</title><meta name="description" content="D" data-dh="meta:key:meta:description:0">';

it("adopt", async () => {
	document.head.innerHTML = serverHead;
	const title = document.head.querySelector("title");
	const description = document.head.querySelector('meta[name="description"]');
	mount([{ title: "Root", description: "D" }]);
	await settle();
	expect(document.head.querySelectorAll("title")).toHaveLength(1);
	expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
	expect(document.head.querySelector("title")).toBe(title);
	expect(document.head.querySelector('meta[name="description"]')).toBe(description);
});

it("navigate removes", async () => {
	document.head.innerHTML = serverHead;
	const view = mount([{ title: "Root", description: "D" }]);
	await settle();
	view.setHeads([{ title: "Next" }]);
	flush();
	await settle();
	expect([...document.head.querySelectorAll("title")].map((node) => node.textContent)).toEqual(["Next"]);
	expect(document.head.querySelector('meta[name="description"]')).toBeNull();
	expect(document.title).toBe("Next");
});

it("keep", async () => {
	const view = mount([{ title: "Root", description: "D" }]);
	await settle();
	const description = document.head.querySelector('meta[name="description"]');
	const removed: Node[] = [];
	new MutationObserver((records) => records.forEach((record) => removed.push(...record.removedNodes))).observe(
		document.head,
		{ childList: true },
	);
	view.setHeads([{ title: "Root", keywords: "k", description: "D" }]);
	flush();
	await settle();
	expect(document.head.querySelector('meta[name="description"]')).toBe(description);
	expect(removed).not.toContain(description);
});

function script(body: string): HeadConfig {
	return { custom: { scripts: [{ children: body }] } };
}

it("script changed", async () => {
	const view = mount([script("run(1)")]);
	await settle();
	const first = [...document.head.querySelectorAll("script")].find((node) => node.textContent === "run(1)");
	view.setHeads([{ description: "added before" }, script("run(1)")]);
	flush();
	await settle();
	expect([...document.head.querySelectorAll("script")].find((node) => node.textContent === "run(1)")).toBe(first);
	view.setHeads([script("run(2)")]);
	flush();
	await settle();
	const bodies = [...document.head.querySelectorAll("script")].map((node) => node.textContent);
	expect(bodies.filter((body) => body === "run(2)")).toHaveLength(1);
	expect(bodies).not.toContain("run(1)");
});
