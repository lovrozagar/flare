import { createComponent, NoHydration } from "solid-js";
import { Dynamic, type JSX } from "@solidjs/web";
import { devStyles, nonce, placeStylesheet } from "../csp/nonce.ts";
import { stylesheetMarkup, type DeliveryTag } from "../css/delivery.ts";
import { builtHref } from "../css/sheet.ts";

// The app's one stylesheet, for the root layout's `<head>` (dx/head.md). A production document preloads it and swaps
// it in with the request's nonced script, so it never blocks the first paint (B15). A dev document writes one style
// per CSS module its chain imports, keyed as Vite's client keys them, so the first paint is styled and the client
// adopts them for HMR (B104). An app with no CSS renders nothing. Only the server's sheet module has the href. A
// document render writes the production markup right after the critical style instead of here (B103). Hydration
// leaves the server's markup as it is.
export function Stylesheet(): JSX.Element {
	return createComponent(NoHydration, {
		get children() {
			if (import.meta.env?.DEV) return devStyles().map(devStyle);
			if (builtHref === "") return undefined;
			if (placeStylesheet(builtHref)) return undefined;
			return stylesheetMarkup(builtHref, nonce()).map(element);
		},
	});
}

function element(tag: DeliveryTag): JSX.Element {
	const children = tag.children;
	return createComponent(Dynamic, {
		component: tag.tag,
		...tag.props,
		get children() {
			return typeof children === "object" ? element(children) : children;
		},
	});
}

// A `</style` inside the CSS would end the element. `\/` is the same character to CSS.
function devStyle(style: { id: string; css: string }): JSX.Element {
	const value = nonce();
	return createComponent(Dynamic, {
		component: "style",
		"data-vite-dev-id": style.id,
		nonce: value === "" ? undefined : value,
		innerHTML: style.css.replaceAll(/<\/style/gi, "<\\/style"),
	});
}
