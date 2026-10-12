import { createComponent, type Element } from "solid-js";
import * as web from "@solidjs/web";
import { withRequest } from "../../shared/csp/nonce.ts";
import { RouterContext } from "../../shared/router/context.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { raceAbort } from "./abort.ts";
import { escapeAttr, escapeInlineScript } from "./escape.ts";
import { renderHead, type Head } from "./head.ts";
import { stateScript, type StateMatch } from "./state.ts";

type Chunk = string | Uint8Array;

type StreamOptions = {
	nonce?: string;
	signal?: AbortSignal;
	manifest?: Record<string, { imports?: readonly string[] }>;
	onError?: () => void;
	onHead?: (head: string) => void;
	onCompleteShell?: (info: { write: (chunk: string) => void }) => void;
};

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
	matches: readonly StateMatch[];
	client?: string;
};

type ViteManifest = Record<string, { file: string }>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Resolves once the shell is written, so the caller knows the status before the body is read. A throw
// before the shell rejects. Flushed bytes are never rewritten (B76).
export async function renderDocument(input: DocumentInput): Promise<ReadableStream<Uint8Array>> {
	const nonce = input.nonce ?? "";
	// The state is serialized first. A value JSON cannot hold, such as a bigint, fails before the shell.
	const tail = stateScript({ matches: input.matches, nonce }) + clientScript(input.client, nonce);
	const head = headHtml(input.head, nonce);
	const piped = new TransformStream<Chunk, Chunk>();
	const render = withRequest({ path: new URL(input.request.url).pathname, nonce }, () =>
		(input.stream ?? defaultStream)(() => tree(input), streamOptions(input, tail, nonce)),
	);
	// A failure after the shell surfaces on the readable. The bytes already sent stay.
	render.pipeTo(piped.writable).catch(() => undefined);
	const reader = piped.readable.getReader();
	const shell = withHead(chunkText((await reader.read()).value), head);
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(shell));
		},
		async pull(controller) {
			const next = await reader.read();
			if (next.done) controller.close();
			else controller.enqueue(encoder.encode(chunkText(next.value)));
		},
	});
	return raceAbort(body, input.request.signal, () => void reader.cancel());
}

// The dev URL is the project-relative entry. A production URL is the entry's hashed file, and a missing entry
// is a build error.
export function clientUrl(input: { entry: string; manifest?: ViteManifest }): string {
	if (input.manifest === undefined) return `/${input.entry}`;
	const built = input.manifest[input.entry];
	if (built === undefined) throw new Error(`The client entry ${input.entry} is not in the Vite manifest`);
	return `/${built.file}`;
}

function defaultStream(fn: () => unknown, options: StreamOptions): ReturnType<Stream> {
	return web.renderToStream(fn, options as Parameters<typeof web.renderToStream>[1]);
}

function tree(input: DocumentInput): Element {
	return createComponent(RouterContext, {
		value: input.router,
		get children() {
			return input.render();
		},
	});
}

function streamOptions(input: DocumentInput, tail: string, nonce: string): StreamOptions {
	const options: StreamOptions = {
		signal: input.request.signal,
		manifest: {},
		onError: () => undefined,
		onHead: () => undefined,
		onCompleteShell(info) {
			info.write(tail);
		},
	};
	if (nonce !== "") options.nonce = nonce;
	return options;
}

function clientScript(client: string | undefined, nonce: string): string {
	if (client === undefined) return "";
	return `<script type="module" async${nonceAttr(nonce)}>${escapeInlineScript(`import(${JSON.stringify(client)})`)}</script>`;
}

// The route head and Solid's hydration capture script (B91). The capture script is the last element Flare
// writes into the head, where bit 11's critical style follows it.
function headHtml(head: Head | undefined, nonce: string): string {
	const routeHead = head === undefined ? "" : renderHead(head, { nonce });
	return routeHead + web.generateHydrationScript(nonce === "" ? {} : { nonce });
}

// A shell without a head, such as a root that renders only text, gets the head in front of it.
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
