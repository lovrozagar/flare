import { createBroadcastSignal, useBroadcast } from "@lovrozagar/flare/broadcast";
import { createPage } from "@lovrozagar/flare/page";
import { useRouter } from "@lovrozagar/flare/router";
import { createSignal } from "solid-js";

export const route = createPage("_root_/broadcast-test").render(() => {
	const router = useRouter();
	const [received, setReceived] = createSignal("");
	const emit = useBroadcast<string>("ping", (data) => {
		setReceived(data);
	});
	const [count, setCount] = createBroadcastSignal("counter", 0);

	return (
		<main data-testid="broadcast-test">
			<button data-testid="emit-btn" type="button" onClick={() => emit("hello-from-tab")}>
				Emit
			</button>
			<p data-testid="received">{received()}</p>
			<p data-testid="count">{count()}</p>
			<button data-testid="inc-btn" type="button" onClick={() => setCount(count() + 1)}>
				Inc
			</button>
			<button
				data-testid="nav-broadcast-btn"
				type="button"
				onClick={() => router.navigate({ broadcast: true, to: "/about" })}
			>
				Nav broadcast
			</button>
			<button data-testid="nav-no-broadcast-btn" type="button" onClick={() => router.navigate({ to: "/about" })}>
				Navigate No Broadcast
			</button>
			<button
				data-testid="invalidate-broadcast-btn"
				type="button"
				onClick={() => router.invalidate({ broadcast: true })}
			>
				Invalidate Broadcast
			</button>
			<section data-testid="event-section" />
			<section data-testid="signal-section" />
			<section data-testid="router-section" />
		</main>
	);
});
