import { createPage } from "@lovrozagar/flare/page";
import { useLoaderData } from "@lovrozagar/flare/router";

/* Reads loader data without a null guard, like an app page. A client navigation
 * that mounts this page before its loader resolves records it and throws here. */
export const route = createPage("_root_/(blog)/blog-data")
	.loader(async () => {
		await new Promise((resolve) => setTimeout(resolve, 300));
		return { title: "Loaded data" };
	})
	.render(() => {
		const data = useLoaderData({ from: "_root_/(blog)/blog-data" });
		const title = () => {
			const current = data();
			if (current == null) (window as unknown as { __nullLoaderData?: boolean }).__nullLoaderData = true;
			return current.title;
		};
		return <main data-testid="blog-data">{title()}</main>;
	});
