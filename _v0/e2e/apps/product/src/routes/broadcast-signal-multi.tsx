import { createPage } from "@lovrozagar/flare/page";
import { createBroadcastSignal } from "@lovrozagar/flare/broadcast";

function ComponentA() {
	const [count, setCount] = createBroadcastSignal("shared-count", 0);
	return (
		<div>
			<p data-testid="comp-a-value">{count()}</p>
			<button data-testid="comp-a-set" onClick={() => setCount(42)}>
				Set 42
			</button>
		</div>
	);
}

function ComponentB() {
	const [count] = createBroadcastSignal("shared-count", 0);
	return (
		<div>
			<p data-testid="comp-b-value">{count()}</p>
		</div>
	);
}

export const route = createPage("_root_/broadcast-signal-multi").render(() => {
	return (
		<main data-testid="broadcast-signal-multi">
			<h1>Broadcast Signal Multi</h1>
			<ComponentA />
			<ComponentB />
		</main>
	);
});
