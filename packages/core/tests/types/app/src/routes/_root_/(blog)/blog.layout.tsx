import { createLayout } from "@lovrozagar/flare"

export const route = createLayout("_root_/(blog)")
	.input({ searchParams: (raw: Record<string, string | string[]>) => ({ section: String(raw["section"]) }) })
	.authenticate()
	.preloader((): { role: "admin" | "editor" } => ({ role: "editor" }))
	.loader(() => ({ section: "news" }))
	.render((props) => <main>{props.children}</main>)
