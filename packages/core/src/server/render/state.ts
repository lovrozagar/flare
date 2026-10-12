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

export function insertState(shell: string, script: string): string {
	const close = shell.indexOf("</body>");
	return `${shell.slice(0, close)}${script}${shell.slice(close)}`;
}
