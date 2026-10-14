import { createComponent, NoHydration } from "solid-js";
import { Dynamic, type JSX } from "@solidjs/web";
import { nonce, placeStylesheet } from "../csp/nonce.ts";
import { stylesheetMarkup, type DeliveryTag } from "../css/delivery.ts";
import { builtHref } from "../css/sheet.ts";

// The app's one stylesheet, for the root layout's `<head>` (dx/head.md). A production document preloads it and swaps
// it in with the request's nonced script, so it never blocks the first paint (B15). Dev renders nothing, since Vite
// injects its CSS, and so does an app with no CSS. Only the server's sheet module has the href. A document render
// writes the markup right after the critical style instead of here (B103). Hydration leaves the server's markup as it
// is.
export function Stylesheet(): JSX.Element {
	return createComponent(NoHydration, {
		get children() {
			if (import.meta.env?.DEV || builtHref === "") return undefined;
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
