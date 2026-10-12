import { criticalCss, type CriticalContext } from "../../shared/css/critical.ts";
import { escapeAttr } from "./escape.ts";

export type CriticalInput = { css: string; nonce: string; ctx?: CriticalContext };

// The shell with the rules of the built sheet it uses, as `<style id="flare-critical">` before `</head>` (B15, B83).
// It goes in after the capture script, so it is the last element in head. It has no `data-dh`, so the client head
// never adopts or removes it. A shell without a head gets the style in front, as the capture script does. An empty
// sheet, as in dev, leaves the shell as it is.
export function withCritical(shell: string, input: CriticalInput): string {
	if (input.css === "") return shell;
	const nonce = input.nonce === "" ? "" : ` nonce="${escapeAttr(input.nonce)}"`;
	const style = `<style id="flare-critical"${nonce}>${criticalCss(shell, input.css, input.ctx)}</style>`;
	const close = shell.indexOf("</head>");
	if (close === -1) return `${style}${shell}`;
	return `${shell.slice(0, close)}${style}${shell.slice(close)}`;
}
