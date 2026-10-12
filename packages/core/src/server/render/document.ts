import { createComponent, type Element } from "solid-js";
import * as web from "@solidjs/web";
import { withRequest } from "../../shared/csp/nonce.ts";
import { RouterContext } from "../../shared/router/context.ts";
import type { Router } from "../../shared/router/create-router.ts";
import { renderHead, type Head } from "./head.ts";
import { stateScript, type StateMatch } from "./state.ts";

type StreamOptions = {
	nonce?: string;
	signal?: AbortSignal;
	manifest?: Record<string, { imports?: readonly string[] }>;
	onError?: () => void;
	onHead?: (head: string) => void;
	onCompleteShell?: (info: { write: (chunk: string) => void }) => void;
};

type Stream = (fn: () => unknown, options: StreamOptions) => PromiseLike<string>;

export type DocumentInput = {
	request: Request;
	router: Router;
	loader?: () => unknown;
	render: (data: unknown) => Element;
	stream?: Stream;
	nonce?: string;
	head?: Head;
	matches?: readonly StateMatch[];
};

export async function renderDocument(input: DocumentInput): Promise<string> {
	const data = input.loader ? input.loader() : undefined;
	const nonce = input.nonce ?? "";
	const body = await withRequest({ path: new URL(input.request.url).pathname, nonce }, () =>
		(input.stream ?? defaultStream)(() => tree(input, data), streamOptions(input, data, nonce)),
	);
	const prefix = input.head === undefined ? "" : renderHead(input.head, { nonce });
	return `${prefix}${body}`;
}

function defaultStream(fn: () => unknown, options: StreamOptions): PromiseLike<string> {
	return web.renderToStream(fn, options as Parameters<typeof web.renderToStream>[1]);
}

function tree(input: DocumentInput, data: unknown): Element {
	return createComponent(RouterContext, {
		value: input.router,
		get children() {
			return input.render(data);
		},
	});
}

function streamOptions(input: DocumentInput, data: unknown, nonce: string): StreamOptions {
	const options: StreamOptions = {
		signal: input.request.signal,
		manifest: {},
		onError: () => undefined,
		onHead: () => undefined,
		onCompleteShell(info) {
			info.write(stateScript({ matches: input.matches ?? [stateMatch(data)], nonce }));
		},
	};
	if (nonce !== "") options.nonce = nonce;
	return options;
}

function stateMatch(data: unknown): StateMatch {
	return {
		id: "",
		params: {},
		search: {},
		data: data ?? null,
		preloader: null,
		head: null,
		error: null,
	};
}
