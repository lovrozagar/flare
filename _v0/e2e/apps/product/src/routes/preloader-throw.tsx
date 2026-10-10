import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/preloader-throw")
	.preloader(() => {
		throw new Error("Preloader exploded");
	})
	.loader(() => ({ reached: true }))
	.render(() => <div data-testid="preloader-render">no</div>)
	.errorRender((props) => (
		<div data-testid="preloader-error-boundary">
			<p data-testid="preloader-error-message">{props.error.message}</p>
		</div>
	));
