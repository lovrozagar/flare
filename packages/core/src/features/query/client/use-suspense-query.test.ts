import { createComponent, flush, Loading } from "solid-js"
import { Dynamic, render, type JSX } from "@solidjs/web"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { expect, it } from "vitest"
import { useSuspenseQuery } from "./use-suspense-query.ts"

// A query whose result the test releases.
function pending(): { queryFn: () => Promise<number>; release: (value: number) => void } {
	const { promise, resolve } = Promise.withResolvers<number>()
	return { queryFn: () => promise, release: resolve }
}

function mount(child: () => JSX.Element, client = new QueryClient()): { host: HTMLElement; dispose: () => void } {
	const host = document.createElement("div")
	const dispose = render(
		() =>
			createComponent(QueryClientProvider, {
				client,
				get children() {
					return createComponent(Loading, {
						fallback: createComponent(Dynamic, { component: "p", children: "Loading query" }),
						get children() {
							return child()
						},
					})
				},
			}),
		host,
	)
	flush()
	return { host, dispose }
}

const settle = async (): Promise<void> => {
	for (let round = 0; round < 5; round += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
		flush()
	}
}

it("suspense", async () => {
	const query = pending()
	const { host, dispose } = mount(() => {
		const result = useSuspenseQuery(() => ({ queryKey: ["s"], queryFn: query.queryFn }))
		return createComponent(Dynamic, {
			component: "b",
			get children() {
				return String(result.data)
			},
		})
	})
	expect(host.textContent).toBe("Loading query")
	expect(host.querySelector("b")).toBeNull()
	query.release(1)
	await settle()
	dispose()
})

it("resolved", async () => {
	const client = new QueryClient()
	client.setQueryData(["r"], 5)
	const { host, dispose } = mount(() => {
		const result = useSuspenseQuery(() => ({ queryKey: ["r"], queryFn: () => Promise.resolve(6) }))
		return createComponent(Dynamic, {
			component: "b",
			get children() {
				return String(result.data)
			},
		})
	}, client)
	expect(host.textContent).toBe("5")
	dispose()
})

it("loading swap", async () => {
	const query = pending()
	const { host, dispose } = mount(() => {
		const result = useSuspenseQuery(() => ({ queryKey: ["l"], queryFn: query.queryFn }))
		return createComponent(Dynamic, {
			component: "b",
			get children() {
				return `data ${String(result.data)}`
			},
		})
	})
	expect(host.innerHTML).toBe("<p>Loading query</p>")
	query.release(9)
	await settle()
	expect(host.innerHTML).toBe("<b>data 9</b>")
	dispose()
})
