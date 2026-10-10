import { createPage } from "@lovrozagar/flare/page";
import { translations } from "@/i18n/translations";

export const route = createPage("[[locale]]/_root_/(main)/about")
	// .input(({}) => ({
	// 	params: ({}) =>
	// }))
	.loader(async (ctx) => {
		const t = await translations.load(ctx.locale(), ["common"]);
		return { t };
	})
	.head((ctx) => ({
		title: ctx.loaderData.t.common["about.title"],
	}))
	.render((props) => {
		const t = props.router.useLoaderT({ from: "[[locale]]/_root_/(main)/about" });
		props.router.buildUrl({ params: { locale: "en" }, to: "/[[locale]]" });
		props.router.buildLocation({ params: { locale: "en" }, to: "/[[locale]]" });

		return (
			<main>
				{/* Third-party widgets inject their sheet from script, without a nonce. */}
				<p
					data-testid="csp-style-probe"
					ref={() => {
						const link = document.createElement("link");
						link.rel = "stylesheet";
						link.href = "data:text/css,[data-testid=csp-style-probe]{outline:3px solid rgb(1, 2, 3)}";
						document.head.append(link);
					}}
				>
					CSP probe
				</p>
				<h1 data-testid="about-title">{t("common.about.title")}</h1>
				<p data-testid="about-description">{t("common.about.description")}</p>
			</main>
		);
	});
