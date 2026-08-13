import { createPage } from "flare/page"
import { Link } from "flare/link"

export const route = createPage("_root_/link-test").render(() => (
	<div data-testid="link-test">
		<Link to="/about" replace data-testid="link-replace">
			Replace Link
		</Link>
		<Link to="/about" data-testid="link-normal">
			Normal Link
		</Link>
		<a href="https://example.com" data-testid="link-external">
			External
		</a>
		<Link hash="section" to="/about" data-testid="link-hash">
			Hash Link
		</Link>
		<Link to="/about" force data-testid="link-force">
			Force Link
		</Link>
		<Link to="/about" viewTransition data-testid="vt-link">
			View Transition Link
		</Link>
	</div>
))
