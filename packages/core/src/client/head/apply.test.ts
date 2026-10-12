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

afterEach(() => {
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
