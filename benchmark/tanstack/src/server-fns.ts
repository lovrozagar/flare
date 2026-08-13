import { createServerFn } from "@tanstack/react-start"
import { getDelayedComments } from "../../shared/data"

/**
 * Server function that fetches comments.
 * In a real app, this would query a database — the kind of operation
 * that can't run client-side and needs createServerFn().
 */
export const fetchComments = createServerFn({ method: "GET" })
	.inputValidator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return getDelayedComments(slug)
	})
