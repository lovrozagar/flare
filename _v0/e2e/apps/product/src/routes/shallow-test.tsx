import { createPage } from "@lovrozagar/flare/page";
import { useRouter } from "@lovrozagar/flare/router";

export const route = createPage("_root_/shallow-test")
	.loader(() => ({
		loadedAt: Date.now(),
		random: Math.random(),
	}))
	.render((props) => {
		const r = useRouter();
		return (
			<main data-testid="shallow-test">
				<p data-testid="shallow-loaded-at">{props.loaderData.loadedAt}</p>
				<p data-testid="shallow-random">{props.loaderData.random}</p>
				<button
					data-testid="shallow-search"
					type="button"
					onClick={() => r.navigate({ search: { tab: "b" }, shallow: true, to: "/shallow-test" })}
				>
					Shallow
				</button>
			</main>
		);
	});
