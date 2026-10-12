// Vite's HMR error payload. Vite opens its overlay from it. Only a dev runtime bug is sent (B76).
export type DevErrorPayload = { type: "error"; err: { message: string; stack: string } };

export function devErrorPayload(error: unknown): DevErrorPayload {
	// A non-Error, or an Error without a stack, has the stack "".
	const thrown = error instanceof Error ? error : undefined;
	return { type: "error", err: { message: thrown?.message ?? String(error), stack: thrown?.stack ?? "" } };
}

// Production passes no send function, so nothing reaches an overlay.
export function reportDevError(error: unknown, send?: (payload: DevErrorPayload) => void): void {
	send?.(devErrorPayload(error));
}
