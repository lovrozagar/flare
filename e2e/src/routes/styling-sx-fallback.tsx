import { createPage } from "flare/page"
import { compileSx } from "flare/styles"

/* Fully dynamic sx object — shape unknown at build time. compileSx runtime path. */
function buildSx(color: string) {
	return { color, fontSize: "22px", fontWeight: "700" }
}

export const route = createPage("_root_/styling-sx-fallback").render(() => {
	const dynamicSx = buildSx("rgb(128, 0, 128)")
	const { class: cls } = compileSx(dynamicSx)

	return (
		<main data-testid="styling-sx-fallback">
			<div
				class={cls}
				data-testid="sx-fallback-box"
			>
				Runtime compileSx
			</div>
			<p data-testid="sx-fallback-class">{cls}</p>
		</main>
	)
})
