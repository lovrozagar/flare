import { createPage } from "flare/page"
import { createSignal } from "solid-js"
import { SxDialog } from "../components/sx-custom/dialog"

export const route = createPage("_root_/styling-sx-custom-dialog").render(() => {
	const [open, setOpen] = createSignal(false)

	return (
		<main data-testid="styling-sx-custom-dialog">
			<button
				data-testid="open-dialog"
				onClick={() => setOpen(true)}
				type="button"
			>
				Open Dialog
			</button>
			<SxDialog onClose={() => setOpen(false)} open={open()}>
				<p data-testid="dialog-text">Dialog content with sx styling</p>
				<button
					data-testid="close-dialog"
					onClick={() => setOpen(false)}
					type="button"
				>
					Close
				</button>
			</SxDialog>
		</main>
	)
})
