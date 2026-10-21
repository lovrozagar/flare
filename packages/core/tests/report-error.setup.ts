import { afterEach } from "vitest"

// The unit-dom project's setup file: a browser's `reportError`, which jsdom lacks. A browser hands the error to the
// window as a cancelable `error` event, and Solid's dev build reports a render's uncaught throw there as it rethrows it
// (solid #3338). Without this, Node leaves the global undefined, and Bun keeps its own, which raises the error as the
// test process's uncaught exception: the same render would reach a different place on each runtime.
//
// A browser surfaces an error event no listener prevented, so one fails the test that raised it: only a case that
// expects the throw, listening and calling `preventDefault`, passes with it. With no `error` listener at all, vitest's
// jsdom environment already raises the event's error as an unhandled one and fails the run; once a test listens, it
// steps aside, and the afterEach below fails the test for any report its listeners left unprevented.

const unhandled: unknown[] = []

export function reportError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error)
	const event = new ErrorEvent("error", { error, message, cancelable: true })
	window.dispatchEvent(event)
	if (!event.defaultPrevented) unhandled.push(error)
}

// Throws the errors reported and not prevented since the last call, the one alone or all of them together.
export function failOnUnhandled(): void {
	const errors = unhandled.splice(0)
	if (errors.length === 1) throw errors[0]
	if (errors.length > 1) throw new AggregateError(errors, `${errors.length} errors reached reportError unhandled`)
}

globalThis.reportError = reportError
afterEach(failOnUnhandled)
