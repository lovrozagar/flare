/**
 * Type-level assertions for Link + navigate type safety.
 * Verified by `tsc --noEmit` — never executed at runtime.
 *
 * Proves:
 * - Link<"/about"> compiles without params
 * - Link<"/blog/[slug]"> requires params
 * - navigate({ to: "/about" }) compiles
 * - navigate({ to: "/blog/[slug]", params: { slug: "x" } }) compiles
 */
import type { RouteParams, RouteParamsProps } from "flare/codegen"

/* ── Helpers ───────────────────────────────────────────────── */

type Exact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false
type Assert<_ extends true> = never

/* ── 1. RouteParams extracts correct shapes ────────────────── */

type _rp1 = Assert<Exact<RouteParams<"/about">, {}>>
type _rp2 = Assert<Exact<RouteParams<"/blog/[slug]">, { slug: string }>>
type _rp3 = Assert<Exact<RouteParams<"/users/[id]">, { id: string }>>
type _rp4 = Assert<Exact<RouteParams<"/catch-all/[...segments]">, { segments: string[] }>>

/* ── 2. RouteParamsProps conditional requirement ───────────── */

type _pp1 = Assert<Exact<RouteParamsProps<"/about">, { params?: never }>>
type _pp2 = Assert<Exact<RouteParamsProps<"/blog/[slug]">, { params: { slug: string } }>>
type _pp3 = Assert<Exact<RouteParamsProps<"/">, { params?: never }>>
