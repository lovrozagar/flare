import { createPage } from "flare/page"
import { useBroadcast, createBroadcastSignal } from "flare/broadcast"
import { useRouter } from "flare/router"
import { createSignal, Show } from "solid-js"

export const route = createPage("_root_/broadcast-test").render(() => {
	const router = useRouter()

	/* useBroadcast: listen + emit */
	const [received, setReceived] = createSignal("")
	const emit = useBroadcast<string>("ping", (data) => {
		setReceived(data)
	})

	/* createBroadcastSignal */
	const [count, setCount] = createBroadcastSignal("counter", 0)

	return (
		<main data-testid="broadcast-test">
			<h1>Broadcast Test</h1>

			<section data-testid="event-section">
				<button data-testid="emit-btn" onClick={() => emit("hello-from-tab")}>
					Emit
				</button>
				<p data-testid="received">{received()}</p>
			</section>

			<section data-testid="signal-section">
				<p data-testid="count">{count()}</p>
				<button data-testid="inc-btn" onClick={() => setCount(count() + 1)}>
					Increment
				</button>
			</section>

			<section data-testid="router-section">
				<button
					data-testid="nav-broadcast-btn"
					onClick={() => router.navigate({ broadcast: true, to: "/about" })}
				>
					Navigate Broadcast
				</button>
				<button
					data-testid="nav-no-broadcast-btn"
					onClick={() => router.navigate({ to: "/about" })}
				>
					Navigate No Broadcast
				</button>
				<button
					data-testid="invalidate-broadcast-btn"
					onClick={() => router.invalidate({ broadcast: true })}
				>
					Invalidate Broadcast
				</button>
			</section>
		</main>
	)
})
