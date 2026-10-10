import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/head-scripts")
	.head(() => ({
		custom: {
			scripts: [
				{
					children: 'window.__HEAD_SCRIPT_RAN__ = true; var x = "</script><script>alert(1)</script>"',
				},
				{ src: "https://cdn.example.com/lib.js?v=1&t=2" },
			],
			styles: [
				{
					children: 'body::after { content: "</style><script>alert(2)</script>"; display: none; }',
				},
			],
		},
		description: "Head scripts test page",
		title: "Head Scripts",
	}))
	.render(() => (
		<div data-testid="head-scripts-page">
			<h1>Head Scripts</h1>
			<p>This page tests custom head script/style escaping.</p>
		</div>
	));
