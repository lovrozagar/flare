import { Await } from "flare/await"
import { createPage } from "flare/page"
import { For } from "solid-js"

export const route = createPage("_root_/perf-bench")
	.loader((ctx) => {
		const rows = Array.from({ length: 200 }, (_, i) => ({
			id: i,
			name: `Row ${i}`,
			value: Math.random().toString(36).slice(2, 10),
		}))

		const deferred = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 150))
			return "deferred-resolved"
		})

		return {
			count: rows.length,
			deferred,
			rows,
			staticText: "Performance benchmark page for Flare framework",
		}
	})
	.head(() => ({ title: "Performance Benchmark" }))
	.render((props) => (
		<main data-testid="perf-bench-page">
			<h1>Performance Benchmark</h1>
			<p data-testid="perf-static">{props.loaderData.staticText}</p>
			<p data-testid="perf-count">{props.loaderData.count}</p>
			<Await
				pending={<span data-testid="perf-deferred-pending">loading...</span>}
				promise={props.loaderData.deferred}
			>
				{(val) => <span data-testid="perf-deferred-resolved">{val}</span>}
			</Await>
			<table data-testid="perf-table">
				<thead>
					<tr>
						<th>ID</th>
						<th>Name</th>
						<th>Value</th>
					</tr>
				</thead>
				<tbody>
					<For each={props.loaderData.rows as Array<{ id: number; name: string; value: string }>}>
						{(row) => (
							<tr data-testid={`perf-row-${row.id}`}>
								<td>{row.id}</td>
								<td>{row.name}</td>
								<td>{row.value}</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</main>
	))
