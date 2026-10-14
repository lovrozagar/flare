import { createComponent, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, it, vi } from "vitest";
import { withRequest, type StylesheetPlacement } from "../csp/nonce.ts";
import { Stylesheet } from "./stylesheet.tsx";

type FlareScope = typeof globalThis & { flare?: { nonce: string } };

// The server environment's sheet module. The source module is empty.
const sheet = vi.hoisted(() => ({ href: "/assets/app.css" }));
vi.mock("../css/sheet.ts", () => ({
	builtSheet: "",
	get builtHref() {
		return sheet.href;
	},
}));

afterEach(() => {
	vi.unstubAllEnvs();
	sheet.href = "/assets/app.css";
	delete (globalThis as FlareScope).flare;
});

// What a client-only render writes for the request nonce `requestNonce`.
function rendered(requestNonce = "n"): HTMLElement {
	(globalThis as FlareScope).flare = { nonce: requestNonce };
	const host = document.createElement("div");
	render(() => createComponent(Stylesheet, {}), host);
	flush();
	return host;
}

it("dev", () => {
	vi.stubEnv("DEV", true);
	expect(rendered().innerHTML).toBe("");
});

it("prod", () => {
	vi.stubEnv("DEV", false);
	expect(rendered().innerHTML).toBe(
		'<link id="flare-stylesheet" rel="preload" as="style" href="/assets/app.css">' +
			'<noscript><link rel="stylesheet" href="/assets/app.css"></noscript>' +
			'<script nonce="n">document.getElementById("flare-stylesheet").rel="stylesheet"</script>',
	);
	expect(rendered("").innerHTML).toBe('<link rel="stylesheet" href="/assets/app.css">');
});

// The swap script carries the request nonce, the one the CSP header names. The component does not invent one.
it("nonce", () => {
	vi.stubEnv("DEV", false);
	expect(rendered("r1").querySelector("script")?.getAttribute("nonce")).toBe("r1");
});

it("prod without css", () => {
	vi.stubEnv("DEV", false);
	sheet.href = "";
	expect(rendered().innerHTML).toBe("");
});

// In a document render the component leaves its href to the document, which writes the markup right after the
// critical style (B103), and renders nothing in place.
it("placed", () => {
	vi.stubEnv("DEV", false);
	const stylesheet: StylesheetPlacement = {};
	const host = withRequest({ path: "/", nonce: "n", stylesheet }, () => rendered());
	expect(host.innerHTML).toBe("");
	expect(stylesheet.href).toBe("/assets/app.css");
});
