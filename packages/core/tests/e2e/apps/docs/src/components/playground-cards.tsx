import { useBlocker } from "@lovrozagar/flare"
import { createSignal, For, Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import { buildLog, buildStatus } from "../fns/build-log.ts"
import { echo, failLoudly, failSafely, moved } from "../fns/echo.ts"

const button =
	"rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-white dark:text-ink-950"

function Card(props: { title: string; children: JSX.Element }): JSX.Element {
	return (
		<section class="rounded-xl border border-stone-200 p-5 dark:border-ink-800">
			<h2 class="mb-3 font-semibold">{props.title}</h2>
			{props.children}
		</section>
	)
}

// A 400 carries the validator's `fieldErrors`. Its field message is what the visitor fixes, so it wins over the
// envelope message.
function messageOf(error: unknown): string {
	const fields: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "fieldErrors") : undefined
	const first = typeof fields === "object" && fields !== null ? Object.values(fields)[0] : undefined
	if (Array.isArray(first) && typeof first[0] === "string") return first[0]
	return error instanceof Error ? error.message : String(error)
}

export type Calls = { answer: () => string; error: () => string; run: (call: () => Promise<unknown>) => Promise<void> }

// One answer and one error line, shared by the POST and the error buttons. Calls run from events.
export function useCalls(): Calls {
	const [answer, setAnswer] = createSignal("")
	const [error, setError] = createSignal("")
	const run = async (call: () => Promise<unknown>): Promise<void> => {
		setError("")
		try {
			setAnswer(JSON.stringify(await call()))
		} catch (thrown) {
			setError(messageOf(thrown))
		}
	}
	return { answer, error, run }
}

export function EchoCard(props: { calls: Calls }): JSX.Element {
	const [text, setText] = createSignal("hello flare")
	return (
		<Card title="POST with a validator">
			<div class="flex gap-2">
				<input
					id="echo-input"
					aria-label="Text to echo"
					value={text()}
					onInput={(event) => setText(event.currentTarget.value)}
					class="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm dark:border-ink-800 dark:bg-ink-900"
				/>
				<button
					id="echo-send"
					type="button"
					class={button}
					onClick={() => void props.calls.run(() => echo({ text: text() }))}
				>
					Send
				</button>
			</div>
		</Card>
	)
}

// A returned redirect's status and Location, read from the Response the call resolves with.
async function movedTo(away: boolean): Promise<string> {
	const response = await moved({ away })
	return `${response.status} ${response.headers.get("location") ?? ""}`
}

export function ErrorsCard(props: { calls: Calls }): JSX.Element {
	return (
		<Card title="Errors">
			<div class="flex flex-wrap gap-2">
				<button id="fail-safe" type="button" class={button} onClick={() => void props.calls.run(() => failSafely())}>
					Safe error
				</button>
				<button id="fail-loud" type="button" class={button} onClick={() => void props.calls.run(() => failLoudly())}>
					Unsafe error
				</button>
				<button id="moved-here" type="button" class={button} onClick={() => void props.calls.run(() => movedTo(false))}>
					Redirect here
				</button>
				<button id="moved-away" type="button" class={button} onClick={() => void props.calls.run(() => movedTo(true))}>
					Redirect away
				</button>
			</div>
		</Card>
	)
}

export function Result(props: { calls: Calls }): JSX.Element {
	return (
		<div class="rounded-xl bg-stone-100 p-4 font-mono text-xs md:col-span-2 dark:bg-ink-900">
			<p>
				answer: <span id="echo-answer">{props.calls.answer()}</span>
			</p>
			<p class="text-red-700">
				error: <span id="echo-error">{props.calls.error()}</span>
			</p>
		</div>
	)
}

// A streamed server function. Stopping the iterator aborts the request, and the server reports what it saw.
export function StreamCard(): JSX.Element {
	const [lines, setLines] = createSignal<string[]>([])
	const [status, setStatus] = createSignal("idle")
	let stop: (() => void) | undefined
	const start = async (): Promise<void> => {
		// `?run=` names the run, so the e2e `stream` can gate it before the click (BUGS.md 100).
		const id = new URL(window.location.href).searchParams.get("run") ?? Math.random().toString(16).slice(2, 10)
		setLines([])
		setStatus("running")
		// `?hold` makes the run wait after its second line until it is stopped (the e2e `stream abort`).
		const hold = new URL(window.location.href).searchParams.has("hold")
		const iterator = buildLog({ run: id, hold })[Symbol.asyncIterator]()
		stop = () => void iterator.return?.()
		for (let step = await iterator.next(); !step.done; step = await iterator.next()) {
			const value = step.value
			setLines((current) => [...current, `${value.line}. ${value.step}`])
		}
		await new Promise((resolve) => setTimeout(resolve, 100))
		setStatus((await buildStatus({ run: id })).status)
	}
	return (
		<Card title="A streamed server function">
			<div class="flex gap-2">
				<button id="stream-start" type="button" class={button} onClick={() => void start()}>
					Run build
				</button>
				<button id="stream-stop" type="button" class={button} onClick={() => stop?.()}>
					Stop
				</button>
			</div>
			<ol id="stream-log" class="mt-3 space-y-1 font-mono text-xs">
				<For each={lines()}>{(line) => <li>{line}</li>}</For>
			</ol>
			<p class="mt-2 text-xs">
				server saw: <span id="stream-status">{status()}</span>
			</p>
		</Card>
	)
}

// Unsaved notes ask before any navigation away. The browser's own unload prompt uses the same callback.
export function NotesCard(): JSX.Element {
	const [draft, setDraft] = createSignal("")
	useBlocker(() => draft() === "" || window.confirm("Discard your notes?"))
	return (
		<Card title="Unsaved notes">
			<textarea
				id="draft"
				value={draft()}
				onInput={(event) => setDraft(event.currentTarget.value)}
				placeholder="Type, then try to leave the page"
				class="h-24 w-full rounded-md border border-stone-300 bg-white p-2 text-sm dark:border-ink-800 dark:bg-ink-900"
			/>
			<Show when={draft() !== ""}>
				<p id="draft-guarded" class="mt-1 text-xs text-amber-600">
					Leaving asks first.
				</p>
			</Show>
		</Card>
	)
}
