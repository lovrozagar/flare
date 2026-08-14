import { Link } from "flare/link"
import { createPage } from "flare/page"
import { For } from "solid-js"

export const route = createPage("_root_/scroll-tall")
	.loader(() => ({
		items: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, label: `Item ${i + 1}` })),
	}))
	.render((props) => (
		<main data-testid="scroll-tall-page">
			<h1 id="top">Scroll Tall</h1>
			<Link data-testid="hash-20" hash="section-20" to="/scroll-tall">
				Jump 20
			</Link>
			<Link data-testid="hash-30" hash="section-30" to="/scroll-tall">
				Jump 30
			</Link>
			<ul>
				<For each={props.loaderData.items}>
					{(item) => (
						<li id={`section-${item.id}`} style={{ "min-height": "80px" }}>
							{item.label}
						</li>
					)}
				</For>
			</ul>
		</main>
	))
