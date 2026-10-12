import { escapeInlineScript } from "./escape.ts";

export type StateMatch = {
	id: string;
	params: Record<string, string | string[]>;
	search: Record<string, string | string[]>;
	data: unknown;
	preloader: unknown;
	head: unknown;
	error: unknown;
};

export function stateScript(state: { matches: readonly StateMatch[]; nonce: string }): string {
	const payload = JSON.stringify({ matches: state.matches, nonce: state.nonce });
	return `<script>self.flare=${escapeInlineScript(payload)}</script>`;
}

export function insertState(shell: string, script: string): string {
	const close = shell.indexOf("</body>");
	return `${shell.slice(0, close)}${script}${shell.slice(close)}`;
}
