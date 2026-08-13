import * as p from "@clack/prompts"
import type { Command } from "commander"
import { fontAddNonInteractive, formatImportSnippets } from "../font/add"
import { getSubsetsForFont } from "../font/download"
import { getFontInfo } from "../font/info"
import { listAvailableFonts, listInstalledFonts } from "../font/list"
import { getFontRegistry, getFontUrlMap } from "../font/registry"
import { fontRemoveBySlug } from "../font/remove"
import { fuzzyMatch, resolveFonts } from "../font/resolve"
import { readManifest } from "../font/tracking"
import { resolveProject } from "../utils/project"

function collect(value: string, prev: string[]): string[] {
	return [...prev, value]
}

export function registerFont(program: Command): void {
	const font = program.command("font").description("Manage project fonts")

	font
		.command("add")
		.description("Add fonts to your project")
		.option("--name <font>", "Font name or slug (repeatable)", collect, [])
		.option("--subsets <list>", "Comma-separated subset filter")
		.option("--force", "Re-download existing files")
		.action(async (opts: { force?: boolean; name: string[]; subsets?: string }) => {
			const project = resolveProject()
			const registry = getFontRegistry()
			const urlMap = getFontUrlMap()
			const subsets = opts.subsets?.split(",").map((s) => s.trim()) ?? undefined

			if (opts.name.length > 0) {
				await handleAddNonInteractive(
					project.root,
					registry,
					urlMap,
					opts.name,
					subsets,
					opts.force,
				)
			} else {
				await handleAddInteractive(project.root, registry, urlMap, opts.force)
			}
		})

	font
		.command("remove")
		.description("Remove fonts from your project")
		.option("--name <font>", "Font name or slug (repeatable)", collect, [])
		.action(async (opts: { name: string[] }) => {
			const project = resolveProject()

			if (opts.name.length > 0) {
				handleRemoveNonInteractive(project.root, opts.name)
			} else {
				await handleRemoveInteractive(project.root)
			}
		})

	font
		.command("list")
		.description("List installed and available fonts")
		.option("--all", "Show all available fonts")
		.option("--category <cat>", "Filter by category")
		.action((opts: { all?: boolean; category?: string }) => {
			const project = resolveProject()
			const registry = getFontRegistry()

			if (opts.all || opts.category) {
				const fonts = listAvailableFonts(registry, opts.category)
				if (fonts.length === 0) {
					p.log.warn("No fonts found for that category.")
					return
				}
				p.log.info(`Available fonts (${fonts.length}):`)
				for (const f of fonts) {
					p.log.message(`  ${f.family.padEnd(28)} ${f.category}`)
				}
			} else {
				const installed = listInstalledFonts(project.root)
				if (installed.length === 0) {
					p.log.info("No fonts installed. Run `flare font add` to get started.")
					return
				}
				p.log.info(`Installed fonts (${installed.length}):`)
				for (const f of installed) {
					p.log.message(`  ${f.family.padEnd(28)} ${f.subsets.length} subsets`)
				}
			}
		})

	font
		.command("info <name>")
		.description("Show font details")
		.action((name: string) => {
			const project = resolveProject()
			const registry = getFontRegistry()
			const urlMap = getFontUrlMap()

			const info = getFontInfo(name, registry, urlMap, project.root)
			if (!info) {
				p.log.error(`Font "${name}" not found.`)
				const suggestions = fuzzyMatch(name, registry, 5)
				if (suggestions.length > 0) {
					p.log.info("Did you mean?")
					for (const s of suggestions) {
						p.log.message(`  ${s.family.padEnd(28)} ${s.category}`)
					}
				}
				process.exit(1)
			}

			p.log.info(info.family)
			p.log.message(`  Category:     ${info.category}`)
			p.log.message(`  Subsets:      ${info.availableSubsets.join(", ")}`)
			p.log.message(`  Files:        ${info.totalFiles}`)
			p.log.message(`  Installed:    ${info.installed ? "yes" : "no"}`)
			if (info.installed) {
				p.log.message(`  Subsets:      ${info.installedSubsets.join(", ")}`)
			}
			p.log.message(`  Import:       ${info.importSnippet}`)
		})
}

async function handleAddNonInteractive(
	projectRoot: string,
	registry: ReturnType<typeof getFontRegistry>,
	urlMap: Record<string, string>,
	names: string[],
	subsets: string[] | undefined,
	force?: boolean,
): Promise<void> {
	const spinner = p.spinner()
	spinner.start("Resolving fonts...")

	const result = await fontAddNonInteractive({
		force,
		names,
		onProgress(completed, total) {
			spinner.message(`Downloading... ${completed}/${total}`)
		},
		projectRoot,
		registry,
		subsets,
		urlMap,
	})

	if (result.unresolved.length > 0) {
		spinner.stop("Some fonts could not be resolved.")
		for (const name of result.unresolved) {
			p.log.error(`"${name}" not found.`)
			const suggestions = fuzzyMatch(name, registry, 3)
			if (suggestions.length > 0) {
				p.log.info("Did you mean?")
				for (const s of suggestions) {
					p.log.message(`  ${s.family.padEnd(28)} ${s.category}`)
				}
			}
		}
	}

	if (result.added.length > 0) {
		if (result.unresolved.length === 0) {
			spinner.stop(
				`Added ${result.added.length} font(s) (${result.downloadResult.downloaded} files)`,
			)
		}
		p.log.info("")
		for (const snippet of formatImportSnippets(result.added)) {
			p.log.message(`  ${snippet}`)
		}
	}

	if (result.downloadResult.failed > 0) {
		p.log.warn(`${result.downloadResult.failed} file(s) failed. Re-run with --force to retry.`)
	}
}

