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
				<h1 data-testid="about-title">{t("common.about.title")}</h1>
				<p data-testid="about-description">{t("common.about.description")}</p>
			</main>
		);
	});
