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

export function stateScript(state: { matches: readonly StateMatch[] }): string {
	return `<script>self.flare=${escapeInlineScript(JSON.stringify(state))}</script>`;
}

export function insertState(shell: string, script: string): string {
	const close = shell.indexOf("</body>");
	return `${shell.slice(0, close)}${script}${shell.slice(close)}`;
}
