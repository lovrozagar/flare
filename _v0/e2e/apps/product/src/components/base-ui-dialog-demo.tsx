import { createSignal, Show } from "solid-js";

/**
 * Local stand-in for Base UI primitives so sx/class composition is still
 * exercised. `@msviderok/base-ui-solid` is not a product dependency.
 */
export function DialogDemo() {
	const [open, setOpen] = createSignal(false);
	return (
		<div>
			<button
				class="bui-trigger-custom"
				data-testid="bui-trigger"
				sx={{ backgroundColor: "rgb(59, 130, 246)", borderRadius: "6px", padding: "8px 16px" }}
				type="button"
				onClick={() => setOpen(true)}
			>
				Open dialog
			</button>
			<Show when={open()}>
				<div data-testid="bui-backdrop" sx={{ background: "rgba(0,0,0,0.5)", inset: "0", position: "fixed" }} />
				<div
					data-testid="bui-popup"
					sx={{
						background: "white",
						borderRadius: 8,
						boxShadow: "0 10px 30px rgba(0,0,0,.2)",
						left: "50%",
						padding: 24,
						position: "fixed",
						top: "50%",
						transform: "translate(-50%, -50%)",
					}}
				>
					<h2 class="text-lg font-semibold" data-testid="bui-title">
						Dialog title
					</h2>
					<p data-testid="bui-description">Testing sx + class integration with Base UI Solid.</p>
					<button data-testid="bui-close" type="button" onClick={() => setOpen(false)}>
						Close
					</button>
				</div>
			</Show>
		</div>
	);
}

export function PolyDemo() {
	const [open, setOpen] = createSignal(false);
	return (
		<div>
			<a
				data-flare-skip
				data-testid="bui-trigger-link"
				href="#poly"
				sx={{ textDecoration: "underline" }}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setOpen(true);
				}}
			>
				Link trigger
			</a>
			<Show when={open()}>
				<div
					data-testid="bui-poly-popup"
					sx={{
						background: "white",
						left: "50%",
						padding: 16,
						position: "fixed",
						top: "50%",
						transform: "translate(-50%, -50%)",
					}}
				>
					<button data-testid="bui-poly-close" type="button" onClick={() => setOpen(false)}>
						Close
					</button>
				</div>
			</Show>
		</div>
	);
}
