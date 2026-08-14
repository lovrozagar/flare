import { createPage } from "flare/page"
import { createPathSegment } from "flare/path-segment"
import { Link } from "flare/link"

export const categorySegment = createPathSegment(
	"_root_/(path-segment-test)/path-segment-test/[category]",
).cache({
	ssg: {
		params: () => [{ category: "books" }, { category: "music" }],
	},
})

export const route = createPage("_root_/(path-segment-test)/path-segment-test/[category]/detail")
	.cache({ ssg: true })
	.loader((ctx) => ({
		category: ctx.location.params.category,
	}))
	.render((props) => (
		<div data-testid="path-seg-detail">
			<h1>Path Segment Detail</h1>
			<p data-testid="path-seg-category">{props.loaderData.category}</p>
			<nav>
				<Link to="/">Home</Link>
				<Link
					data-testid="link-to-music"
					params={{ category: "music" }}
					to="/path-segment-test/[category]/detail"
				>
					Music
				</Link>
				<Link
					data-testid="link-to-books"
					params={{ category: "books" }}
					to="/path-segment-test/[category]/detail"
				>
					Books
				</Link>
			</nav>
		</div>
	))
