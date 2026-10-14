import { createPage, notFound, redirect, unauthenticated, unauthorized } from "@lovrozagar/flare";

// A loader throws the root helpers: `redirect` is typed by another page's id and params, the other three take nothing.
// The loader's return type is still inferred, so the page's own type does not loop through `redirect` (BUGS.md 105).
export const route = createPage("_root_/moved")
	.loader(({ request }) => {
		const reason = new URL(request.url).searchParams.get("reason");
		if (reason === "gone") notFound();
		if (reason === "guest") unauthenticated();
		if (reason === "reader") unauthorized();
		if (reason === "moved") redirect({ to: "_root_/users/[id]", params: { id: "1" } });
		return { reason };
	})
	.render((props) => <p>{props.loaderData.reason}</p>);
