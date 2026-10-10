function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function singularize(s: string): string {
	if (s.endsWith("ies")) return `${s.slice(0, -3)}y`;
	if (s.endsWith("ses") || s.endsWith("xes") || s.endsWith("zes")) return s.slice(0, -2);
	if (s.endsWith("ches") || s.endsWith("shes")) return s.slice(0, -2);
	if (s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
	return s;
}

export function pageTemplate(name: string): string {
	const label = capitalize(name);
	return `import { createPage } from "@lovrozagar/flare"

export const route = createPage("")
\t.render(() => (
\t\t<div>${label}</div>
\t))
`;
}

export function layoutTemplate(_name: string): string {
	return `import { createLayout } from "@lovrozagar/flare"

export const route = createLayout("")
\t.render((ctx) => (
\t\t<>{ctx.children}</>
\t))
`;
}

export interface GeneratedFile {
	content: string;
	customize: Array<{ hint: string; method: string }>;
	path: string;
}

export interface ResourceResult {
	routes: GeneratedFile[];
	serverFn: GeneratedFile | null;
}

export function resourceTemplates(name: string, crud?: boolean): ResourceResult {
	const singular = singularize(name);
	const Name = capitalize(name);
	const Singular = capitalize(singular);

	const routes: GeneratedFile[] = [
		{
			content: `import { createPage } from "@lovrozagar/flare"

export const route = createPage("")
\t.loader(async () => {
\t\t/* TODO: query ${name} list */
\t\treturn { items: [] }
\t})
\t.head(() => ({
\t\ttitle: "${Name}",
\t}))
\t.render((ctx) => (
\t\t<div>
\t\t\t<h1>${Name}</h1>
\t\t</div>
\t))
`,
			customize: [
				{ hint: `query ${name} list`, method: "loader" },
				{ hint: `${name} table/grid UI`, method: "render" },
			],
			path: `${name}.page.tsx`,
		},
		{
			content: `import { createPage } from "@lovrozagar/flare"

export const route = createPage("")
\t.loader(async (ctx) => {
\t\tconst id = ctx.location.params.id
\t\t/* TODO: query single ${singular} by id */
\t\treturn { item: null }
\t})
\t.head(() => ({
\t\ttitle: "${Singular} Detail",
\t}))
\t.render((ctx) => (
\t\t<div>
\t\t\t<h1>${Singular}</h1>
\t\t</div>
\t))
\t.notFoundRender(() => (
\t\t<div>${Singular} not found</div>
\t))
`,
			customize: [
				{ hint: `query single ${singular} by id`, method: "loader" },
				{ hint: `${singular} detail UI`, method: "render" },
			],
			path: `[id]/${singular}-detail.page.tsx`,
		},
	];

	if (crud) {
		routes.push(
			{
				content: `import { createPage } from "@lovrozagar/flare"

export const route = createPage("")
\t.render(() => (
\t\t<div>
\t\t\t<h1>New ${Singular}</h1>
\t\t\t{/* TODO: create form */}
\t\t</div>
\t))
`,
				customize: [{ hint: `${singular} create form`, method: "render" }],
				path: `new/${singular}-new.page.tsx`,
			},
			{
				content: `import { createPage } from "@lovrozagar/flare"

export const route = createPage("")
\t.loader(async (ctx) => {
\t\tconst id = ctx.location.params.id
\t\t/* TODO: query ${singular} for editing */
\t\treturn { item: null }
\t})
\t.render((ctx) => (
\t\t<div>
\t\t\t<h1>Edit ${Singular}</h1>
\t\t\t{/* TODO: edit form */}
\t\t</div>
\t))
`,
				customize: [
					{ hint: `query ${singular} for editing`, method: "loader" },
					{ hint: `${singular} edit form`, method: "render" },
				],
				path: `[id]/edit/${singular}-edit.page.tsx`,
			},
		);
	}

	const serverFn = crud
		? {
				content: serverFnCrudTemplate(name, singular, Singular),
				customize: [
					{ hint: `implement create ${singular}`, method: `create${Singular}` },
					{ hint: `implement update ${singular}`, method: `update${Singular}` },
					{ hint: `implement delete ${singular}`, method: `delete${Singular}` },
				],
				path: `${name}.ts`,
			}
		: null;

	return { routes, serverFn };
}

function serverFnCrudTemplate(name: string, singular: string, Singular: string): string {
	const Name = capitalize(name);
	return `import { createServerFn } from "@lovrozagar/flare/server-fn"

export const get${Name} = createServerFn({ name: "get-${name}" })
\t.handler(async () => {
\t\t/* TODO: query ${name} list */
\t\treturn []
\t})

export const get${Singular} = createServerFn({ name: "get-${singular}" })
\t.handler(async () => {
\t\t/* TODO: query single ${singular} */
\t\treturn null
\t})

export const create${Singular} = createServerFn({ method: "post", name: "create-${singular}" })
\t.handler(async () => {
\t\t/* TODO: create ${singular} */
\t})

export const update${Singular} = createServerFn({ method: "post", name: "update-${singular}" })
\t.handler(async () => {
\t\t/* TODO: update ${singular} */
\t})

export const delete${Singular} = createServerFn({ method: "post", name: "delete-${singular}" })
\t.handler(async () => {
\t\t/* TODO: delete ${singular} */
\t})
`;
}

export function serverFnTemplate(name: string): string {
	return `import { createServerFn } from "@lovrozagar/flare/server-fn"

export const ${name} = createServerFn({ name: "${name}" })
\t.handler(async () => {
\t\t/* TODO: implement */
\t\treturn null
\t})
`;
}
