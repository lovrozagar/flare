export type RequestBody = {
	resume: () => void;
	on: (event: "end", listener: () => void) => void;
};

export function settleRequestBody(req: RequestBody, read: boolean): Promise<void> {
	if (read) return Promise.resolve();
	return new Promise((resolve) => {
		req.on("end", () => resolve());
		req.resume();
	});
}
