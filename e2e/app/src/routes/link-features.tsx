import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/link-features").render(() => (
	<main data-testid="link-features">
		<h1>Link Features</h1>
		<Link data-testid="ext-plain" href="https://example.com/page">
			External Plain
		</Link>
		<Link data-testid="ext-blank" href="https://example.com" target="_blank">
			External Blank
		</Link>
		<Link data-testid="internal-blank" target="_blank" to="/about">
			Internal Blank
		</Link>
		<Link data-testid="ext-xss" href="javascript:alert(1)">
			XSS Attempt
		</Link>
		<Link activeClass="is-active" data-testid="ap-self" to="/link-features">
			Self
		</Link>
		<Link data-testid="ap-other" inactiveClass="is-inactive" to="/about">
			Other
		</Link>
		<Link data-testid="replace-about" replace to="/about">
			Replace About
		</Link>
		<Link data-testid="disabled-link" disabled to="/about">
			Disabled
		</Link>
		<Link data-testid="hash-link" hash="section" to="/about">
			Hash
		</Link>
	</main>
))
