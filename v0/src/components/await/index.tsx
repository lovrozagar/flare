/**
 * Await Component
 *
 * Renders deferred data with loading/error states.
 *
 * Usage:
 * <Await promise={loaderData.reviews} pending={<Skeleton />}>
 *   {(reviews) => <ReviewList items={reviews} />}
 * </Await>
 *
 * With error handling:
 * <Await
 *   promise={loaderData.reviews}
 *   pending={<Skeleton />}
 *   error={(err, reset) => <button onClick={reset}>Retry</button>}
 * >
 *   {(reviews) => <ReviewList items={reviews} />}
 * </Await>
 */

import { createMemo, createSignal, type JSX, Show } from "solid-js"

interface Deferred<T> {
	__deferred: true
	__error?: { message: string }
	__key?: string
	__resolved?: T
	promise: Promise<T>
}

type AwaitStatus = "error" | "pending" | "success"

interface AwaitProps<T> {
	children: (data: T) => JSX.Element
	error?: ((err: Error, reset: () => void) => JSX.Element) | null
	pending?: JSX.Element
	promise: Deferred<T> | Promise<T>
}

interface AwaitState<T> {
	data: T | undefined
	error: Error | undefined
	status: AwaitStatus
}

function isDeferred<T>(value: Deferred<T> | Promise<T>): value is Deferred<T> {
	return (
		value !== null &&
		typeof value === "object" &&
		"__deferred" in value &&
		value.__deferred === true
	)
}

function getPromise<T>(promiseOrDeferred: Deferred<T> | Promise<T>): Promise<T> {
	return isDeferred(promiseOrDeferred) ? promiseOrDeferred.promise : promiseOrDeferred
}

/**
 * Check if Deferred has pre-resolved value (from SSR awaitDeferred)
 */
function getResolvedValue<T>(promiseOrDeferred: Deferred<T> | Promise<T>): T | undefined {
	if (isDeferred(promiseOrDeferred) && "__resolved" in promiseOrDeferred) {
		return promiseOrDeferred.__resolved
	}
	return undefined
}

/**
 * Check if Deferred has pre-resolved error (from SSR awaitDeferred)
 * Converts serializable error format back to Error object
 */
function getResolvedError<T>(promiseOrDeferred: Deferred<T> | Promise<T>): Error | undefined {
	if (
		isDeferred(promiseOrDeferred) &&
		"__error" in promiseOrDeferred &&
		promiseOrDeferred.__error
	) {
		return new Error(promiseOrDeferred.__error.message)
	}
	return undefined
}

/**
 * Await Component
 *
 * Renders deferred promise data with loading and error states.
 * If the Deferred has __resolved set (from SSR), uses that immediately.
 */
function Await<T>(props: AwaitProps<T>): JSX.Element {
	/* Check for SSR pre-resolved value or error */
	const preResolved = getResolvedValue(props.promise)
	const preError = getResolvedError(props.promise)

	/* Determine initial state based on SSR pre-resolved data */
	function getInitialState(): AwaitState<T> {
		if (preResolved !== undefined) {
			return { data: preResolved, error: undefined, status: "success" }
		}
		if (preError !== undefined) {
			return { data: undefined, error: preError, status: "error" }
		}
		return { data: undefined, error: undefined, status: "pending" }
	}

	const [state, setState] = createSignal<AwaitState<T>>(getInitialState())

	let currentPromise: Promise<T> | null = null

	const runPromise = (promise: Promise<T>) => {
		currentPromise = promise
		setState({ data: undefined, error: undefined, status: "pending" })

		promise
			.then((data) => {
				if (currentPromise === promise) {
					setState({ data, error: undefined, status: "success" })
				}
			})
			.catch((err: unknown) => {
				if (currentPromise === promise) {
					const error = err instanceof Error ? err : new Error(String(err))
					setState({ data: undefined, error, status: "error" })
				}
			})
	}

	/* Only run promise if not already resolved or errored from SSR */
	if (preResolved === undefined && preError === undefined) {
		const promise = getPromise(props.promise)
		/* Guard against undefined promise (can happen if Deferred was serialized) */
		if (promise) {
			runPromise(promise)
		}
	}

	const reset = () => {
		const promise = getPromise(props.promise)
		runPromise(promise)
	}

	const current = createMemo(() => state())

	return (
		<>
			<Show when={current().status === "pending"}>{props.pending}</Show>
			<Show when={current().status === "error" && current().error}>
				{(err) => {
					const errorHandler = props.error
					if (errorHandler === null || errorHandler === undefined) {
						return null
					}
					return errorHandler(err(), reset)
				}}
			</Show>
			<Show when={current().status === "success" && current().data !== undefined}>
				{(_) => props.children(current().data as T)}
			</Show>
		</>
	) as JSX.Element
}

export type { AwaitProps, AwaitState, AwaitStatus, Deferred }

export { Await, getPromise, getResolvedError, getResolvedValue, isDeferred }
