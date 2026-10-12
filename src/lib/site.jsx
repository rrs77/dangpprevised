import { createContext, useContext, useEffect, useState } from "react";

const SiteContext = createContext(null);

export function useSite() {
  return useContext(SiteContext);
}

async function readJson(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("The site content could not be loaded.");
  return response.json();
}

export function SiteProvider({ preview = false, children }) {
  const [value, setValue] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      readJson(preview ? "/api/admin/draft" : "/api/content"),
      fetch(preview ? "/api/admin/insights" : "/api/insights", { credentials: "include" }).then((response) => response.ok ? response.json() : []),
    ]).then(([content, insights]) => {
      if (cancelled) return;
      const visible = (Array.isArray(insights) ? insights : []).filter((item) => {
        if (item.status === "published") return true;
        if (item.status === "scheduled" && item.publishAt && new Date(item.publishAt).getTime() <= Date.now()) return true;
        return false;
      });
      setValue({ content, insights: visible, preview });
    }).catch((reason) => {
      if (!cancelled) setError(reason.message);
    });
    return () => { cancelled = true; };
  }, [preview]);

  if (error) return <p className="wrap" role="alert">{error}</p>;
  if (!value) return <p className="wrap">Loading…</p>;
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function paragraphs(text) {
  return String(text || "").split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
}

export function pageBySlug(content, slug) {
  return content?.pages?.find((page) => page.slug === slug);
}
