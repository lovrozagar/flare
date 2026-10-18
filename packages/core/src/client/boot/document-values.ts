import { takeHydrationValue, type HydrationValue } from "@solidjs/web"
import { documentValueKey, failureError, isDeferredFailure } from "../../shared/protocol/deferred-failure.ts"
import type { Pending } from "../navigation/frames.ts"

type Take = (key: string) => HydrationValue | undefined

// Settles each slot the document wrote a value for (server/render/document-values.ts): its value, or its projected
// failure as the error a data answer's `e` frame gives. A slot with no value is a stored page's inline value, already
// settled, or a hole the fill settles (BUGS.md 375).
export function settleDocumentValues(pending: Pending, take: Take = takeHydrationValue): void {
	for (const [id, slot] of pending) {
		const taken = take(documentValueKey(id))
		if (taken === undefined) continue
		if (taken.status === "rejected") slot.reject(taken.error)
		else if (taken.status === "resolved") settle(slot, taken.value)
		else
			taken.promise.then(
				(value) => settle(slot, value),
				(error: unknown) => slot.reject(error),
			)
	}
}

function settle(slot: PromiseWithResolvers<unknown>, value: unknown): void {
	if (isDeferredFailure(value)) slot.reject(failureError(value))
	else slot.resolve(value)
}
