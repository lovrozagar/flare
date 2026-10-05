import { STORAGE_CHUNK_RELOAD } from "../protocol.ts";
import { navigateDocument } from "./document.ts";

const RELOAD_GUARD_MS = 10_000;

/**
 * Full document load of `href` as recovery (build skew, missing chunk). Refuses the same URL
 * twice within 10s so a target that keeps failing surfaces its error instead of looping;
 * different URLs are ordinary navigations and always go through.
 * Without sessionStorage there is no durable guard, so only `allowWithoutGuard` callers proceed.
 */
export function recoverWithDocumentLoad(href: string, allowWithoutGuard: boolean): boolean {
	try {
		const raw = sessionStorage.getItem(STORAGE_CHUNK_RELOAD);
		const last = raw ? (JSON.parse(raw) as { at?: number; href?: string }) : undefined;
		if (last?.href === href && Date.now() - (last.at ?? 0) < RELOAD_GUARD_MS) return false;
		sessionStorage.setItem(STORAGE_CHUNK_RELOAD, JSON.stringify({ at: Date.now(), href }));
	} catch {
		if (!allowWithoutGuard) return false;
	}
	navigateDocument(href);
	return true;
}
