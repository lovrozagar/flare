/**
 * Scripts Component
 *
 * Renders Flare state script and entry client script during SSR.
 * On client, returns null (scripts already loaded from SSR).
 *
 * Wrapped in NoHydration to prevent hydration markers from parent
 * Hydration context leaking into sibling elements.
 */

import type { JSX } from "solid-js"
import { NoHydration } from "solid-js/web"
import { useSSRContext } from "./ssr-context"

function Scripts(): JSX.Element {
	const ctx = useSSRContext()

	if (!ctx?.isServer) {
		return null as unknown as JSX.Element
	}

	const hasFlareState = Boolean(ctx.flareStateScript)
	const hasEntryScript = Boolean(ctx.entryScript)

	if (!hasFlareState && !hasEntryScript) {
		return null as unknown as JSX.Element
	}

	/*
	 * Wrap in NoHydration to prevent hydration markers.
	 * This is necessary because Solid's hydration context doesn't
	 * properly restore after sibling elements with nested boundaries.
	 */
	return (
		<NoHydration>
			{hasFlareState && (
				<script
					data-testid="flare-state-script"
					innerHTML={ctx.flareStateScript}
					nonce={ctx.nonce || undefined}
				/>
			)}
			{hasEntryScript && (
				<script
					data-testid="entry-client-script"
					nonce={ctx.nonce || undefined}
					src={ctx.entryScript}
					type="module"
				/>
			)}
		</NoHydration>
	)
}

export { Scripts }
