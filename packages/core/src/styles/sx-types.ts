import type { Properties } from "csstype"

/** Style object accepted by the `sx` prop. Supports flat CSS, `&` selectors, at-rules, and variants. */
export type Sx = Properties<string | number> & {
	[selector: `&${string}`]: Sx
	[atRule: `@${string}`]: Sx
	variants?: Record<string, Record<string, Sx>>
}

/** Accepts strings, falsy values, and nested arrays — mirrors clsx input. */
export type ClassValue = string | false | null | undefined | ClassValue[]
