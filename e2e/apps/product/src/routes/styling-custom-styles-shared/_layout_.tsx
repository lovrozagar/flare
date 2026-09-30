import { createLayout } from "@lovrozagar/flare/layout";
import { Link } from "@lovrozagar/flare/link";

export const route = createLayout("_root_/(styling-custom-styles-shared)")
	.head(() => ({
		custom: { styles: [{ children: ".layout-inline-sheet { color: rgb(1, 2, 3); }" }] },
		title: "Custom styles layout",
	}))
	.render((p) => (
		<div data-testid="custom-styles-layout">
			<nav>
				<Link to="/styling-custom-a">Custom A</Link>
				{" | "}
				<Link to="/styling-custom-b">Custom B</Link>
			</nav>
			{p.children}
		</div>
	));
