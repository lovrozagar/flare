import { createLayout } from "flare/layout"

export const route = createLayout("_root_/[locale]")
	.cache({
		ssg: {
			params: () => [{ locale: "en" }, { locale: "fr" }],
		},
	})
	.render((props) => <div data-testid="ssg-locale-layout">{props.children}</div>)
