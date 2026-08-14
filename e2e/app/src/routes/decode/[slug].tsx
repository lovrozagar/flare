import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/decode/[slug]")
	.loader((ctx) => {
		const slug = ctx.location.params.slug
		return {
			decoded: slug,
			length: slug.length,
			rawPath: new URL(ctx.request.url).pathname,
		}
	})
	.render((props) => (
		<main data-testid="decode">
			<h1 data-testid="decode-heading">Decode</h1>
			<p data-testid="decode-slug">{props.loaderData.decoded}</p>
			<p data-testid="decode-length">{String(props.loaderData.length)}</p>
			<p data-testid="decode-raw-path">{props.loaderData.rawPath}</p>
			<nav>
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
