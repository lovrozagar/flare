import { createServerFn } from "@lovrozagar/flare/server-fn";

// A schema whose input and output are both `{ q: string }`. The validator runs on the server.
const query = { q: "" };

export const echo = createServerFn()
	.input({
		"~standard": {
			validate: (value: unknown) => ({ value: { q: String(Reflect.get(Object(value), "q")) } }),
			types: { input: query, output: query },
		},
	})
	.handler(async ({ input }) => ({ q: input.q, secret: "s" }));

// A transforming validator: the caller passes a string, and the handler reads a number.
export const measure = createServerFn()
	.input({ parse: (value: string) => value.length })
	.handler(({ input }) => input * 2);

export const ticks = createServerFn().stream(async function* ({ signal }) {
	yield { n: signal.aborted ? 0 : 1 };
	return "done";
});
