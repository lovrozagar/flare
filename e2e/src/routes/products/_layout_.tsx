import { createLayout } from "flare/layout"
import { InterceptOutlet } from "flare/intercept-outlet"

export const route = createLayout("_root_/(products)").render((props) => (
	<>
		{props.children}
		<InterceptOutlet>
			{(state) => (
				<div
					data-render-mode={state.render}
					data-testid="intercept-overlay"
					style={{
						"align-items": "center",
						"background": "rgba(0,0,0,0.5)",
						"display": "flex",
						"inset": "0",
						"justify-content": "center",
						"position": "fixed",
						"z-index": "100",
					}}
				>
					<div
						style={{
							"background": "white",
							"border-radius": "8px",
							"min-width": "300px",
							"padding": "2rem",
						}}
					>
						<button data-testid="intercept-dismiss" onClick={() => state.dismiss()} type="button">
							Close
						</button>
						{state.match.render({
							loaderData: state.match.loaderData,
							location: state.backgroundLocation,
						})}
					</div>
				</div>
			)}
		</InterceptOutlet>
	</>
))
