import { createLayout } from "@lovrozagar/flare/layout";
import { InterceptOutlet } from "@lovrozagar/flare/intercept-outlet";

export const route = createLayout("_root_/(products)").render((props) => (
	<>
		{props.children}
		<InterceptOutlet>
			{(state) => (
				<div data-render-mode={state.render} data-testid="intercept-overlay">
					<button data-testid="intercept-dismiss" type="button" onClick={() => state.dismiss()}>
						Close
					</button>
					{state.match.render({
						loaderData: state.match.loaderData,
						location: state.backgroundLocation,
						router: props.router,
					})}
				</div>
			)}
		</InterceptOutlet>
	</>
));
