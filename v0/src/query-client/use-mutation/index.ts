/**
 * useMutation - Mutation hook for data modifications
 *
 * Based on TanStack Solid Query with Flare adaptations.
 *
 * @example
 * ```tsx
 * const mutation = useMutation(() => ({
 *   mutationFn: (newPost: NewPost) => createPost(newPost),
 *   onSuccess: () => {
 *     queryClient.invalidateQueries({ queryKey: ["posts"] })
 *   },
 * }))
 *
 * <button
 *   onClick={() => mutation.mutate({ title: "New Post" })}
 *   disabled={mutation.isPending}
 * >
 *   {mutation.isPending ? "Creating..." : "Create Post"}
 * </button>
 * ```
 */

import type { DefaultError } from "@tanstack/query-core"
import { MutationObserver, noop, shouldThrowError } from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import { createComputed, createMemo, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { QueryClient } from "../query-client/index"
import { useQueryClient } from "../query-client-provider/index"
import type { UseMutateFunction, UseMutationOptions, UseMutationResult } from "../types/index"

/* ============================================================================
 * useMutation
 * ============================================================================ */

export function useMutation<
	TData = unknown,
	TError = DefaultError,
	TVariables = void,
	TOnMutateResult = unknown,
>(
	options: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
	queryClient?: Accessor<QueryClient>,
): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
	const client = createMemo(() => queryClient?.() ?? useQueryClient())

	const observer = new MutationObserver<TData, TError, TVariables, TOnMutateResult>(
		client(),
		options(),
	)

	const mutate: UseMutateFunction<TData, TError, TVariables, TOnMutateResult> = (
		variables,
		mutateOptions,
	) => {
		observer.mutate(variables, mutateOptions).catch(noop)
	}

	const [state, setState] = createStore<
		UseMutationResult<TData, TError, TVariables, TOnMutateResult>
	>({
		...observer.getCurrentResult(),
		mutate,
		mutateAsync: observer.getCurrentResult().mutate,
	})

	createComputed(() => {
		observer.setOptions(options())
	})

	createComputed(
		on(
			() => state.status,
			() => {
				if (state.isError && shouldThrowError(observer.options.throwOnError, [state.error])) {
					throw state.error
				}
			},
		),
	)

	const unsubscribe = observer.subscribe((result) => {
		setState({
			...result,
			mutate,
			mutateAsync: result.mutate,
		})
	})

	onCleanup(unsubscribe)

	return state
}
