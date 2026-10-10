import { createPage } from "@lovrozagar/flare/page";
import { createSignal, For, Show } from "solid-js";

interface StreamChunk {
	chunk: number;
}

interface ConcResult {
	id: string;
	timestamp: number;
}

export const route = createPage("_root_/server-fn-advanced").render(() => {
	/* ── Streaming ──────────────────────────────────────────── */
	const [streamStatus, setStreamStatus] = createSignal("idle");
	const [streamChunks, setStreamChunks] = createSignal<StreamChunk[]>([]);
	const [streamError, setStreamError] = createSignal("");

	const startStream = async () => {
		setStreamStatus("streaming");
		setStreamChunks([]);
		setStreamError("");

		try {
			const res = await fetch("/_flare/server-fn/slow-stream/slow-stream", {
				body: "{}",
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			if (!res.ok || !res.body) {
				setStreamError(`HTTP ${res.status}`);
				setStreamStatus("error");
				return;
			}
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					if (!line.trim()) continue;
					const parsed = JSON.parse(line) as Record<string, unknown>;
					if ("c" in parsed) {
						setStreamChunks((prev) => [...prev, parsed.c as StreamChunk]);
					} else if ("e" in parsed) {
						const err = parsed.e as { message: string };
						setStreamError(err.message);
					}
				}
			}
			setStreamStatus("done");
		} catch (err: unknown) {
			setStreamError(err instanceof Error ? err.message : "Unknown error");
			setStreamStatus("error");
		}
	};

	/* ── Piggyback ──────────────────────────────────────────── */
	const [mutResult, setMutResult] = createSignal("");
	const [piggyItems, setPiggyItems] = createSignal("");
	const [piggyCount, setPiggyCount] = createSignal("");

	const callPiggyback = async () => {
		setMutResult("");
		setPiggyItems("");
		setPiggyCount("");
		try {
			const res = await fetch("/_flare/server-fn/piggyback/piggyback", {
				body: JSON.stringify({ value: "test" }),
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			const json = (await res.json()) as {
				data: { saved: boolean; value: string };
				queries?: Array<{ data: unknown; key: unknown[] }>;
			};
			setMutResult(JSON.stringify(json.data));
			if (json.queries) {
				for (const q of json.queries) {
					const key = Array.isArray(q.key) ? (q.key[0] as string) : "";
					if (key === "demo-items") setPiggyItems(JSON.stringify(q.data));
					if (key === "demo-count") setPiggyCount(JSON.stringify(q.data));
				}
			}
		} catch {
			setMutResult("error");
		}
	};

	/* ── Concurrent ─────────────────────────────────────────── */
	const [concResults, setConcResults] = createSignal<ConcResult[]>([]);
	const [concCount, setConcCount] = createSignal(0);

	const callConcurrent = async () => {
		setConcResults([]);
		setConcCount(0);
		const ids = ["A", "B", "C"];
		const promises = ids.map((id) =>
			fetch("/_flare/server-fn/concurrent/concurrent", {
				body: JSON.stringify({ delay: 50, id }),
				headers: { "content-type": "application/json" },
				method: "POST",
			}).then((r) => r.json() as Promise<{ data: ConcResult }>),
		);
		const results = await Promise.all(promises);
		const items = results.map((r) => r.data);
		setConcResults(items);
		setConcCount(items.length);
	};

	/* ── Retry ──────────────────────────────────────────────── */
	const [retryResult, setRetryResult] = createSignal("");
	const [retryError, setRetryError] = createSignal("");
	const retryKey = `ui-${Date.now()}`;

	const callRetry = async () => {
		setRetryResult("");
		setRetryError("");
		try {
			const res = await fetch("/_flare/server-fn/retryable/retryable", {
				body: JSON.stringify({ key: retryKey }),
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			if (!res.ok) {
				const body = (await res.json()) as { message: string };
				setRetryError(body.message);
				return;
			}
			const json = (await res.json()) as { data: unknown };
			setRetryResult(JSON.stringify(json.data));
		} catch (err: unknown) {
			setRetryError(err instanceof Error ? err.message : "Unknown error");
		}
	};

	/* ── Auth ───────────────────────────────────────────────── */
	const [authResult, setAuthResult] = createSignal("");
	const [authError, setAuthError] = createSignal("");

	const callAuthNo = async () => {
		setAuthResult("");
		setAuthError("");
		try {
			const res = await fetch("/_flare/server-fn/auth-gated/auth-gated", {
				body: "{}",
				headers: { "content-type": "application/json" },
				method: "POST",
			});
			if (!res.ok) {
				const body = (await res.json()) as { message: string };
				setAuthError(body.message);
				return;
			}
			const json = (await res.json()) as { data: unknown };
			setAuthResult(JSON.stringify(json.data));
		} catch (err: unknown) {
			setAuthError(err instanceof Error ? err.message : "Unknown error");
		}
	};

	const callAuthYes = async () => {
		setAuthResult("");
		setAuthError("");
		try {
			const res = await fetch("/_flare/server-fn/auth-gated/auth-gated", {
				body: "{}",
				headers: { "content-type": "application/json", "x-test-auth": "user-42" },
				method: "POST",
			});
			if (!res.ok) {
				const body = (await res.json()) as { message: string };
				setAuthError(body.message);
				return;
			}
			const json = (await res.json()) as { data: unknown };
			setAuthResult(JSON.stringify(json.data));
		} catch (err: unknown) {
			setAuthError(err instanceof Error ? err.message : "Unknown error");
		}
	};

	return (
		<main data-testid="server-fn-advanced">
			<h1>Server Fn Advanced</h1>

			{/* Streaming */}
			<section>
				<h2>Streaming</h2>
				<button data-testid="start-stream" onClick={startStream} type="button">
					Start Stream
				</button>
				<p data-testid="stream-status">{streamStatus()}</p>
				<p data-testid="stream-count">{streamChunks().length}</p>
				<ul data-testid="stream-chunks">
					<For each={streamChunks()}>{(c, i) => <li data-testid={`chunk-${i()}`}>{JSON.stringify(c)}</li>}</For>
				</ul>
				<Show when={streamError()}>
					<p data-testid="stream-error">{streamError()}</p>
				</Show>
			</section>

			{/* Piggyback */}
			<section>
				<h2>Piggyback</h2>
				<button data-testid="call-piggyback" onClick={callPiggyback} type="button">
					Call Piggyback
				</button>
				<p data-testid="mut-result">{mutResult()}</p>
				<p data-testid="piggy-items">{piggyItems()}</p>
				<p data-testid="piggy-count">{piggyCount()}</p>
			</section>

			{/* Concurrent */}
			<section>
				<h2>Concurrent</h2>
				<button data-testid="call-concurrent" onClick={callConcurrent} type="button">
					Call Concurrent
				</button>
				<p data-testid="conc-count">{concCount()}</p>
				<ul data-testid="conc-results">
					<For each={concResults()}>{(r) => <li>{r.id}</li>}</For>
				</ul>
			</section>

			{/* Retry */}
			<section>
				<h2>Retry</h2>
				<button data-testid="call-retry" onClick={callRetry} type="button">
					Call Retry
				</button>
				<p data-testid="retry-result">{retryResult()}</p>
				<Show when={retryError()}>
					<p data-testid="retry-error">{retryError()}</p>
				</Show>
			</section>

			{/* Auth */}
			<section>
				<h2>Auth</h2>
				<button data-testid="call-auth-no" onClick={callAuthNo} type="button">
					No Auth
				</button>
				<button data-testid="call-auth-yes" onClick={callAuthYes} type="button">
					With Auth
				</button>
				<p data-testid="auth-result">{authResult()}</p>
				<Show when={authError()}>
					<p data-testid="auth-error">{authError()}</p>
				</Show>
			</section>
		</main>
	);
});
