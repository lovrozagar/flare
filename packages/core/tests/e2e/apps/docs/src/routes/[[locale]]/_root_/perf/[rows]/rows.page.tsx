import { createPage, notFound, useDeferred } from "@lovrozagar/flare"
import { For, Loading } from "solid-js"

// docs-perf's heavy pages (plan 21 15.6): a table of 200 rows, the data-heavy page, or 1000 rows with about 10 KB of
// static text beside them, the stress page. One route serves both, so the app's prefetch carries one more module, not
// two. Any other count is the router's 404. A value deferred 500 ms fills a box of fixed height, so the shell streams
// before it and its arrival shifts nothing (docs-perf `streaming shell`, `layout shift`).
const COUNTS = new Set([200, 1000])
const STATIC = "Flare renders this paragraph on the server and hydrates it in the browser. ".repeat(130)

function after<T>(ms: number, value: T): Promise<T> {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export const route = createPage("[[locale]]/_root_/perf/[rows]")
	.loader(({ params, defer }) => {
		const count = Number(params.rows)
		if (!COUNTS.has(count)) throw notFound()
		return {
			rows: Array.from({ length: count }, (_, index) => ({ id: index, name: `Row ${index}`, value: index * 7 })),
			text: count === 1000 ? STATIC : "",
			late: defer(() => after(500, `${count} rows counted`)),
		}
	})
	.head(() => ({ title: "Rows — Flare docs" }))
	.render((props) => {
		const late = useDeferred(() => props.loaderData.late)
		return (
			<main id="perf-rows" class="mx-auto max-w-3xl px-5 py-10">
				<h1 class="text-2xl font-semibold">{props.loaderData.rows.length} rows</h1>
				<div style={{ height: "2rem" }}>
					<Loading fallback={<span id="perf-late-wait">counting</span>}>
						<span id="perf-late">{late()}</span>
					</Loading>
				</div>
				<p id="perf-static">{props.loaderData.text}</p>
				<table>
					<tbody>
						<For each={props.loaderData.rows}>
							{(row) => (
								<tr id={`row-${row.id}`}>
									<td>{row.name}</td>
									<td>{row.value}</td>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</main>
		)
	})
