import { criticalCss, type CriticalContext } from "../../shared/css/critical.ts";
import { stylesheetMarkup, type DeliveryTag } from "../../shared/css/delivery.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { escapeAttr } from "./escape.ts";

// `stylesheet` is the href `<Stylesheet />` placed during the render, when it rendered one.
export type CriticalInput = { css: string; nonce: string; ctx?: CriticalContext; stylesheet?: string | undefined };

// The attributes the theme and direction scripts set before paint, from the router's config (B103).
export function criticalContext(router: Pick<Router, "theme" | "direction">): CriticalContext {
	const ctx: CriticalContext = {};
	if (router.theme !== undefined) ctx.themeAttribute = router.theme.attribute;
	if (router.direction !== undefined) ctx.directionAttribute = router.direction.attribute;
	return ctx;
}

// The shell with the rules of the built sheet it uses, as `<style id="flare-critical">` before `</head>` (B15, B83).
// It goes in after the capture script, so it is the last element in head but for the stylesheet markup, which follows
// it so the sheet wins every tie with its own subset (B103). It has no `data-dh`, so the client head never adopts or
// removes it. A shell without a head gets both in front, as the capture script does. An empty sheet, as in dev, or one
// with no rule the shell uses, writes no style.
export function withCritical(shell: string, input: CriticalInput): string {
	const rules = criticalCss(shell, input.css, input.ctx);
	const nonce = input.nonce === "" ? "" : ` nonce="${escapeAttr(input.nonce)}"`;
	const style = rules === "" ? "" : `<style id="flare-critical"${nonce}>${rules}</style>`;
	const sheet =
		input.stylesheet === undefined ? "" : stylesheetMarkup(input.stylesheet, input.nonce).map(html).join("");
	const head = `${style}${sheet}`;
	if (head === "") return shell;
	const close = shell.indexOf("</head>");
	if (close === -1) return `${head}${shell}`;
	return `${shell.slice(0, close)}${head}${shell.slice(close)}`;
}

// The swap script's text is a constant with no `<`, so it is written as it is.
function html(tag: DeliveryTag): string {
	const attributes = Object.entries(tag.props)
		.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
		.join("");
	const inner = tag.children;
	if (inner === undefined) return `<${tag.tag}${attributes}>`;
	return `<${tag.tag}${attributes}>${typeof inner === "string" ? inner : html(inner)}</${tag.tag}>`;
}
