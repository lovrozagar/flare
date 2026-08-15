import { createPage } from "@lovrozagar/flare/page";
import { createSignal, For, Show } from "solid-js";

interface StreamChunk {
	chunk: number;
}

export const route = createPage("_root_/fn-stream").render(() => {
	const [status, setStatus] = createSignal("idle");
	const [chunks, setChunks] = createSignal<StreamChunk[]>([]);

	const start = async () => {
		setStatus("streaming");
		setChunks([]);
		const res = await fetch("/_fn/slow-stream/slow-stream", {
			body: "{}",
			headers: { "content-type": "application/json" },
			method: "POST",
		});
		if (!res.ok || !res.body) {
			setStatus("error");
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
					setChunks((prev) => [...prev, parsed.c as StreamChunk]);
				}
			}
		}
		setStatus("done");
	};

	return (
		<main data-testid="fn-stream">
			<button data-testid="start-stream" type="button" onClick={() => void start()}>
				Start
			</button>
			<p data-testid="stream-status">{status()}</p>
			<p data-testid="stream-count">{chunks().length}</p>
			<For each={chunks()}>{(item, i) => <p data-testid={`chunk-${i()}`}>{JSON.stringify(item)}</p>}</For>
			<Show when={status() === "done"}>
				<p data-testid="stream-done">done</p>
			</Show>
		</main>
	);
});
