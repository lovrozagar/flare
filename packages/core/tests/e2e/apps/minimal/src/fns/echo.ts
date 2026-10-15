import { createServerFn } from "@lovrozagar/flare/server-fn"

// The app's one server function: it answers the text it was sent. The validator runs on the server.
export const echo = createServerFn()
	.input({ parse: (value: { text: string }) => ({ text: String(value.text) }) })
	.handler(({ input }) => input.text)
