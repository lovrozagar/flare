import { markSafeError } from "@lovrozagar/flare"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { invalid } from "./issues.ts"

// The playground's POST. The validator runs on the server: an empty text is a 400 with `fieldErrors.text`.
export const echo = createServerFn()
	.input({
		parse: (value: { text: string }) => {
			const text = typeof value.text === "string" ? value.text.trim() : ""
			if (text === "") invalid("text", "Type something first")
			return { text }
		},
	})
	.handler(({ input, serverContext }) => ({ text: input.text.toUpperCase(), requestId: serverContext.requestId }))

// Production shows a thrown message only when the app marked it safe (B76).
export const failSafely = createServerFn().handler(() => {
	throw markSafeError(new Error("The playground quota is used up for today"))
})

// A returned redirect resolves the call with the 302 Response itself, here or to another origin (BUGS.md 389).
export const moved = createServerFn()
	.input({ parse: (value: { away: boolean }) => ({ away: value.away === true }) })
	.handler(
		({ input }) =>
			new Response(null, {
				status: 302,
				headers: { location: input.away ? "https://elsewhere.example/moved" : "/docs" },
			}),
	)

export const failLoudly = createServerFn().handler(() => {
	throw new Error("connection string postgres://admin:hunter2@db leaked")
})
