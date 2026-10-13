import { createSignal, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";

// The boot callbacks client.tsx recorded, in order. Empty on the server and during hydrate.
export function Lifecycle(): JSX.Element {
	const [steps, setSteps] = createSignal<string[]>([]);
	onSettled(() => {
		const read = (): void => {
			setSteps([...(Reflect.get(window, "__docsLifecycle") ?? [])]);
		};
		read();
		window.addEventListener("docs:lifecycle", read);
		return () => window.removeEventListener("docs:lifecycle", read);
	});
	return (
		<span>
			boot <code id="lifecycle">{steps().join(" → ")}</code>
		</span>
	);
}
