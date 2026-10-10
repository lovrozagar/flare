import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_admin_/dashboard")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render(() => <main data-testid="admin-dash">Admin dashboard</main>);
