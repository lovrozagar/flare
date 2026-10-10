import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/xss")
	.loader(() => ({
		htmlContent: "<script>alert('xss')</script>",
		jsonContent: '</script><script>alert("xss")</script>',
		specialChars: "< > & \" ' / \\",
	}))
	.head(() => ({
		description: '<script>alert("xss")</script>',
		title: "XSS Test",
	}))
	.render((props) => (
		<main data-testid="xss-test-page">
			<h1>XSS Test</h1>
			<p data-testid="xss-html">{props.loaderData.htmlContent}</p>
			<p data-testid="xss-json">{props.loaderData.jsonContent}</p>
			<p data-testid="xss-special">{props.loaderData.specialChars}</p>
		</main>
	));
