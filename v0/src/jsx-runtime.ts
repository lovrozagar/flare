/**
 * Flare JSX Runtime
 *
 * Re-exports Solid's JSX runtime for JSX transformation.
 * Provides Flare-specific type aliases for component patterns.
 */

import type { JSX } from "solid-js"

export type { Component, JSX, ParentComponent } from "solid-js"
export { Fragment, jsx, jsxDEV, jsxs } from "solid-js/h/jsx-runtime"

/** Any valid JSX content - elements, arrays, primitives, null */
export type FlareNode = JSX.Element

/** Single non-array JSX child */
export type FlareChild = Exclude<JSX.Element, JSX.ArrayElement>

/** Virtual element with type, props, children (for component markers) */
export interface FlareElement {
	children: FlareChild[]
	props: Record<string, unknown>
	type: string
}
