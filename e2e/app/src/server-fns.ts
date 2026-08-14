import { ServerFnValidationError } from "flare/errors"
import { createServerFn } from "flare/server-fn"
import * as z from "zod"

export const echoFn = createServerFn({ method: "post", name: "echo" })
	.input<{ message: string }>((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.message !== "string") throw new Error("message is required")
		return { message: obj.message }
	})
	.handler(({ input }) => ({ echo: input.message }))

export const getGreetingFn = createServerFn({ method: "get", name: "get-greeting" })
	.input<{ name: string }>((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.name !== "string") throw new Error("name is required")
		return { name: obj.name }
	})
	.handler(({ input }) => ({ greeting: `Hello, ${input.name}!` }))

export const authGatedFn = createServerFn({ method: "post", name: "auth-gated" })
	.authenticate()
	.handler(({ auth }) => {
		const a = auth as Record<string, unknown>
		return { secret: "classified", userId: a.userId }
	})

export const errorFn = createServerFn({ method: "post", name: "error-fn" }).handler(() => {
	throw new Error("Handler exploded")
})

export const piggybackFn = createServerFn({ method: "post", name: "piggyback" })
	.input<{ value: string }>((raw) => {
		const obj = raw as Record<string, unknown>
		if (typeof obj.value !== "string") throw new Error("value is required")
		return { value: obj.value }
	})
	.handler(({ input, piggyback }) => {
		piggyback(["demo-items"], [{ id: 1, name: input.value }])
		piggyback(["demo-count"], 1)
		return { saved: true, value: input.value }
	})

export const revalidateCacheFn = createServerFn({
	method: "post",
	name: "revalidate-cache",
}).handler(async (ctx) => {
	await ctx.revalidate({ tags: ["kv-test"], tiers: ["ssr"] })
	return { revalidated: true }
})

export const formUploadFn = createServerFn({ method: "post", name: "form-upload" })
	.input((raw) => {
		const obj = raw as Record<string, unknown>
		if (!(obj.avatar instanceof File) || (obj.avatar as File).size === 0) {
			throw new ServerFnValidationError({
				fieldErrors: { avatar: ["File is required"] },
				formErrors: [],
			})
		}
		return { avatar: obj.avatar as File }
	})
	.handler(({ input }) => ({ filename: input.avatar.name, size: input.avatar.size }))

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const slowStreamFn = createServerFn({ method: "post", name: "slow-stream" }).stream(
	async function* () {
		for (let i = 1; i <= 5; i++) {
			await delay(40)
			yield { chunk: i }
		}
	},
)

export const formContactFn = createServerFn({ method: "post", name: "form-contact" })
	.input(
		z
			.object({
				email: z.string().min(1, "Required").email("Invalid email"),
				message: z.string().min(1, "Required"),
			})
			.refine((data) => data.message !== "FORM_ERROR", {
				message: "Form-level validation failed",
			}),
	)
	.handler(async ({ input }) => {
		if (input.email === "taken@test.com") {
			throw new ServerFnValidationError({
				fieldErrors: { email: ["Email already registered"] },
				formErrors: [],
			})
		}
		await new Promise((r) => setTimeout(r, 30))
		return { sent: true }
	})
