import { createPage } from "flare/page"
import { Link } from "flare/link"

let callCount = 0

export const route = createPage("_root_/(dc-l1)/(dc-l2)/(dc-l3)/(dc-l4)/deep-cache/store-page")
	.cache({ ssr: { staleTime: 3000, tags: ["dc-p3"], ttl: 30 } })
	.loader(() => {
		callCount++
		return { callCount, layer: "P3-store", ts: Date.now() }
	})
	.render((props) => (
		<div data-testid="dc-p3">
			<span data-testid="dc-p3-layer">{props.loaderData.layer}</span>
			<span data-testid="dc-p3-ts">{props.loaderData.ts}</span>
			<span data-testid="dc-p3-calls">{props.loaderData.callCount}</span>
			<nav data-testid="dc-nav">
				<Link data-testid="dc-nav-p1" to="/deep-cache">
					P1 ISR
				</Link>
				<Link data-testid="dc-nav-p2" to="/deep-cache/uncached">
					P2 Uncached
				</Link>
				<Link data-testid="dc-nav-p3" to="/deep-cache/store-page">
					P3 Store
				</Link>
			</nav>
		</div>
	))
