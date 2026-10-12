import { useEffect } from "react";

function setMeta(name, content, attr = "name") {
  if (!content) return;
  let node = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, name);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

export default function Seo({ title, description, path, image }) {
  useEffect(() => {
    const base = document.querySelector("[data-canonical-base]")?.getAttribute("data-canonical-base") || "https://www.globalplacepartners.com";
    const url = `${base.replace(/\/$/, "")}${path || "/"}`;
    document.title = title || "Global Place Partners";
    setMeta("description", description);
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:url", url, "property");
    setMeta("og:image", image || `${base.replace(/\/$/, "")}/opengraph.jpg`, "property");
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [title, description, path, image]);
  return null;
}
