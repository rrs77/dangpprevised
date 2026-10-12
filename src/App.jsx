import { useParams } from "react-router-dom";
import Seo from "./components/Seo.jsx";
import Sections, { ArticleView } from "./components/Sections.jsx";
import { pageBySlug, useSite } from "./lib/site.jsx";

export function Page({ slug }) {
  const params = useParams();
  const { content } = useSite();
  const key = slug || params.slug;
  const page = pageBySlug(content, key);
  if (!page || page.hidden) {
    return (
      <section className="band">
        <div className="wrap">
          <h1>Page not found</h1>
          <p><a className="text-link" href="/">Back to the home page</a></p>
        </div>
      </section>
    );
  }
  const title = page.seoTitle || `${page.title} · ${content.settings.siteName}`;
  const path = key === "home" ? "/" : `/${key}`;
  return (
    <>
      <Seo title={title} description={page.description || content.settings.description} path={path} />
      <Sections sections={page.sections || []} />
    </>
  );
}

export function InsightArticle() {
  const { slug } = useParams();
  const { insights } = useSite();
  const item = insights.find((entry) => entry.slug === slug || entry.id === slug);
  if (!item) return <Page slug="missing" />;
  if (item.url && /^https?:\/\//i.test(item.url) && !item.body) {
    window.location.replace(item.url);
    return null;
  }
  return (
    <>
      <Seo title={item.seoTitle || item.title} description={item.seoDescription || item.summary} path={`/insights/${item.slug || item.id}`} />
      <ArticleView item={item} />
    </>
  );
}

export function Signature() {
  const { content } = useSite();
  const email = content.settings.contact?.email || "enquiries@globalplacepartners.com";
  const origin = content.settings.canonicalBase || "https://www.globalplacepartners.com";
  const html = `<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif"><tr><td style="font-size:16px;font-weight:700;color:#14362f">Dan Storer</td></tr><tr><td style="color:#2F7F73;font-weight:700">Founding Partner, Global Place Partners</td></tr><tr><td style="padding-top:8px"><a href="mailto:${email}" style="color:#2F7F73">${email}</a></td></tr><tr><td><a href="${origin}" style="color:#2F7F73">globalplacepartners.com</a></td></tr><tr><td style="padding-top:8px"><img src="${origin}/images/gpp-logo.png" alt="Global Place Partners" width="180" /></td></tr></table>`;
  return (
    <section className="band">
      <div className="wrap narrow">
        <p><a className="text-link" href="/">Back to the site</a></p>
        <h1>Email signature</h1>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <p><button className="primary" type="button" onClick={() => navigator.clipboard.writeText(html)}>Copy signature HTML</button></p>
      </div>
    </section>
  );
}
