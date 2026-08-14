import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/(dc-l1)/(dc-l2)/(dc-l3)/deep-cache/")
	.cache({ isr: { revalidate: 10 } })
	.loader(() => ({ layer: "P1-isr", ts: Date.now() }))
	.render((props) => (
		<main data-testid="dc-p1">
			<span data-testid="dc-p1-layer">{props.loaderData.layer}</span>
			<span data-testid="dc-p1-ts">{props.loaderData.ts}</span>
			<nav data-testid="dc-nav">
				<Link data-testid="dc-nav-p1" to="/deep-cache">
					P1 ISR
				</Link>
				<Link data-testid="dc-nav-p2" to="/deep-cache/uncached">
					P2 Uncached
				</Link>
			</nav>
		</main>
	))
