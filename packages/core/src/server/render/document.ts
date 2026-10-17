import { createComponent, type Element } from "solid-js"
import * as web from "@solidjs/web"
import { withRequest, type StylesheetPlacement } from "../../shared/csp/nonce.ts"
import { buildId } from "../lifecycle/build-info.ts"
import { appTree, NO_OVERLAY } from "../../shared/components/index.ts"
import { IDLE_NAVIGATION, NO_BLOCKERS } from "../../shared/router/context.ts"
import type { Router } from "../../shared/router/create-router.ts"
import { raceAbort, renderStop } from "./abort.ts"
import { criticalContext, withCritical } from "./critical-style.ts"
import { escapeAttr, escapeInlineScript } from "./escape.ts"
import { headTags, type HeadTag } from "../../shared/head/index.ts"
import { DocumentHead, type Head } from "./head.ts"
import { headSequence } from "./head-sequence.ts"
import { registeredQuery, type DevStyle } from "../../shared/protocol/index.ts"
import { DocumentlessRoot, isDocument } from "./shape.ts"
import { insertState, stateWriter, type StateMatch } from "./state.ts"
import { streamOptions, type StreamOptions } from "./stream-options.ts"

type Chunk = string | Uint8Array

type Stream = (
	fn: () => unknown,
	options: StreamOptions,
) => { pipeTo: (writable: WritableStream<Chunk>) => Promise<void> }

export type DocumentInput = {
	request: Request
	router: Router
	render: () => Element
	stream?: Stream
	nonce?: string
	head?: Head
	// The built stylesheet a production document inlines its critical rules from. Dev and data pass none.
	sheet?: string
	// A dev document's CSS modules, which `<Stylesheet />` writes in its place (B104).
	devStyles?: readonly DevStyle[] | undefined
	matches: readonly StateMatch[]
	client?: string | undefined
	fill?: boolean
	// The root layout's id: a shell that is no document rejects naming it (B37), unless `onDocumentless` is given, as dev
	// gives it: then the shell is served as written (D22) and the callback hears the root.
	root?: string | undefined
	onDocumentless?: ((root: string) => void) | undefined
	// A bug found while writing the document, such as a query cache JSON cannot hold. It does not stop the document.
	onBug?: (bug: Error) => void
	// A render error Solid contained after the shell: a `<Loading>` fragment that rejected, which the client renders
	// again. The bytes already sent stay (plan 21 3.2).
	onRenderError?: (error: unknown) => void
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// Resolves once the shell is written, so the caller knows the status before the body is read. A throw
// before the shell rejects. Flushed bytes are never rewritten (B76).
export async function renderDocument(input: DocumentInput): Promise<ReadableStream<Uint8Array>> {
	const nonce = input.nonce ?? ""
	// The state's matches serialize first. A value JSON cannot hold, such as a bigint, fails before the shell.
	const search = new URL(input.request.url).search
	const state = stateWriter({ matches: input.matches, nonce, build: buildId, at: Date.now(), fill: input.fill, search })
	const head = captureScript(nonce)
	const tags = input.head === undefined ? undefined : headTags(input.head, { nonce })
	const piped = new TransformStream<Chunk, Chunk>()
	// The render stops on a request abort or on a consumer cancel, whichever comes first, under the request's event.
	const { signal, stop } = renderStop(input.request.signal, web.getRequestEvent())
	const stylesheet: StylesheetPlacement = {}
	const event = { path: new URL(input.request.url).pathname, nonce, stylesheet, devStyles: input.devStyles }
	const render = withRequest(event, () =>
		(input.stream ?? defaultStream)(() => tree(input, tags), streamOptions(signal, nonce, input.onRenderError)),
	)
	// A failure after the shell surfaces on the readable. The bytes already sent stay.
	render.pipeTo(piped.writable).catch(() => undefined)
	const reader = piped.readable.getReader()
	// The critical style follows the capture script (B83), and the stylesheet markup follows it (B103). The theme and
	// direction attributes count as present. The state and client scripts go in the shell before `</body>`
	// (02-system), so the shell ends at `</html>`.
	const first = chunkText((await reader.read()).value)
	if (input.root !== undefined && !isDocument(first)) {
		if (input.onDocumentless !== undefined) input.onDocumentless(input.root)
		else {
			stop()
			void reader.cancel()
			throw new DocumentlessRoot(input.root)
		}
	}
	const headed = withHead(first, head)
	const critical = { css: input.sheet ?? "", nonce, ctx: criticalContext(input.router), stylesheet: stylesheet.href }
	const page = withDoctype(withCritical(headed, critical))
	// The client keeps every `<head>` node outside this sequence out of hydration (B120).
	const writeState = state(registeredQuery()?.dehydrate(), input.onBug ?? ignore, headSequence(page))
	const shell = insertState(page, writeState + clientScript(input.client, nonce))
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(shell))
		},
		async pull(controller) {
			const next = await reader.read()
			if (next.done) controller.close()
			else controller.enqueue(encoder.encode(chunkText(next.value)))
		},
		cancel: (reason) => reader.cancel(reason),
	})
	return raceAbort(body, input.request.signal, stop)
}

function defaultStream(fn: () => unknown, options: StreamOptions): ReturnType<Stream> {
	return web.renderToStream(fn, options)
}

// The tree the client hydrates: the same providers with the server's values, then the matches, then the head.
// The request's location is the one on screen, so a Link paints its active state on the server too.
function tree(input: DocumentInput, tags: readonly HeadTag[] | undefined): Element {
	const url = new URL(input.request.url)
	const location = { pathname: url.pathname, search: url.search, hash: "" }
	const values = {
		router: input.router,
		location: () => location,
		navigate: null,
		navigation: IDLE_NAVIGATION,
		blockers: NO_BLOCKERS,
		prefetcher: null,
		overlay: NO_OVERLAY,
	}
	return appTree(values, () => [input.render(), createComponent(DocumentHead, { tags: tags ?? [] })])
}

function clientScript(client: string | undefined, nonce: string): string {
	if (client === undefined) return ""
	return `<script type="module" async${nonceAttr(nonce)}>${escapeInlineScript(`import(${JSON.stringify(client)})`)}</script>`
}

// Solid's hydration capture script (B91). It follows the route head, and bit 11's critical style follows it.
function captureScript(nonce: string): string {
	return web.generateHydrationScript(nonce === "" ? {} : { nonce })
}

// A shell without a head, such as a root that renders only text, gets the head in front of it.
// The root layout writes `<html>` and no doctype. Without one the browser renders in quirks mode (02-system).
function withDoctype(shell: string): string {
	return /<html[\s>]/i.test(shell) && !/<!doctype/i.test(shell) ? `<!DOCTYPE html>${shell}` : shell
}

function withHead(shell: string, head: string): string {
	const close = shell.indexOf("</head>")
	if (close === -1) return `${head}${shell}`
	return `${shell.slice(0, close)}${head}${shell.slice(close)}`
}

function chunkText(chunk: Chunk | undefined): string {
	if (typeof chunk === "string") return chunk
	return decoder.decode(chunk)
}

function nonceAttr(nonce: string): string {
	return nonce === "" ? "" : ` nonce="${escapeAttr(nonce)}"`
}

function ignore(): void {}
