import { createPage } from "flare/page"
import { serverFnMutationOptions, serverFnQueryOptions } from "flare/server-fn-query"
import { createSignal, Show } from "solid-js"

/*
 * Client-safe stub for the piggyback server function.
 * We can't import from ../server-fns at module scope because it chains
 * to node:async_hooks. The stub only needs _registration metadata —
 * the actual handler runs server-side via HTTP.
 */
const piggybackStub = Object.assign(
	(_input: { value: string }): Promise<never> => {
		throw new Error("stub: should not be called directly on client")
	},
	{ _registration: { method: "post", name: "piggyback" } },
)

export const route = createPage("_root_/query-piggyback").render(() => {
	const [result, setResult] = createSignal("")
	const [cacheHit, setCacheHit] = createSignal("")
	const [invalidated, setInvalidated] = createSignal(false)

	const callMutation = async () => {
		setResult("")
		setCacheHit("")
		setInvalidated(false)

		try {
			const qc = getQueryClientFromWindow()
			if (!qc) {
				setResult("no-query-client")
				return
			}

			const opts = serverFnMutationOptions(piggybackStub, {
				queryClient: qc,
			})
			const data = await opts.mutationFn({ value: "piggyback-test" })
			setResult(JSON.stringify(data))

			const cached = qc.getQueryData(["demo-items"])
			setCacheHit(cached ? JSON.stringify(cached) : "miss")
		} catch (e) {
			setResult(`error: ${e instanceof Error ? e.message : String(e)}`)
		}
	}

	const callQueryOptions = async () => {
		setCacheHit("")
		try {
			const qc = getQueryClientFromWindow()
			if (!qc) {
				setCacheHit("no-query-client")
				return
			}

			const opts = serverFnQueryOptions(piggybackStub, {
				input: { value: "query-test" },
				queryClient: qc,
			})
			const data = await opts.queryFn()
			setResult(JSON.stringify(data))

			const cached = qc.getQueryData(["demo-items"])
			setCacheHit(cached ? JSON.stringify(cached) : "miss")
		} catch (e) {
			setResult(`error: ${e instanceof Error ? e.message : String(e)}`)
		}
	}

	return (
		<div data-testid="query-piggyback-page">
			<h1>Query Piggyback</h1>
			<button data-testid="call-mutation" onClick={callMutation} type="button">
				Call Mutation
			</button>
			<button data-testid="call-query-opts" onClick={callQueryOptions} type="button">
				Call Query Options
			</button>
			<p data-testid="mutation-result">{result()}</p>
			<p data-testid="cache-hit">{cacheHit()}</p>
			<Show when={invalidated()}>
				<p data-testid="invalidated">true</p>
			</Show>
		</div>
	)
})

function getQueryClientFromWindow():
	| {
			getQueryData: (key: unknown[]) => unknown
			invalidateQueries: (opts: { queryKey: unknown[] }) => Promise<void>
			setQueryData: (key: unknown[], data: unknown) => unknown
	  }
	| undefined {
	const w = window as unknown as Record<string, unknown>
	return w.__flareQueryClient as ReturnType<typeof getQueryClientFromWindow>
}
