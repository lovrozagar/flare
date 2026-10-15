import { createPage, unauthenticated, unauthorized } from "@lovrozagar/flare"

// The audit log reads the session itself: optional auth, then the loader throws `unauthenticated()` for a guest and
// `unauthorized()` for a reader, which paint the admin root's 401 and 403 boundaries (BUGS.md 105).
export const route = createPage("_admin_/admin/audit")
	.authenticateOptional("audit")
	.loader(({ auth }) => {
		if (auth === null) unauthenticated()
		if (auth.role !== "admin") unauthorized()
		return { user: auth.user }
	})
	.render((props) => (
		<main>
			<h1 id="audit-title" class="text-2xl font-semibold">
				Audit log for {props.loaderData.user}
			</h1>
		</main>
	))
