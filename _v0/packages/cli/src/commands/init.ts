import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import type { Command } from "commander";
import { DEFAULT_OPTIONS, generateInitFiles, type InitOptions } from "../init/templates";

function getPreset(template: string): Partial<InitOptions> {
	switch (template) {
		case "saas":
			return {
				auth: "cookie",
				cache: "isr",
				features: ["keepalive", "viewTransitions"],
				style: "tailwind",
				type: "saas",
			};
		case "blog":
			return {
				auth: "none",
				cache: "isr",
				features: ["viewTransitions"],
				style: "tailwind",
				type: "blog",
			};
		case "marketing":
			return {
				auth: "none",
				cache: "ssg",
				features: ["viewTransitions"],
				style: "tailwind",
				type: "marketing",
			};
		default:
			return {};
	}
}

function buildOptsFromFlags(
	appName: string,
	opts: {
		auth?: string;
		cache?: string;
		keepalive?: boolean;
		locale?: string;
		style?: string;
		template?: string;
		type?: string;
		viewTransitions?: boolean;
	},
): InitOptions {
	const preset = opts.template ? getPreset(opts.template) : {};

	const features: string[] = [];
	if (opts.keepalive !== false) features.push("keepalive");
	if (opts.viewTransitions !== false) features.push("viewTransitions");

	return {
		...DEFAULT_OPTIONS,
		...preset,
		auth: (opts.auth ?? preset.auth ?? DEFAULT_OPTIONS.auth) as InitOptions["auth"],
		cache: (opts.cache ?? preset.cache ?? DEFAULT_OPTIONS.cache) as InitOptions["cache"],
		features: features.length > 0 ? features : (preset.features ?? DEFAULT_OPTIONS.features),
		locale: opts.locale
			? opts.locale
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: (preset.locale ?? []),
		name: appName,
		style: (opts.style ?? preset.style ?? DEFAULT_OPTIONS.style) as InitOptions["style"],
		type: (opts.type ?? preset.type ?? DEFAULT_OPTIONS.type) as InitOptions["type"],
	};
}

function cancelled(): never {
	p.cancel("Setup cancelled.");
	process.exit(0);
}

async function runInteractive(appName: string): Promise<InitOptions> {
	p.intro("flare init");

	const appType = await p.select({
		message: "What are you building?",
		options: [
			{ hint: "auth, dashboard, CRUD resources", label: "SaaS app", value: "saas" as const },
			{ hint: "ISR, content pages, no auth", label: "Blog / content site", value: "blog" as const },
			{ hint: "SSG, landing pages, fast", label: "Marketing site", value: "marketing" as const },
			{ hint: "response routes, no UI", label: "API-only", value: "api" as const },
			{ hint: "configure everything", label: "Custom", value: "custom" as const },
		],
	});
	if (p.isCancel(appType)) cancelled();

	const name = await p.text({
		defaultValue: appName,
		message: "App name",
		placeholder: appName,
	});
	if (p.isCancel(name)) cancelled();

	const localeInput = await p.text({
		defaultValue: "",
		message: "Locales? (comma-separated, e.g. en,hr,fr — leave empty for none)",
		placeholder: "en",
	});
	if (p.isCancel(localeInput)) cancelled();
	const locale = localeInput
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	const auth = await p.select({
		message: "Authentication?",
		options: [
			{ label: "Yes — cookie-based sessions", value: "cookie" as const },
			{ label: "Yes — JWT", value: "jwt" as const },
			{ label: "No", value: "none" as const },
		],
	});
	if (p.isCancel(auth)) cancelled();

	const cache = await p.select({
		message: "Caching strategy?",
		options: [
			{
				hint: "recommended for most apps",
				label: "ISR (incremental static regeneration)",
				value: "isr" as const,
			},
			{
				hint: "static, rebuild on change",
				label: "SSG (static site generation)",
				value: "ssg" as const,
			},
			{ hint: "no cache", label: "SSR only", value: "ssr" as const },
			{ hint: "configure per route", label: "Mixed", value: "mixed" as const },
		],
	});
	if (p.isCancel(cache)) cancelled();

	const style = await p.select({
		message: "Styling?",
		options: [
			{ label: "Tailwind CSS", value: "tailwind" as const },
			{ label: "CSS modules", value: "css-modules" as const },
			{ label: "None", value: "none" as const },
		],
	});
	if (p.isCancel(style)) cancelled();

	const features = await p.multiselect({
		initialValues: ["keepalive", "viewTransitions"],
		message: "Features",
		options: [
			{ hint: "layout persistence across navigations", label: "Keepalive", value: "keepalive" },
			{ hint: "smooth page transitions", label: "View transitions", value: "viewTransitions" },
			{
				hint: "restore scroll on back/forward",
				label: "Scroll restoration",
				value: "scrollRestoration",
			},
			{ hint: "dark/light mode", label: "Theme", value: "theme" },
			{ hint: "RTL support", label: "Direction", value: "direction" },
		],
	});
	if (p.isCancel(features)) cancelled();

	return {
		auth,
		cache,
		features,
		locale,
		name: name || appName,
		style,
		type: appType,
	};
}

