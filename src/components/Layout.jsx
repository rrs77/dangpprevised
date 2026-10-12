import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useSite } from "../lib/site.jsx";

export default function Layout({ children }) {
  const { content, preview } = useSite();
  const { settings } = content;
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(() => localStorage.getItem("gpp-consent"));
  const nav = (settings.nav || []).filter((item) => item.visible);
  const hrefFor = (href) => {
    if (!preview || !href?.startsWith("/")) return href;
    return href === "/" ? "/preview" : `/preview${href}`;
  };

  useEffect(() => {
    if (consent === "accepted" && settings.gaId && !document.getElementById("gpp-gtag")) {
      const script = document.createElement("script");
      script.id = "gpp-gtag";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${settings.gaId}`;
      document.head.appendChild(script);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", settings.gaId);
    }
  }, [consent, settings.gaId]);

  const colors = settings.colors || {};
  const theme = `
    :root {
      --green: ${colors.green || "#14362f"};
      --teal: ${colors.teal || "#2f7f73"};
      --copper: ${colors.copper || "#b86a3d"};
      --ink: ${colors.ink || "#1c1916"};
      --paper: ${colors.paper || "#f6f1e8"};
      --cream: ${colors.cream || "#ebe3d6"};
      --deep: ${colors.deep || "#0c1f1c"};
      --font-heading: "${settings.fonts?.heading || "Outfit"}", sans-serif;
      --font-body: "${settings.fonts?.body || "Source Sans 3"}", sans-serif;
    }
  `;

  function choose(value) {
    localStorage.setItem("gpp-consent", value);
    setConsent(value);
  }

  return (
    <div data-canonical-base={settings.canonicalBase}>
      <style>{theme}</style>
      <a className="skip" href="#content">Skip to content</a>
      {preview && <div className="preview-banner">Draft preview. This is not the published site.</div>}
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" aria-label="Global Place Partners, home">
            <img className="logo" src={settings.logo?.src} alt={settings.logo?.alt || "Global Place Partners"} />
          </Link>
          <nav className="nav-desktop" aria-label="Primary">
            {nav.map((item) => (
              <NavLink key={item.id} to={hrefFor(item.href)} end={item.href === "/"}>{item.label}</NavLink>
            ))}
          </nav>
          <button className="menu-toggle" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : "Menu"}
          </button>
        </div>
        <nav id="mobile-nav" className={open ? "nav-mobile open" : "nav-mobile"} aria-label="Mobile">
          {nav.map((item) => (
            <NavLink key={item.id} to={hrefFor(item.href)} end={item.href === "/"} onClick={() => setOpen(false)}>
              {item.mobileLabel || item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="content">{children}</main>
      <footer className="site-footer">
        <div className="footer-inner footer-grid">
          <div>
            <img src={settings.logo?.src} alt="" style={{ height: 42, width: "auto", background: "#f6f1e8", padding: "0.35rem 0.5rem" }} />
            <p>{settings.footer?.blurb}</p>
          </div>
          <div>
            <p className="eyebrow">Visit</p>
            {nav.map((item) => <div key={item.id}><Link to={hrefFor(item.href)}>{item.label}</Link></div>)}
          </div>
          <div>
            <p className="eyebrow">Contact</p>
            <p><a href={`mailto:${settings.contact?.email}`}>{settings.contact?.email}</a></p>
            {(settings.footer?.legalLinks || []).map((item) => (
              <div key={item.id || item.href}><Link to={item.href}>{item.label}</Link></div>
            ))}
          </div>
        </div>
        <div className="footer-inner legal">{settings.legal?.text}</div>
      </footer>
      {!consent && (
        <div className="cookie" role="dialog" aria-label="Cookie consent">
          <p>We use a necessary cookie for site administration and, only if you agree, Google Analytics to understand visits. Read the <Link to="/cookies">Cookie Policy</Link>.</p>
          <div className="cookie-actions">
            <button type="button" onClick={() => choose("rejected")}>Reject</button>
            <button type="button" className="primary" onClick={() => choose("accepted")}>Accept</button>
          </div>
        </div>
      )}
    </div>
  );
}
