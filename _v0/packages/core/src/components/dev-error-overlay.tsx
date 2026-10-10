import { createSignal, For, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Portal } from "@solidjs/web";
import { createDevErrorStore, type DevErrorStore } from "./index.ts";

let globalStore: DevErrorStore | undefined;

export function getDevErrorStore(): DevErrorStore {
	if (!globalStore) {
		globalStore = createDevErrorStore();
	}
	return globalStore;
}

export function resetDevErrorStore(): void {
	globalStore = undefined;
}

export function DevErrorOverlay(): JSX.Element {
	const store = getDevErrorStore();
	const [errors, setErrors] = createSignal(store.errors().filter((e) => !e.dismissed));

	function refresh(): void {
		setErrors(store.errors().filter((e) => !e.dismissed));
	}

	function handleWindowError(event: ErrorEvent): void {
		store.register(event.error instanceof Error ? event.error : new Error(event.message), "window.onerror");
		refresh();
	}

	function handleUnhandledRejection(event: PromiseRejectionEvent): void {
		const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
		store.register(err, "unhandledrejection");
		refresh();
	}

	onSettled(() => {
		if (typeof window === "undefined") return;
		window.addEventListener("error", handleWindowError);
		window.addEventListener("unhandledrejection", handleUnhandledRejection);
		return () => {
			window.removeEventListener("error", handleWindowError);
			window.removeEventListener("unhandledrejection", handleUnhandledRejection);
		};
	});

	function dismiss(id: string): void {
		store.dismiss(id);
		refresh();
	}

	function clearAll(): void {
		store.clear();
		refresh();
	}

	return (
		<Show when={errors().length > 0}>
			<Portal>
				<div
					data-flare-dev-overlay
					style={{
						background: "rgba(0,0,0,0.85)",
						bottom: "0",
						color: "#fff",
						"font-family": "monospace",
						"font-size": "14px",
						left: "0",
						overflow: "auto",
						padding: "24px",
						position: "fixed",
						right: "0",
						top: "0",
						"z-index": "99999",
					}}
				>
					<div
						style={{
							display: "flex",
							"justify-content": "space-between",
							"margin-bottom": "16px",
						}}
					>
						<h2 style={{ "font-size": "18px", margin: "0" }}>
							{`${errors().length} error${errors().length === 1 ? "" : "s"}`}
						</h2>
						<button
							onClick={clearAll}
							style={{
								background: "#333",
								border: "1px solid #555",
								"border-radius": "4px",
								color: "#fff",
								cursor: "pointer",
								padding: "4px 12px",
							}}
							type="button"
						>
							Clear all
						</button>
					</div>
					<For each={errors()}>
						{(entry) => (
							<div
								style={{
									background: "#1a1a2e",
									border: "1px solid #e74c3c",
									"border-radius": "8px",
									"margin-bottom": "12px",
									padding: "16px",
								}}
							>
								<div style={{ display: "flex", "justify-content": "space-between" }}>
									<strong style={{ color: "#e74c3c" }}>
										{entry.error.name}: {entry.error.message}
									</strong>
									<button
										onClick={() => dismiss(entry.id)}
										style={{
											background: "none",
											border: "none",
											color: "#888",
											cursor: "pointer",
											"font-size": "16px",
										}}
										type="button"
									>
										x
									</button>
								</div>
								<div style={{ color: "#888", "font-size": "12px", "margin-top": "4px" }}>{entry.source}</div>
								<Show when={entry.error.stack}>
									<pre
										style={{
											color: "#ccc",
											"font-size": "12px",
											"margin-top": "8px",
											"overflow-x": "auto",
											"white-space": "pre-wrap",
										}}
									>
										{entry.error.stack}
									</pre>
								</Show>
							</div>
						)}
					</For>
				</div>
			</Portal>
		</Show>
	) as unknown as JSX.Element;
}
