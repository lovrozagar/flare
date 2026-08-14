import { createPage } from "flare/page"
import { compileSx } from "flare/styles"

/* SSR-dynamic: compileSx called during SSR render. Rule should appear in flare-runtime <style> in head. */
export const route = createPage("_root_/styling-sx-ssr-dynamic").render(() => {
	const { class: cls } = compileSx({ color: "rgb(0, 100, 0)", padding: "20px" })

	return (
		<main data-testid="styling-sx-ssr-dynamic">
			<div class={cls} data-testid="sx-ssr-dynamic-box">
				SSR dynamic compileSx
			</div>
			<p data-testid="sx-ssr-dynamic-class">{cls}</p>
		</main>
	)
})
