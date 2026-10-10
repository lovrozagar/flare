import { For } from "solid-js";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/large-data")
	.loader(() => {
		const items = Array.from({ length: 500 }, (_, i) => ({
			id: i,
			name: `Item ${i}`,
			value: Math.random().toString(36).slice(2),
		}));
		return { count: items.length, items };
	})
	.render((props) => (
		<div data-testid="large-data-page">
			<h1>Large Data</h1>
			<p data-testid="large-data-count">{props.loaderData.count}</p>
			<ul data-testid="large-data-list">
				<For each={props.loaderData.items as Array<{ id: number; name: string }>}>
					{(item) => <li data-testid={`item-${item.id}`}>{item.name}</li>}
				</For>
			</ul>
		</div>
	));
