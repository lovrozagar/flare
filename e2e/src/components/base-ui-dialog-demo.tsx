import { Dialog } from "@msviderok/base-ui-solid/dialog"

export function DialogDemo() {
	return (
		<Dialog.Root>
			<Dialog.Trigger
				/* sx on a Base UI component — verifies our sx system composes with headless primitives */
				sx={{ backgroundColor: "rgb(59, 130, 246)", padding: "8px 16px", borderRadius: "6px" }}
				class="bui-trigger-custom"
				data-testid="bui-trigger"
			>
				Open dialog
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Backdrop
					data-testid="bui-backdrop"
					sx={{ background: "rgba(0,0,0,0.5)", position: "fixed", inset: "0" }}
				/>
				<Dialog.Popup
					data-testid="bui-popup"
					sx={{
						background: "white",
						padding: 24,
						borderRadius: 8,
						boxShadow: "0 10px 30px rgba(0,0,0,.2)",
						position: "fixed",
						top: "50%",
						left: "50%",
						transform: "translate(-50%, -50%)",
					}}
				>
					<Dialog.Title class="text-lg font-semibold" data-testid="bui-title">
						Dialog title
					</Dialog.Title>
					<Dialog.Description data-testid="bui-description">
						Testing sx + class integration with Base UI Solid.
					</Dialog.Description>
					<Dialog.Close data-testid="bui-close" type="button">
						Close
					</Dialog.Close>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	)
}

/* Separate Dialog.Root so state is isolated from the main demo */
export function PolyDemo() {
	return (
		<Dialog.Root>
			{/* render fn: merges Base UI's internal props with consumer attrs on an <a> */}
			<Dialog.Trigger
				nativeButton={false}
				data-testid="bui-trigger-link"
				render={(props) => (
					<a {...props} href="#poly" sx={{ textDecoration: "underline" }} data-testid="bui-trigger-link">
						Link trigger
					</a>
				)}
			/>
			<Dialog.Portal>
				<Dialog.Popup
					sx={{ background: "white", padding: 16, position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
					data-testid="bui-poly-popup"
				>
					<Dialog.Close type="button" data-testid="bui-poly-close">
						Close
					</Dialog.Close>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	)
}
