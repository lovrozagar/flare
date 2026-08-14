import { createPage } from "flare/page"

/**
 * Fails on first load, succeeds on retry.
 * Server-side counter tracks calls — first call throws, subsequent succeed.
 * Reset via API endpoint /api/retry-reset.
 */
let callCount = 0

export function resetRetryCounter(): void {
	callCount = 0
}

export const route = createPage("_root_/retry-test")
	.loader(() => {
		callCount++
		if (callCount === 1) {
			throw new Error("Transient failure")
		}
		return { attempt: callCount }
	})
	.render((props) => {
		const data = props.loaderData as { attempt: number }
		return (
			<div data-testid="retry-success">
				<p data-testid="attempt-count">Attempt: {data.attempt}</p>
			</div>
		)
	})
	.errorRender((props) => (
		<div data-testid="retry-error-boundary">
			<p data-testid="retry-error-message">{props.error.message}</p>
			<button data-testid="retry-button" onClick={() => props.retry()}>
				Retry
			</button>
			<button data-testid="reset-button" onClick={() => props.reset()}>
				Reset
			</button>
		</div>
	))
