import { createPage } from "flare/page"

export const route = createPage("_root_/decode/[slug]")
	.loader((ctx) => {
		const slug = ctx.location.params.slug
		const url = new URL(ctx.request.url)
		const rawPath = url.pathname
		return {
			decoded: slug,
			length: slug.length,
			platform: "CF Workers",
			rawPath,
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="decode-heading">Decode — CF Workers</h1>
			<dl>
				<dt>Decoded Slug</dt>
				<dd data-testid="decode-slug">{props.loaderData.decoded}</dd>
				<dt>Length</dt>
				<dd data-testid="decode-length">{String(props.loaderData.length)}</dd>
				<dt>Raw Path</dt>
				<dd data-testid="decode-raw-path">{props.loaderData.rawPath}</dd>
				<dt>Platform</dt>
				<dd data-testid="decode-platform">{props.loaderData.platform}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
