export type RequestBody = {
	resume: () => void
	on: (event: "end", listener: () => void) => void
}

export function settleRequestBody(req: RequestBody): Promise<void> {
	return new Promise((resolve) => {
		req.on("end", () => resolve())
		req.resume()
	})
}
