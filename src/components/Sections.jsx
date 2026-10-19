import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { paragraphs, useSite } from "../lib/site.jsx";

function bandClass(section) {
  return `band band-${section.spacing || "normal"} band-${section.background || "paper"}`;
}

function Heading({ text, as: Tag = "h2", accent = true }) {
  const lines = String(text || "").split("\n");
  return (
    <Tag>
      {lines.map((line, index) => (
        <span key={index} className={accent && index > 0 ? "accent-line" : undefined}>
          {line}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </Tag>
  );
}

function Links({ section }) {
  const site = useSite();
  const items = [
    [section.linkLabel, section.linkHref],
    [section.link2Label, section.link2Href],
  ].filter(([label, href]) => label && href);
  if (!items.length) return null;
  const hrefFor = (href) => {
    if (!site.preview || href.startsWith("#") || !href.startsWith("/")) return href;
    return href === "/" ? "/preview" : `/preview${href}`;
  };
  return (
    <div className="link-row">
      {items.map(([label, href]) => {
        const dest = hrefFor(href);
        return dest.startsWith("/") || dest.startsWith("#")
          ? <Link key={href + label} className="text-link" to={dest}>{label}</Link>
          : <a key={href + label} className="text-link" href={dest}>{label}</a>;
      })}
    </div>
  );
}

function Copy({ section, titleAs = "h2" }) {
  return (
    <div>
      {section.eyebrow ? <p className="eyebrow">{section.eyebrow}</p> : null}
      {section.heading ? <Heading text={section.heading} as={titleAs} accent={section.accentLines !== false} /> : null}
      {section.subheading ? <p className="support">{section.subheading}</p> : null}
      <div className="prose" style={{ marginTop: "1.25rem" }}>
        {paragraphs(section.body).map((paragraph) => <p key={paragraph.slice(0, 40)} className="muted">{paragraph}</p>)}
      </div>
      <Links section={section} />
    </div>
  );
}

export function articleHref(item) {
  if (item.url && /^https?:\/\//i.test(item.url)) return item.url;
  return `/insights/${item.slug || item.id}`;
}

function InsightLink({ item, children }) {
  const href = articleHref(item);
  if (/^https?:\/\//i.test(href)) return <a className="text-link" href={href} target="_blank" rel="noreferrer">{children}</a>;
  return <Link className="text-link" to={href}>{children}</Link>;
}

const PEOPLE_GROUPS = [
  { key: "founding", title: "Founding Partners", columns: 2 },
  { key: "principal", title: "Principals", columns: 2 },
  { key: "associate", title: "Senior Associates", columns: 3 },
];

function PeopleGroups({ people }) {
  const visible = people.filter((person) => !person.hidden);
  const known = new Set(PEOPLE_GROUPS.map((group) => group.key));
  return (
    <div className="people-list">
      {PEOPLE_GROUPS.map((group) => {
        const members = visible
          .filter((person) => (known.has(person.group) ? person.group : "associate") === group.key)
          .sort((a, b) => a.order - b.order);
        if (!members.length) return null;
        return <Group key={group.key} title={group.title} people={members} columns={group.columns} />;
      })}
    </div>
  );
}

function Group({ title, people, columns }) {
  return (
    <section className="people-group" aria-label={title}>
      <h2 className="group-label">{title}</h2>
      <div className={columns === 3 ? "people-grid three" : "people-grid"}>
        {people.map((person) => <Person key={person.id} person={person} />)}
      </div>
    </section>
  );
}

function Person({ person }) {
  const x = person.photoX ?? 50;
  const y = person.photoY ?? 30;
  const parts = paragraphs(person.bio);
  const [summary, ...more] = parts;
  const links = (person.links || []).filter((link) => link.href);
  return (
    <article className={person.photo ? "person" : "person no-photo"}>
      {person.photo ? (
        <div className="portrait">
          <img
            src={person.photo}
            alt={person.photoAlt ? `Portrait of ${person.photoAlt}` : `Portrait of ${person.name}`}
            loading="lazy"
            style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${person.photoZoom || 1})`, transformOrigin: `${x}% ${y}%` }}
          />
        </div>
      ) : null}
      <div className="person-content">
        <p className="role">{person.role}</p>
        <h3>{person.name}</h3>
        {person.specialism ? <p className="specialism">{person.specialism}</p> : null}
        {summary ? <p className="person-summary">{summary}</p> : null}
        {more.length ? (
          <details className="person-more">
            <summary>Read full biography <span aria-hidden="true">↗</span></summary>
            <div className="prose">
              {more.map((paragraph) => <p key={paragraph.slice(0, 32)}>{paragraph}</p>)}
            </div>
          </details>
        ) : null}
        {links.length ? (
          <div className="person-links">
            {links.map((link) => (
              <a key={link.href} className="person-link" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${person.name} on ${link.label || "LinkedIn"}`}>
                {link.label || "Link"} <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Capabilities({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="capabilities" aria-label="Connected areas of economic development">
      {items.map((item) => <li key={item.id}>{item.title}</li>)}
    </ul>
  );
}

function InsightsList({ insights }) {
  if (!insights.length) return <p>Published perspectives will appear here.</p>;
  const featured = insights.find((item) => item.featured) || insights[0];
  const rest = insights.filter((item) => item.id !== featured.id);
  return (
    <div>
      <article className="insight-feature">
        <div>
          <p className="kicker">Featured {featured.category ? `· ${featured.category}` : ""}</p>
          <h2 style={{ marginTop: "0.6rem" }}>{featured.title}</h2>
          <p className="muted">{featured.summary}</p>
          <p className="note">{[featured.author, featured.source].filter(Boolean).join(" · ")}</p>
          <InsightLink item={featured}>Read the insight</InsightLink>
        </div>
        {featured.image ? <img src={featured.image} alt={featured.imageAlt || ""} /> : null}
      </article>
      <div className="insight-grid">
        {rest.map((item) => (
          <article key={item.id}>
            <p className="kicker">{item.category || item.source}</p>
            <h3>{item.title}</h3>
            <p className="muted">{item.summary}</p>
            <InsightLink item={item}>Read the insight</InsightLink>
          </article>
        ))}
      </div>
    </div>
  );
}

function ContactForm() {
  const { content } = useSite();
  const form = content.settings.form;
  const email = content.settings.contact?.email;
  const widget = useRef(null);
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState([]);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let widgetId;
    let timer;
    fetch("/api/config").then((response) => response.json()).then((config) => {
      const mount = () => {
        if (cancelled || !widget.current || !window.turnstile) return;
        widgetId = window.turnstile.render(widget.current, {
          sitekey: config.turnstileSiteKey,
          callback: (value) => setToken(value),
        });
      };
      if (window.turnstile) mount();
      else timer = setInterval(() => { if (window.turnstile) { clearInterval(timer); mount(); } }, 200);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextErrors = [];
    if (!String(data.get("name") || "").trim()) nextErrors.push("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.get("email") || "").trim())) nextErrors.push("Enter a valid email.");
    if (!String(data.get("organisation") || "").trim()) nextErrors.push("Enter your organisation.");
    if (!String(data.get("project") || "").trim()) nextErrors.push("Enter a message.");
    if (!data.get("consent")) nextErrors.push("Consent is needed so we can reply.");
    if (!token) nextErrors.push("Complete the verification check.");
    setErrors(nextErrors);
    if (nextErrors.length) return;
    setPending(true);
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        organisation: data.get("organisation"),
        project: data.get("project"),
        website: data.get("website"),
        consent: true,
        captchaToken: token,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setErrors(body.details || [body.error || "The enquiry could not be sent."]);
      return;
    }
    setDone(true);
  }

  return (
    <div className="contact-grid">
      <div>
        <h2>Contact details</h2>
        <p className="muted">General enquiries</p>
        <p><a className="text-link" href={`mailto:${email}`}>{email}</a></p>
      </div>
      <div>
        <h2>{form.heading}</h2>
        <p className="muted">{form.intro}</p>
        {done ? <p className="confirm" role="status">{form.confirmation}</p> : (
          <form onSubmit={onSubmit} noValidate>
            {errors.length > 0 && (
              <div role="alert">
                <p className="errors">Please check the form.</p>
                <ul className="errors">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
              </div>
            )}
            <label><span>{form.nameLabel}</span><input name="name" autoComplete="name" required /></label>
            <label><span>{form.organisationLabel}</span><input name="organisation" autoComplete="organization" required /></label>
            <label><span>{form.emailLabel}</span><input name="email" type="email" autoComplete="email" required /></label>
            <label><span>{form.messageLabel}</span><textarea name="project" required /></label>
            <label className="hp">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <label className="check"><input name="consent" type="checkbox" /> <span>{form.consentLabel}</span></label>
            <p><Link to="/privacy">Read the Privacy Policy</Link></p>
            <div ref={widget} className="turnstile" />
            <button className="primary" type="submit" disabled={pending}>{pending ? "Sending…" : form.submitLabel}</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Sections({ sections }) {
  const site = useSite();
  return sections.filter((section) => !section.hidden).map((section) => {
    const layout = section.layout === "split" || section.layout === "split-reverse" ? `split ${section.layout === "split-reverse" ? "split-reverse" : ""}` : "";
    if (section.type === "people") {
      return (
        <section key={section.id} id={section.id} className={bandClass(section)}>
          <div className="wrap"><PeopleGroups people={site.content.people || []} /></div>
        </section>
      );
    }
    if (section.type === "insights") {
      return (
        <section key={section.id} id={section.id} className={bandClass(section)}>
          <div className="wrap"><InsightsList insights={site.insights || []} /></div>
        </section>
      );
    }
    if (section.type === "contact") {
      return (
        <section key={section.id} id={section.id} className={bandClass(section)}>
          <div className="wrap"><ContactForm /></div>
        </section>
      );
    }
    if (section.type === "diagram") {
      const drivers = (section.items || []).filter((item) => item.group !== "capability");
      const capabilities = (section.items || []).filter((item) => item.group === "capability");
      return (
        <section key={section.id} id={section.id} className={bandClass(section)}>
          <div className="wrap">
            <Copy section={section} />
            {section.image ? (
              <>
                <div className="diagram-scroll" tabIndex={0} aria-label="Growth Model diagram. Scroll sideways if the full diagram does not fit.">
                  <img src={section.image} alt={section.imageAlt || "Growth Model diagram"} />
                </div>
                <p className="diagram-help muted">On a phone, scroll the diagram sideways, or <a href={section.image}>open it full size</a>. The same drivers and capabilities are written out below.</p>
              </>
            ) : null}
            <div className="driver-grid">
              {drivers.map((item) => (
                <article key={item.id}><h3>{item.title}</h3><p>{item.text}</p></article>
              ))}
            </div>
            <ul className="capability-list">
              {capabilities.map((item) => (
                <li key={item.id}><h3>{item.title}</h3><p>{item.text}</p></li>
              ))}
            </ul>
          </div>
        </section>
      );
    }
    if (section.type === "modes") {
      const intro = section.layout === "split" ? (
        <div className="split work-intro">
          <div>
            {section.eyebrow ? <p className="eyebrow">{section.eyebrow}</p> : null}
            {section.heading ? <Heading text={section.heading} accent={section.accentLines !== false} /> : null}
          </div>
          <div className="prose work-lead">
            {paragraphs(section.body).map((paragraph) => <p key={paragraph.slice(0, 40)} className="muted">{paragraph}</p>)}
          </div>
        </div>
      ) : <Copy section={{ ...section, linkLabel: "", link2Label: "" }} />;
      return (
        <section key={section.id} id={section.id} className={bandClass(section)}>
          <div className="wrap">
            {intro}
            <ol className={section.layout === "split" ? "modes modes-rows" : "modes"}>
              {(section.items || []).map((item) => (
                <li key={item.id}><h3>{item.title}</h3><p>{item.text}</p></li>
              ))}
            </ol>
            <Links section={section} />
          </div>
        </section>
      );
    }
    if (section.type === "diagnostic") {
      return (
        <section key={section.id} id={section.id} className={`${bandClass(section)} diagnostic`}>
          <div className="wrap">
            {section.eyebrow ? <p className="eyebrow">{section.eyebrow}</p> : null}
            {section.heading ? <Heading text={section.heading} accent={section.accentLines !== false} /> : null}
            <div className="prose diagnostic-lead">
              {paragraphs(section.body).map((paragraph) => <p key={paragraph.slice(0, 40)} className="muted">{paragraph}</p>)}
            </div>
            <div className="questions">
              {(section.items || []).map((item) => (
                <article className="question" key={item.id}>
                  {item.label ? <p className="question-label">{item.label}</p> : null}
                  <h3>{item.title}</h3>
                  <p className="muted">{item.text}</p>
                </article>
              ))}
            </div>
            {section.note ? <p className="diagnostic-note muted">{section.note}</p> : null}
            {section.result || section.linkLabel ? (
              <div className="diagnostic-result">
                {section.result ? <p className="muted">{renderResult(section.result)}</p> : <span />}
                <Links section={section} />
              </div>
            ) : null}
          </div>
        </section>
      );
    }
    const titleAs = section.type === "hero" ? "h1" : "h2";
    const splitCopy = (section.layout === "split" || section.layout === "split-reverse") && !section.image;
    const art = section.type === "hero" && section.image ? " hero-art" : "";
    const cta = section.type === "cta" ? " cta-band" : "";
    return (
      <section key={section.id} id={section.id} className={`${bandClass(section)}${art}${cta}`}>
        <div className={`wrap ${section.type === "hero" && section.image ? "hero-grid" : layout}`}>
          {splitCopy ? (
            <>
              <div>
                {section.eyebrow ? <p className="eyebrow">{section.eyebrow}</p> : null}
                {section.heading ? <Heading text={section.heading} as={titleAs} accent={section.accentLines !== false} /> : null}
                {section.subheading ? <p className="support">{section.subheading}</p> : null}
              </div>
              <div>
                <div className="prose">
                  {paragraphs(section.body).map((paragraph) => <p key={paragraph.slice(0, 48)} className="muted">{paragraph}</p>)}
                </div>
                <Links section={section} />
                <Capabilities items={section.items} />
              </div>
            </>
          ) : (
            <>
              <Copy section={section} titleAs={titleAs} />
              {section.image ? <img className="constellation" src={section.image} alt={section.imageAlt || ""} /> : null}
            </>
          )}
        </div>
      </section>
    );
  });
}

function renderResult(text) {
  const match = /^([^:]{1,40}:)(.*)$/s.exec(text);
  if (!match) return text;
  return <><strong>{match[1]}</strong>{match[2]}</>;
}

export function ArticleView({ item }) {
  return (
    <section className="band band-generous band-paper">
      <div className="wrap narrow">
        <p className="eyebrow">{[item.category, item.source].filter(Boolean).join(" · ")}</p>
        <h1 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}>{item.title}</h1>
        <p className="muted">{item.author}</p>
        {item.image ? <img src={item.image} alt={item.imageAlt || ""} /> : null}
        <div className="prose" style={{ marginTop: "1.5rem" }}>
          {paragraphs(item.body || item.summary).map((paragraph) => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}
        </div>
        {item.url ? <p><a className="text-link" href={item.url}>Original link</a></p> : null}
      </div>
    </section>
  );
}
