import type { Located } from "../../shared/route-builder/index.ts";
import { escapeAttr, escapeInlineScript } from "./escape.ts";

export type StateMatch = {
	id: string;
	params: Located["params"];
	search: Located["search"];
	data: unknown;
	preloader: unknown;
	head: unknown;
	error: unknown;
};

export function stateScript(state: { matches: readonly StateMatch[]; nonce: string }): string {
	const payload = JSON.stringify({ matches: state.matches, nonce: state.nonce });
	// A string CSP has no nonce, and then the tag has no attribute (B68).
	const attr = state.nonce === "" ? "" : ` nonce="${escapeAttr(state.nonce)}"`;
	return `<script${attr}>self.flare=${escapeInlineScript(payload)}</script>`;
}

// Before `</body>`. A root that renders no body, such as one that renders only text, gets it at the end.
export function insertState(shell: string, script: string): string {
	const close = shell.lastIndexOf("</body>");
	if (close === -1) return `${shell}${script}`;
	return `${shell.slice(0, close)}${script}${shell.slice(close)}`;
}
