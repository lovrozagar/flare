import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/download-test").render(() => (
	<main data-testid="download-test">
		<Link data-testid="link-download" download="" href="/api/download/test.csv">
			Download
		</Link>
		<a data-testid="anchor-download" download="" href="/api/download/test.csv">
			Anchor Download
		</a>
		<Link data-testid="link-normal" to="/about">
			About
		</Link>
		<a data-testid="anchor-external" href="https://example.com/file.csv">
			External Anchor
		</a>
	</main>
))
