import { vi } from "vitest"

// Every write into a stream's controller that throws while `run` runs: a pull that enqueues, closes, or errors a stream
// the consumer already cancelled (BUGS.md 304).
export async function invalidWrites(run: () => Promise<void>): Promise<string[]> {
	const proto = ReadableStreamDefaultController.prototype
	const thrown: string[] = []
	const watch = (name: "enqueue" | "close" | "error") => {
		const original = proto[name]
		return vi.spyOn(proto, name).mockImplementation(function (
			this: ReadableStreamDefaultController,
			...args: unknown[]
		) {
			try {
				return Reflect.apply(original, this, args)
			} catch (error) {
				thrown.push(`${name}: ${String(error)}`)
				throw error
			}
		})
	}
	const spies = [watch("enqueue"), watch("close"), watch("error")]
	try {
		await run()
		await new Promise((resolve) => setTimeout(resolve, 0))
	} finally {
		for (const spy of spies) spy.mockRestore()
	}
	return thrown
}
