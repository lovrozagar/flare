import { createPage } from "flare/page"

const retryState = globalThis as { __flareRetryCount?: number }

export function resetRetryCounter(): void {
	retryState.__flareRetryCount = 0
}

export const route = createPage("_root_/retry-test")
	.loader(() => {
		retryState.__flareRetryCount = (retryState.__flareRetryCount ?? 0) + 1
		if (retryState.__flareRetryCount === 1) throw new Error("Transient failure")
		return { attempt: retryState.__flareRetryCount }
	})
	.render((props) => (
		<div data-testid="retry-success">
			<p data-testid="attempt-count">{props.loaderData.attempt}</p>
		</div>
	))
	.errorRender((props) => (
		<div data-testid="retry-error-boundary">
			<p data-testid="retry-error-message">{props.error.message}</p>
			<button data-testid="retry-button" type="button" onClick={() => props.retry()}>
				Retry
			</button>
		</div>
	))
