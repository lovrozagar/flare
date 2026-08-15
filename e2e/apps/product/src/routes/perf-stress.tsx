import { Await } from "@lovrozagar/flare/await";
import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";
import { For } from "solid-js";

export const route = createPage("_root_/perf-stress")
	.loader((ctx) => {
		const rows = Array.from({ length: 1000 }, (_, i) => ({
			active: i % 3 === 0,
			category: ["A", "B", "C"][i % 3],
			id: i,
			name: `Item ${i}`,
			value: Math.random().toString(36).slice(2, 10),
		}));

		const slowDeferred = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 500));
			return "stress-deferred-resolved";
		});

		return {
			count: rows.length,
			rows,
			slowDeferred,
			staticPayload: "x".repeat(10_000),
		};
	})
	.head(() => ({ title: "Performance Stress Test" }))
	.render((props) => (
		<main data-testid="perf-stress-page">
			<h1>Performance Stress Test</h1>
			<p data-testid="stress-count">{props.loaderData.count}</p>
			<p data-testid="stress-payload-len">{(props.loaderData.staticPayload as string).length}</p>

			<nav data-testid="stress-nav">
				<Link to="/">Home</Link>
				<Link to="/about">About</Link>
				<Link to="/perf-bench">Perf Bench</Link>
			</nav>

			<Await
				pending={<span data-testid="stress-deferred-pending">loading...</span>}
				promise={props.loaderData.slowDeferred}
			>
				{(val) => <span data-testid="stress-deferred-resolved">{val}</span>}
			</Await>

			<table data-testid="stress-table">
				<thead>
					<tr>
						<th>ID</th>
						<th>Name</th>
						<th>Category</th>
						<th>Active</th>
						<th>Value</th>
					</tr>
				</thead>
				<tbody>
					<For
						each={
							props.loaderData.rows as Array<{
								active: boolean;
								category: string | undefined;
								id: number;
								name: string;
								value: string;
							}>
						}
					>
						{(row) => (
							<tr data-testid={`stress-row-${row.id}`}>
								<td>{row.id}</td>
								<td>{row.name}</td>
								<td>{row.category}</td>
								<td>{String(row.active)}</td>
								<td>{row.value}</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</main>
	));
