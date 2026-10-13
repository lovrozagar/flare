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

// `build` is the deploy's id, the one `flare-build` carries. `fill` marks a render that left a stored `"stream"` hole:
// the client sends one fill after hydrate.
type State = { matches: readonly StateMatch[]; nonce: string; build: string; fill?: boolean | undefined };

export function stateScript(state: State): string {
	return script(payload(state), state.nonce);
}

// The document's state in two steps: the matches serialize now, so a value JSON cannot hold fails before the shell,
// and the request's query cache joins after the shell rendered, so the queries it resolved are in it (B83). No query
// getter is `"queries":null`.
export function stateWriter(state: State): (queries: unknown) => string {
	const base = payload(state);
	return (queries) => script(`${base.slice(0, -1)},"queries":${JSON.stringify(queries ?? null)}}`, state.nonce);
}

function payload(state: State): string {
	const fill = state.fill === true ? { fill: true } : {};
	return JSON.stringify({ matches: state.matches, nonce: state.nonce, build: state.build, ...fill });
}

// A string CSP has no nonce, and then the tag has no attribute (B68).
function script(json: string, nonce: string): string {
	const attr = nonce === "" ? "" : ` nonce="${escapeAttr(nonce)}"`;
	return `<script${attr}>self.flare=${escapeInlineScript(json)}</script>`;
}

// Before `</body>`. A root that renders no body, such as one that renders only text, gets it at the end.
export function insertState(shell: string, script: string): string {
	const close = shell.lastIndexOf("</body>");
	if (close === -1) return `${shell}${script}`;
	return `${shell.slice(0, close)}${script}${shell.slice(close)}`;
}
