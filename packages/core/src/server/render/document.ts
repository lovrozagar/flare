import { createComponent, type Element } from "solid-js";
import * as web from "@solidjs/web";
import { withRequest } from "../../shared/csp/nonce.ts";
import { appTree, NO_OVERLAY } from "../../shared/components/index.ts";
import { IDLE_NAVIGATION, NO_BLOCKERS } from "../../shared/router/context.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { raceAbort } from "./abort.ts";
import { escapeAttr, escapeInlineScript } from "./escape.ts";
import { headTags, type HeadTag } from "../../shared/head/index.ts";
import { DocumentHead, type Head } from "./head.ts";
import { insertState, stateScript, type StateMatch } from "./state.ts";

type Chunk = string | Uint8Array;

// Solid's own render options, so the render passes them through as they are.
type StreamOptions = NonNullable<Parameters<typeof web.renderToStream>[1]>;

type Stream = (
	fn: () => unknown,
	options: StreamOptions,
) => { pipeTo: (writable: WritableStream<Chunk>) => Promise<void> };

export type DocumentInput = {
	request: Request;
	router: Router;
	render: () => Element;
	stream?: Stream;
	nonce?: string;
	head?: Head;
	appStylesheet?: string;
	matches: readonly StateMatch[];
	client?: string | undefined;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Resolves once the shell is written, so the caller knows the status before the body is read. A throw
// before the shell rejects. Flushed bytes are never rewritten (B76).
export async function renderDocument(input: DocumentInput): Promise<ReadableStream<Uint8Array>> {
	const nonce = input.nonce ?? "";
	// The state is serialized first. A value JSON cannot hold, such as a bigint, fails before the shell.
	const tail = stateScript({ matches: input.matches, nonce }) + clientScript(input.client, nonce);
	const head = captureScript(nonce);
	const tags =
		input.head === undefined ? undefined : headTags(input.head, { nonce, appStylesheet: input.appStylesheet });
	const piped = new TransformStream<Chunk, Chunk>();
	// The render stops on a request abort or on a consumer cancel, whichever comes first.
	const halt = new AbortController();
	const signal = AbortSignal.any([input.request.signal, halt.signal]);
	const render = withRequest({ path: new URL(input.request.url).pathname, nonce }, () =>
		(input.stream ?? defaultStream)(() => tree(input, tags), streamOptions(signal, nonce)),
	);
	// A failure after the shell surfaces on the readable. The bytes already sent stay.
	render.pipeTo(piped.writable).catch(() => undefined);
	const reader = piped.readable.getReader();
	// The state and client scripts go in the shell before `</body>` (02-system), so the shell ends at `</html>`.
	const shell = insertState(withDoctype(withHead(chunkText((await reader.read()).value), head)), tail);
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(shell));
		},
		async pull(controller) {
			const next = await reader.read();
			if (next.done) controller.close();
			else controller.enqueue(encoder.encode(chunkText(next.value)));
		},
		cancel: (reason) => reader.cancel(reason),
	});
	return raceAbort(body, input.request.signal, () => halt.abort());
}

function defaultStream(fn: () => unknown, options: StreamOptions): ReturnType<Stream> {
	return web.renderToStream(fn, options);
}

// The tree the client hydrates: the same providers with the server's values, then the matches, then the head.
// The request's location is the one on screen, so a Link paints its active state on the server too.
function tree(input: DocumentInput, tags: readonly HeadTag[] | undefined): Element {
	const url = new URL(input.request.url);
	const location = { pathname: url.pathname, search: url.search, hash: "" };
	const values = {
		router: input.router,
		location: () => location,
		navigate: null,
		navigation: IDLE_NAVIGATION,
		blockers: NO_BLOCKERS,
		prefetcher: null,
		overlay: NO_OVERLAY,
	};
	return appTree(values, () => [input.render(), createComponent(DocumentHead, { tags: tags ?? [] })]);
}

function streamOptions(signal: AbortSignal, nonce: string): StreamOptions {
	const options: StreamOptions = {
		signal,
		manifest: {},
		onError: () => undefined,
		onHead: () => undefined,
	};
	if (nonce !== "") options.nonce = nonce;
	return options;
}

function clientScript(client: string | undefined, nonce: string): string {
	if (client === undefined) return "";
	return `<script type="module" async${nonceAttr(nonce)}>${escapeInlineScript(`import(${JSON.stringify(client)})`)}</script>`;
}

// Solid's hydration capture script (B91). It follows the route head, and bit 11's critical style follows it.
function captureScript(nonce: string): string {
	return web.generateHydrationScript(nonce === "" ? {} : { nonce });
}

// A shell without a head, such as a root that renders only text, gets the head in front of it.
// The root layout writes `<html>` and no doctype. Without one the browser renders in quirks mode (02-system).
function withDoctype(shell: string): string {
	return /<html[\s>]/i.test(shell) && !/<!doctype/i.test(shell) ? `<!DOCTYPE html>${shell}` : shell;
}

function withHead(shell: string, head: string): string {
	const close = shell.indexOf("</head>");
	if (close === -1) return `${head}${shell}`;
	return `${shell.slice(0, close)}${head}${shell.slice(close)}`;
}

function chunkText(chunk: Chunk | undefined): string {
	if (typeof chunk === "string") return chunk;
	return decoder.decode(chunk);
}

function nonceAttr(nonce: string): string {
	return nonce === "" ? "" : ` nonce="${escapeAttr(nonce)}"`;
}
