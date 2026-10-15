import { createPage } from "@lovrozagar/flare"
import { createSignal } from "solid-js"
import { echo } from "../../../fns/echo.ts"

// A click calls the server function from an event, the place a client call belongs, and prints its answer.
export const route = createPage("_root_/echo").render(() => {
	const [answer, setAnswer] = createSignal("")
	const call = (): void => void echo({ text: "pong" }).then((text) => setAnswer(text))
	return (
		<>
			<button id="call" type="button" onClick={call}>
				call
			</button>
			<p id="echo">{answer()}</p>
		</>
	)
})
