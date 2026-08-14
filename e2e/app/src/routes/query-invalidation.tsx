import { createPage } from "flare/page"
import { useRouter } from "flare/router"

export const route = createPage("_root_/query-invalidation")
	.loader(() => ({ ts: Date.now() }))
	.render((props) => {
		const r = useRouter()
		return (
			<main data-testid="query-invalidation">
				<p data-testid="qi-ts">{props.loaderData.ts}</p>
				<button data-testid="qi-invalidate" type="button" onClick={() => r.invalidate()}>
					Invalidate
				</button>
			</main>
		)
	})
