import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/files/[...path]")
	.loader((ctx) => {
		const segments = ctx.location.params.path;
		const isArray = Array.isArray(segments);
		const count = isArray ? segments.length : 0;
		const joined = isArray ? segments.join("/") : String(segments);
		const extension =
			isArray && segments.length > 0 ? ((segments[segments.length - 1] ?? "").split(".").pop() ?? "") : "";
		return {
			count,
			extension,
			isArray,
			joined,
			segments: isArray ? segments : [String(segments)],
		};
	})
	.render((props) => (
		<main data-testid="files">
			<h1 data-testid="files-heading">Files</h1>
			<p data-testid="files-joined">{props.loaderData.joined}</p>
			<p data-testid="files-count">{String(props.loaderData.count)}</p>
			<p data-testid="files-is-array">{String(props.loaderData.isArray)}</p>
			<p data-testid="files-ext">{props.loaderData.extension}</p>
			<p data-testid="files-segments">{JSON.stringify(props.loaderData.segments)}</p>
			<nav>
				<Link to="/">Home</Link>
			</nav>
		</main>
	));
