import { Show } from "solid-js";
import type { JSX } from "solid-js";

interface DialogProps {
	open: boolean;
	onClose: () => void;
	children: JSX.Element;
}

/* Dialog with sx on content and backdrop — no portal in SSR-safe version */
export function SxDialog(props: DialogProps) {
	return (
		<Show when={props.open}>
			<div
				data-testid="sx-dialog-backdrop"
				onClick={() => props.onClose()}
				sx={{
					backgroundColor: "rgba(0, 0, 0, 0.5)",
					bottom: "0",
					left: "0",
					position: "fixed",
					right: "0",
					top: "0",
					zIndex: "100",
				}}
			>
				<div
					data-testid="sx-dialog-content"
					onClick={(e) => e.stopPropagation()}
					sx={{
						backgroundColor: "rgb(255, 255, 255)",
						borderRadius: "8px",
						left: "50%",
						maxWidth: "500px",
						padding: "24px",
						position: "absolute",
						top: "50%",
						transform: "translate(-50%, -50%)",
						width: "90%",
					}}
				>
					{props.children}
				</div>
			</div>
		</Show>
	);
}