async function handleAddInteractive(
	projectRoot: string,
	registry: ReturnType<typeof getFontRegistry>,
	urlMap: Record<string, string>,
	force?: boolean,
): Promise<void> {
	p.intro("flare font add")

	const manifest = readManifest(projectRoot)
	const installedSlugs = new Set(Object.keys(manifest.fonts))

	const selected = await p.autocompleteMultiselect({
		filter(search, option) {
			const lower = search.toLowerCase()
			return (
				(option.label?.toLowerCase().includes(lower) ?? false) ||
				(option.hint?.toLowerCase().includes(lower) ?? false)
			)
		},
		message: "Select fonts (type to filter, space to toggle)",
		options: registry.map(([family, slug, , category]) => ({
			hint: installedSlugs.has(slug) ? `${category} [installed]` : category,
			label: family,
			value: slug,
		})),
	})

	if (p.isCancel(selected) || selected.length === 0) {
		p.log.info("No fonts selected.")
		p.outro("")
		return
	}

	/* subset selection */
	const subsetChoice = await p.select({
		message: "Which subsets to download?",
		options: [
			{ label: "All available subsets", value: "all" as const },
			{ label: "Latin only (smallest)", value: "latin" as const },
			{ label: "Choose subsets...", value: "custom" as const },
		],
	})

	if (p.isCancel(subsetChoice)) {
		p.outro("Cancelled.")
		return
	}

	let subsets: string[] | undefined

	if (subsetChoice === "latin") {
		subsets = ["latin"]
	} else if (subsetChoice === "custom") {
		/* collect unique subsets across all selected fonts */
		const allSubsets = new Set<string>()
		for (const slug of selected) {
			for (const s of getSubsetsForFont(slug as string, urlMap)) {
				allSubsets.add(s)
			}
		}

		const chosen = await p.multiselect({
			initialValues: ["latin"],
			message: "Select subsets",
			options: [...allSubsets].sort().map((s) => ({ label: s, value: s })),
		})

		if (p.isCancel(chosen)) {
			p.outro("Cancelled.")
			return
		}
		subsets = chosen as string[]
	}

	const spinner = p.spinner()
	spinner.start("Downloading fonts...")

	const result = await fontAddNonInteractive({
		force,
		names: selected as string[],
		onProgress(completed, total) {
			spinner.message(`Downloading... ${completed}/${total}`)
		},
		projectRoot,
		registry,
		subsets,
		urlMap,
	})

	spinner.stop(`Added ${result.added.length} font(s) (${result.downloadResult.downloaded} files)`)

	if (result.added.length > 0) {
		p.log.info("")
		for (const snippet of formatImportSnippets(result.added)) {
			p.log.message(`  ${snippet}`)
		}
	}

	if (result.downloadResult.failed > 0) {
		p.log.warn(`${result.downloadResult.failed} file(s) failed. Re-run with --force to retry.`)
	}

	p.outro("")
}

function handleRemoveNonInteractive(projectRoot: string, names: string[]): void {
	const registry = getFontRegistry()
	const { resolved, unresolved } = resolveFonts(names, registry)

	for (const name of unresolved) {
		p.log.error(`"${name}" not found.`)
	}

	for (const font of resolved) {
		fontRemoveBySlug(projectRoot, font.slug)
		p.log.info(`Removed ${font.family}`)
	}
}

async function handleRemoveInteractive(projectRoot: string): Promise<void> {
	p.intro("flare font remove")

	const installed = listInstalledFonts(projectRoot)
	if (installed.length === 0) {
		p.log.info("No fonts installed.")
		p.outro("")
		return
	}

	const selected = await p.multiselect({
		message: "Select fonts to remove",
		options: installed.map((f) => ({
			hint: `${f.subsets.length} subsets`,
			label: f.family,
			value: f.slug,
		})),
	})

	if (p.isCancel(selected) || selected.length === 0) {
		p.outro("Cancelled.")
		return
	}

	const confirmed = await p.confirm({
		message: `Remove ${selected.length} font(s)?`,
	})

	if (p.isCancel(confirmed) || !confirmed) {
		p.outro("Cancelled.")
		return
	}

	for (const slug of selected) {
		fontRemoveBySlug(projectRoot, slug as string)
		p.log.info(`Removed ${slug}`)
	}

	p.outro(`Removed ${selected.length} font(s).`)
}
