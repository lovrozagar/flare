import { createClient } from "@lovrozagar/flare/client"
import { router } from "./router.ts"

// The four boot callbacks, in the order they fire. The lifecycle panel in the footer prints them.
function mark(step: string): void {
	const steps: string[] = Reflect.get(window, "__docsLifecycle") ?? []
	steps.push(step)
	Reflect.set(window, "__docsLifecycle", steps)
	window.dispatchEvent(new CustomEvent("docs:lifecycle"))
}

createClient(router)
	.onReady((ctx) => mark(`ready ${ctx.location.pathname}`))
	.onHydrated(() => mark("hydrated"))
	.onIdle(() => mark("idle"))
	.onInteraction(() => mark("interaction"))
