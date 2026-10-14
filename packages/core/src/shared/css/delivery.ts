// One element of the stylesheet markup. `children` is a nested element or the element text.
export type DeliveryTag = {
	tag: "link" | "noscript" | "script";
	props: Record<string, string>;
	children?: DeliveryTag | string;
};

// Adds the stylesheet right after itself, with the preload's href: the browser already fetches the file, the new link
// takes the preloaded response, and a stylesheet a script adds does not block the first paint. The preload itself is
// left alone: flipping its rel made WebKit cancel it in flight, and under load the loads after that cancel failed
// (BUGS.md 87). A block keeps its binding off the global scope. The text is constant, so a CSP hash can allow it as
// well as the nonce.
export const SWAP_SCRIPT =
	'{const l=document.createElement("link");l.rel="stylesheet";l.href=document.getElementById("flare-stylesheet").getAttribute("href");document.currentScript.after(l)}';

// How a production document loads the one stylesheet without blocking (B15): a preload, the nonced swap script, and
// a noscript link. Without a nonce, as under a string or `false` CSP (B68), a swap script would be blocked and leave
// the page on its critical CSS alone, so the link is a plain stylesheet.
export function stylesheetMarkup(href: string, nonce: string): DeliveryTag[] {
	if (nonce === "") return [{ tag: "link", props: { rel: "stylesheet", href } }];
	return [
		{ tag: "link", props: { id: "flare-stylesheet", rel: "preload", as: "style", href } },
		{ tag: "noscript", props: {}, children: { tag: "link", props: { rel: "stylesheet", href } } },
		{ tag: "script", props: { nonce }, children: SWAP_SCRIPT },
	];
}
