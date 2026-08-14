import { Link } from "flare/link"
import { createPage } from "flare/page"
import { createPathSegment } from "flare/path-segment"

export const categorySegment = createPathSegment(
	"_root_/(path-segment-test)/path-segment-test/[category]",
)

export const route = createPage("_root_/(path-segment-test)/path-segment-test/[category]/detail")
	.loader((ctx) => ({ category: ctx.location.params.category }))
	.render((props) => (
		<main data-testid="path-seg-detail">
			<p data-testid="path-seg-category">{props.loaderData.category}</p>
			<Link
				data-testid="link-to-music"
				params={{ category: "music" }}
				to="/path-segment-test/[category]/detail"
			>
				Music
			</Link>
		</main>
	))
