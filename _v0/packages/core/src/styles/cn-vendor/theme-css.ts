/**
 * MIT License
 *
 * Copyright (c) 2026 shadcn
 *
 * Vendored from https://github.com/shadcn-ui/cn
 * tag cn@0.4.0
 * commit 84db83298f69a229d6f1ffc5d8c8d99ef451fb49
 * Source: packages/cn/src/theme-css.ts
 */

// Reads the theme scales Tailwind v4 stylesheets declare, so `cn build`
// can register them without a hand-written config. Only `@theme` blocks
// are read: `--radius-card` adds `card` to the radius scale, and
// `--radius-*: initial` replaces the default scale with the declared names,
// the way Tailwind does. Relative `@import`s are followed; packages are not.
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { ConfigExtension } from "./compiler.ts"

// Tailwind namespace → cn theme scale. Longest first, so `--text-shadow-x`
// is a text shadow and `--font-weight-x` a weight. `--color-*` and
// `--font-*` are left out: cn already accepts any name on those scales.
const NAMESPACES: [string, string][] = [
  ["inset-shadow", "inset-shadow"],
  ["drop-shadow", "drop-shadow"],
  ["text-shadow", "text-shadow"],
  ["font-weight", "font-weight"],
  ["perspective", "perspective"],
  ["breakpoint", "breakpoint"],
  ["container", "container"],
  ["tracking", "tracking"],
  ["spacing", "spacing"],
  ["leading", "leading"],
  ["animate", "animate"],
  ["radius", "radius"],
  ["shadow", "shadow"],
  ["aspect", "aspect"],
  ["blur", "blur"],
  ["ease", "ease"],
  ["text", "text"],
]

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")

// Bodies of every `@theme` block, at any nesting depth.
const themeBlocks = (css: string) => {
  const bodies: string[] = []
  const re = /@theme\b[^{;]*\{/g
  while (re.exec(css)) {
    let depth = 1
    let i = re.lastIndex
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++
      else if (css[i] === "}") depth--
    }
    bodies.push(css.slice(re.lastIndex, i - 1))
    re.lastIndex = i
  }
  return bodies
}

/** Whether a stylesheet is a Tailwind entry or declares theme values. */
export const isTailwindCss = (css: string) =>
  /@theme\b/.test(css) || /@import\s+(?:url\(\s*)?["']tailwindcss/.test(css)

// Flare patch: return every specifier; `themeFromCss` decides how each resolves.
const importPaths = (css: string) => {
  const paths: string[] = []
  const re = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g
  let match
  while ((match = re.exec(css))) paths.push(match[1]!)
  return paths
}

// Flare patch: per-utility color namespaces (`--text-color-muted`) are
// colors, which cn already accepts by any name; they must not land on the
// font-size (`text`) or other scales.
const COLOR_NAMESPACES = [
  "background-color",
  "text-color",
  "border-color",
  "ring-color",
  "ring-offset-color",
  "outline-color",
  "decoration-color",
  "divide-color",
  "placeholder-color",
  "caret-color",
  "accent-color",
  "shadow-color",
  "inset-shadow-color",
  "fill",
  "stroke",
]

/** Resolves a bare `@import` specifier (a package) to a file, from the importing file's directory. */
export type BareImportResolver = (specifier: string, fromDir: string) => string

/**
 * The theme scales declared in stylesheets and the files they import, as a
 * config extension: declared names under `extend`, and scales reset with
 * `--<namespace>-*: initial` under `override`. Also returns every file read,
 * so a watcher can rebuild when one changes.
 *
 * Flare patch: bare (package) imports are followed through `resolveBare`;
 * `tailwindcss` itself is skipped because its defaults are already the base config.
 */
export const themeFromCss = (entries: readonly string[], resolveBare?: BareImportResolver) => {
  const files: string[] = []
  let entry = ""
  const names = new Map<string, Set<string>>()
  const reset = new Set<string>()
  const visit = (path: string) => {
    if (files.includes(path)) return
    files.push(path)
    let css
    try {
      css = stripComments(readFileSync(path, "utf8"))
    } catch (err) {
      throw new Error(
        `cannot read css ${path === entry ? path : `${path} (imported from ${entry})`}: ${(err as Error).message}`,
        { cause: err }
      )
    }
    for (const spec of importPaths(css)) {
      if (spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/")) {
        visit(resolve(dirname(path), spec))
      } else if (resolveBare && spec !== "tailwindcss" && !spec.startsWith("tailwindcss/")) {
        visit(resolveBare(spec, dirname(path)))
      }
    }
    for (const body of themeBlocks(css)) {
      for (const decl of body.split(";")) {
        const colon = decl.indexOf(":")
        if (colon === -1) continue
        const prop = decl.slice(0, colon).trim()
        const value = decl.slice(colon + 1).trim()
        if (!prop.startsWith("--")) continue
        if (prop === "--*" && value === "initial") {
          for (const [, scale] of NAMESPACES) reset.add(scale)
          continue
        }
        if (COLOR_NAMESPACES.some((ns) => prop.startsWith(`--${ns}-`))) continue
        const entry = NAMESPACES.find(([ns]) => prop.startsWith(`--${ns}-`))
        if (!entry) continue
        const [ns, scale] = entry
        const name = prop.slice(ns.length + 3)
        if (name === "*") {
          if (value === "initial") reset.add(scale)
          continue
        }
        // `--text-display--line-height` is a sub-property of `display`.
        if (!name || name.includes("--")) continue
        if (value === "initial") {
          names.get(scale)?.delete(name)
          continue
        }
        let set = names.get(scale)
        if (!set) names.set(scale, (set = new Set()))
        set.add(name)
      }
    }
  }
  for (const file of entries) {
    entry = resolve(file)
    visit(entry)
  }

  const extend: Record<string, string[]> = {}
  const override: Record<string, string[]> = {}
  for (const [scale, set] of names) {
    if (!reset.has(scale)) extend[scale] = [...set]
  }
  for (const scale of reset) override[scale] = [...(names.get(scale) ?? [])]
  const extension: ConfigExtension = {}
  if (Object.keys(extend).length) extension.extend = { theme: extend }
  if (Object.keys(override).length) extension.override = { theme: override }
  return { extension, files }
}
