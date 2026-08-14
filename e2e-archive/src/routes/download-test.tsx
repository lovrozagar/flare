import { createPage } from "flare/page"
import { Link } from "flare/link"

export const route = createPage("_root_/download-test").render(() => (
	<div data-testid="download-test">
		<h1>Download Test</h1>

		{/* Same-origin Link with download — should NOT SPA-navigate */}
		<Link data-testid="link-download" download="" href="/api/download/test.csv">
			Link Download
		</Link>

		{/* Plain anchor with download — should NOT SPA-navigate */}
		<a data-testid="anchor-download" download="" href="/api/download/test.csv">
			Anchor Download
		</a>

		{/* Normal SPA Link without download — SHOULD SPA-navigate */}
		<Link data-testid="link-normal" to="/about">
			Normal Link
		</Link>

		{/* External plain anchor — should NOT be intercepted */}
		<a data-testid="anchor-external" href="https://example.com/file.csv">
			External Anchor
		</a>
	</div>
))
