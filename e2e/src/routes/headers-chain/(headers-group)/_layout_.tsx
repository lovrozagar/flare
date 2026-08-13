import { createLayout } from "flare/layout"
import type { JSX } from "solid-js"

export const route = createLayout("_root_/(headers-group)")
	.headers(() => ({
		"x-layout-header": "from-layout",
		"x-shared": "layout-value",
	}))
	.render((props) => <div data-testid="headers-chain-layout">{props.children as JSX.Element}</div>)
