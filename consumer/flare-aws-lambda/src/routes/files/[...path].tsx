import { createPage } from "flare/page"

export const route = createPage("_root_/files/[...path]")
	.loader((ctx) => {
		const segments = ctx.location.params.path
		const isArray = Array.isArray(segments)
		const count = isArray ? segments.length : 0
		const joined = isArray ? segments.join("/") : String(segments)
		const extension =
			isArray && segments.length > 0
				? ((segments[segments.length - 1] ?? "").split(".").pop() ?? "")
				: ""
		return {
			count,
			extension,
			isArray,
			joined,
			platform: "AWS Lambda",
			segments: isArray ? segments : [String(segments)],
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="files-heading">Files — AWS Lambda</h1>
			<dl>
				<dt>Path</dt>
				<dd data-testid="files-joined">{props.loaderData.joined}</dd>
				<dt>Segments</dt>
				<dd data-testid="files-count">{String(props.loaderData.count)}</dd>
				<dt>Is Array</dt>
				<dd data-testid="files-is-array">{String(props.loaderData.isArray)}</dd>
				<dt>Extension</dt>
				<dd data-testid="files-ext">{props.loaderData.extension}</dd>
				<dt>All Segments</dt>
				<dd data-testid="files-segments">{JSON.stringify(props.loaderData.segments)}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
