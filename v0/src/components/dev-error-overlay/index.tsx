/**
 * Dev Error Overlay
 *
 * Full-screen modal displaying error details in development mode.
 * Uses Portal to render outside the app tree.
 * Auto-clears on HMR (file save).
 *
 * NOTE: Uses inline CSS strings (not object styles) to avoid SSR-specific
 * Solid exports like ssrStyleProperty which aren't available in client bundles.
 */

import { createEffect, For, type JSX, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { type CapturedError, devErrorStore } from "../../errors/dev-error-store"

/* CSS as strings to avoid SSR compilation issues */
const css = {
	backdrop:
		"position:fixed;top:0;left:0;width:100vw;height:100vh;background-color:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:99999",
	button:
		"background-color:transparent;border:1px solid #525252;border-radius:4px;color:#e5e5e5;cursor:pointer;font-size:12px;margin-right:8px;padding:6px 12px",
	closeButton:
		"background-color:transparent;border:none;color:white;cursor:pointer;font-size:20px;line-height:1;padding:4px 8px",
	container:
		"background-color:#1a1a1a;border-radius:8px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);color:#e5e5e5;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:14px;max-height:90vh;max-width:90vw;overflow:hidden;width:800px",
	content: "max-height:calc(90vh - 60px);overflow-y:auto;padding:16px",
	errorCard: "margin-bottom:24px",
	errorMessage: "color:#fafafa;font-size:16px;margin:0 0 16px 0;white-space:pre-wrap",
	errorName: "color:#f87171;font-size:18px;font-weight:600;margin:0 0 8px 0",
	header:
		"align-items:center;background-color:#dc2626;display:flex;justify-content:space-between;padding:12px 16px",
	sourceInfo: "background-color:#262626;border-radius:4px;margin-bottom:16px;padding:8px 12px",
	sourceLabel: "color:#737373",
	sourceValue: "color:#fbbf24",
	stack:
		"background-color:#171717;border-radius:4px;font-size:12px;line-height:1.6;overflow-x:auto;padding:12px;white-space:pre-wrap",
	title: "color:white;font-size:16px;font-weight:600;margin:0",
}

interface ErrorCardProps {
	error: CapturedError
	onDismiss: () => void
}

function ErrorCard(props: ErrorCardProps): JSX.Element {
	return (
		<div style={css.errorCard}>
			<div style={css.sourceInfo}>
				<span style={css.sourceLabel}>Source: </span>
				<span style={css.sourceValue}>{props.error.source}</span>
			</div>

			<h3 style={css.errorName}>{props.error.error.name}</h3>
			<p style={css.errorMessage}>{props.error.error.message}</p>

			<Show when={props.error.error.stack}>
				<pre style={css.stack}>{props.error.error.stack}</pre>
			</Show>

			<div style={{ "margin-top": "12px" }}>
				<button onClick={props.onDismiss} style={css.button} type="button">
					Dismiss
				</button>
			</div>
		</div>
	)
}

function DevErrorOverlay(): JSX.Element {
	/* HMR auto-clear */
	if (import.meta.hot) {
		import.meta.hot.on("vite:beforeUpdate", () => {
			devErrorStore.clear()
		})
	}

	/* Escape key to dismiss all */
	createEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape" && devErrorStore.hasErrors()) {
				devErrorStore.clear()
			}
		}
		document.addEventListener("keydown", handleKeyDown)
		onCleanup(() => document.removeEventListener("keydown", handleKeyDown))
	})

	const visibleErrors = () => devErrorStore.errors().filter((e) => !e.dismissed)

	return (
		<Show when={visibleErrors().length > 0}>
			<Portal mount={document.body}>
				<div style={css.backdrop}>
					<div style={css.container}>
						<div style={css.header}>
							<h2 style={css.title}>
								{visibleErrors().length} Error{visibleErrors().length > 1 ? "s" : ""}
							</h2>
							<button
								onClick={() => devErrorStore.clear()}
								style={css.closeButton}
								title="Dismiss all (Esc)"
								type="button"
							>
								&times;
							</button>
						</div>
						<div style={css.content}>
							<For each={visibleErrors()}>
								{(error) => (
									<ErrorCard error={error} onDismiss={() => devErrorStore.dismiss(error.id)} />
								)}
							</For>
						</div>
					</div>
				</div>
			</Portal>
		</Show>
	) as JSX.Element
}

export { DevErrorOverlay }
