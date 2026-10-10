import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";
import { Await } from "@lovrozagar/flare/await";

export const route = createPage("_root_/styling-deferred")
	.loader((ctx) => {
		const delayed = ctx.defer<{ label: string }>(async () => {
			await new Promise((r) => setTimeout(r, 200));
			return { label: "streamed-result" };
		});
		const slow = ctx.defer<{ label: string }>(async () => {
			await new Promise((r) => setTimeout(r, 400));
			return { label: "slow-result" };
		});
		return { delayed, slow };
	})
	.render((props) => {
		/* styles() must be called in render, not in loader —
		   clearScopedStyles() runs before render, wiping loader-registered CSS */
		const shellProps = styles("deferred-shell", {
			css: "padding: 16px; color: rgb(0, 100, 0); font-weight: bold;",
		});
		const pendingProps = styles("deferred-pending", {
			css: "color: rgb(200, 200, 200); font-style: italic;",
		});
		return (
			<main data-testid="styling-deferred">
				<div {...shellProps} data-testid="deferred-shell">
					Shell Content
				</div>
				<Await
					pending={
						<div {...pendingProps} data-testid="deferred-pending">
							Loading...
						</div>
					}
					promise={props.loaderData.delayed}
				>
					{(val) => {
						const resolvedProps = styles("deferred-resolved", {
							css: "padding: 12px; color: rgb(0, 0, 200); font-weight: bold;",
						});
						return (
							<div {...resolvedProps} data-testid="deferred-resolved">
								{val.label}
							</div>
						);
					}}
				</Await>
				<Await pending={<span data-testid="slow-pending">slow loading...</span>} promise={props.loaderData.slow}>
					{(val) => {
						const slowProps = styles("deferred-slow-resolved", {
							css: "color: rgb(200, 0, 0); text-decoration: underline;",
						});
						return (
							<div {...slowProps} data-testid="slow-resolved">
								{val.label}
							</div>
						);
					}}
				</Await>
			</main>
		);
	});
