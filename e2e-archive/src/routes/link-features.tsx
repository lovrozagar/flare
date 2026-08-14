import { createPage } from "flare/page"
import { Link } from "flare/link"

export const route = createPage("_root_/link-features").render(() => (
	<div data-testid="link-features">
		<h1>Link Features</h1>

		{/* External href */}
		<Link data-testid="ext-plain" href="https://example.com/page">
			External Plain
		</Link>
		<Link data-testid="ext-blank" href="https://example.com" target="_blank">
			External Blank
		</Link>
		<Link data-testid="ext-rel" href="https://example.com" rel="sponsored" target="_blank">
			External Sponsored
		</Link>
		<Link data-testid="ext-disabled" disabled href="https://example.com">
			External Disabled
		</Link>
		<Link data-testid="ext-xss" href="javascript:alert(1)">
			XSS Attempt
		</Link>

		{/* Auto rel */}
		<Link data-testid="internal-blank" target="_blank" to="/about">
			Internal Blank
		</Link>
		<Link data-testid="internal-rel" rel="nofollow" target="_blank" to="/about">
			Internal Rel
		</Link>
		<Link data-testid="internal-no-blank" to="/about">
			Internal No Blank
		</Link>

		{/* Native attr forwarding */}
		<Link
			aria-label="Go to about"
			data-testid="native-attrs"
			download="file.pdf"
			id="about-link"
			title="About page"
			to="/about"
		>
			Native Attrs
		</Link>

		{/* activeProps / inactiveProps */}
		<Link
			activeClass="is-active"
			activeProps={{ "aria-selected": "true", class: "font-bold" }}
			data-testid="ap-self"
			to="/link-features"
		>
			Self (Active)
		</Link>
		<Link
			activeProps={{ "aria-selected": "true", class: "font-bold" }}
			data-testid="ap-other"
			inactiveProps={{ class: "opacity-50" }}
			to="/about"
		>
			Other (Inactive)
		</Link>
		<Link
			activeProps={{ style: { "font-weight": "bold" } }}
			data-testid="ap-style"
			style={{ color: "red" }}
			to="/link-features"
		>
			Style Merge
		</Link>
	</div>
))