function writeProject(appName: string, initOpts: InitOptions, json: boolean): void {
	const targetDir = resolve(appName);

	if (existsSync(targetDir)) {
		try {
			const entries = readdirSync(targetDir);
			if (entries.length > 0) {
				process.stderr.write(`error: directory "${appName}" is not empty\n`);
				process.exit(1);
			}
		} catch {
			process.stderr.write(`error: cannot read directory "${appName}"\n`);
			process.exit(1);
		}
	}

	const files = generateInitFiles(initOpts);

	for (const file of files) {
		const fullPath = join(targetDir, file.path);
		mkdirSync(dirname(fullPath), { recursive: true });
		if (file.binary) {
			writeFileSync(fullPath, file.binary);
		} else {
			writeFileSync(fullPath, file.content, "utf-8");
		}
	}

	if (json) {
		process.stdout.write(
			`${JSON.stringify(
				{
					generated: files.map((f) => f.path),
					name: appName,
					next: [`cd ${appName}`, "bun install", "bun dev"],
				},
				null,
				2,
			)}\n`,
		);
		return;
	}

	p.outro(`created ${appName}/`);

	process.stdout.write("\n");
	for (const file of files) {
		process.stdout.write(`  ${file.path}\n`);
	}
	process.stdout.write("\nnext:\n");
	process.stdout.write(`  cd ${appName}\n`);
	process.stdout.write("  bun install\n");
	process.stdout.write("  bun dev\n\n");
}

export function registerInit(program: Command): void {
	program
		.command("init [name]")
		.description("Create a new Flare project")
		.option("--type <type>", "App type: saas, blog, marketing, api, custom")
		.option("--template <template>", "Preset template: saas, blog, marketing")
		.option("--locale <locales>", "Comma-separated locales (e.g. en,hr,fr)")
		.option("--auth <auth>", "Auth type: cookie, jwt, none")
		.option("--cache <cache>", "Cache strategy: isr, ssg, ssr, mixed")
		.option("--style <style>", "Styling: tailwind, css-modules, none")
		.option("--no-keepalive", "Disable keepalive middleware")
		.option("--no-view-transitions", "Disable view transitions")
		.option("--json", "Output structured result")
		.action(
			async (
				name: string | undefined,
				opts: {
					auth?: string;
					cache?: string;
					json?: boolean;
					keepalive?: boolean;
					locale?: string;
					style?: string;
					template?: string;
					type?: string;
					viewTransitions?: boolean;
				},
			) => {
				const appName = name ?? "my-app";

				/* Non-interactive mode: --template or explicit flags skip prompts */
				const hasExplicitFlags =
					opts.template !== undefined ||
					opts.type !== undefined ||
					opts.auth !== undefined ||
					opts.cache !== undefined ||
					opts.style !== undefined ||
					opts.locale !== undefined;

				let initOpts: InitOptions;

				if (hasExplicitFlags) {
					initOpts = buildOptsFromFlags(appName, opts);
				} else {
					initOpts = await runInteractive(appName);
				}

				writeProject(initOpts.name, initOpts, opts.json ?? false);
			},
		);
}
