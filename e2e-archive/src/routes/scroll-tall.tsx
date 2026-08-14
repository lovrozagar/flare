import { For } from "solid-js"
import { createPage } from "flare/page"
import { Link } from "flare/link"

export const route = createPage("_root_/scroll-tall")
	.loader(() => ({
		items: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, label: `Item ${i + 1}` })),
	}))
	.head(() => ({ title: "Scroll Tall" }))
	.render((props) => (
		<div data-testid="scroll-tall-page">
			<h1 id="top">Scroll Tall Page</h1>
			<nav>
				<Link hash="section-50" to="/scroll-tall">
					Jump to Section 50
				</Link>
				{" | "}
				<Link hash="section-90" to="/scroll-tall">
					Jump to Section 90
				</Link>
				{" | "}
				<Link hash="nonexistent" to="/scroll-tall">
					Jump to Nonexistent
				</Link>
				{" | "}
				<Link to="/">Home</Link>
			</nav>
			<ul>
				<For each={props.loaderData.items}>
					{(item) => (
						<li id={`section-${item.id}`} style={{ "min-height": "30px" }}>
							<span data-testid={`item-${item.id}`}>{item.label}</span>
						</li>
					)}
				</For>
			</ul>
			<div id="bottom" data-testid="bottom-marker">
				Bottom of page
			</div>
		</div>
	))
