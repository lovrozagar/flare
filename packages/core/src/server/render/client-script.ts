import { entryImport } from "../../shared/protocol/entry-import.ts"
import { escapeAttr, escapeInlineScript } from "./escape.ts"

// The document's client script: an inline module that imports the client entry with its failure handler
// (shared/protocol/entry-import.ts, BUGS.md 352).
export function clientScript(client: string | undefined, nonce: string): string {
	if (client === undefined) return ""
	return `<script type="module" async${nonceAttr(nonce)}>${escapeInlineScript(entryImport(client))}</script>`
}

function nonceAttr(nonce: string): string {
	return nonce === "" ? "" : ` nonce="${escapeAttr(nonce)}"`
}
