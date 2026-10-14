import { TAB_HEADER } from "./constants.ts";

// Dev tab tokens (B42): random UUIDs, so a header value outside this shape is never one and is never written.
const TOKEN = /^[A-Za-z0-9-]{1,64}$/;

// A fresh token for a document a dev server serves.
export function mintTab(): string {
	return crypto.randomUUID();
}

export function isTabToken(value: string): boolean {
	return TOKEN.test(value);
}

// The tag a dev document carries, so the tab announces its token and its requests name it. Written at the response
// boundary, after the app answered, so no store ever keeps it.
export function tabMeta(token: string): string {
	return `<meta name="${TAB_HEADER}" content="${token}">`;
}
