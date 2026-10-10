import { createComponent } from "solid-js";
import * as web from "@solidjs/web";
import { RouterContext } from "../../shared/router/context.ts";
import type { Router } from "../../shared/router/create-router.ts";

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
	render: (data: unknown) => string;
	stream?: Stream;
};

export async function renderDocument(input: DocumentInput): Promise<string> {
	const data = input.loader ? input.loader() : undefined;
	const stream =
		input.stream ?? ((fn, options) => web.renderToStream(fn, options as Parameters<typeof web.renderToStream>[1]));
	return stream(
		() =>
			createComponent(RouterContext, {
				value: input.router,
				get children() {
					return input.render(data);
				},
			}),
		{
			nonce: "",
			signal: input.request.signal,
			manifest: {},
			onError: () => undefined,
			onHead: () => undefined,
			onCompleteShell: () => undefined,
		},
	);
}
