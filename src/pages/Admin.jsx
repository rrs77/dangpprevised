import { useEffect, useState } from "react";

const TYPES = ["hero", "text", "modes", "diagram", "people", "insights", "contact", "cta"];
const BACKGROUNDS = ["paper", "cream", "white", "deep", "green"];
const FONTS = ["Outfit", "Source Sans 3", "Fraunces", "Libre Franklin", "Manrope"];

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, { ...options, credentials: "include", headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Admin() {
  const [session, setSession] = useState(null);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState(null);
  const [insights, setInsights] = useState([]);
  const [media, setMedia] = useState([]);
  const [users, setUsers] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [tab, setTab] = useState("pages");
  const [pageSlug, setPageSlug] = useState("home");
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const current = await api("/api/admin/session");
    setSession(current);
    if (!current.authenticated) return;
    const [nextDraft, nextInsights, nextMedia, nextRevisions] = await Promise.all([
      api("/api/admin/draft"),
      api("/api/admin/insights"),
      api("/api/admin/media"),
      api("/api/admin/revisions"),
    ]);
    setDraft(nextDraft);
    setInsights(nextInsights);
    setMedia(nextMedia);
    setRevisions(nextRevisions);
    if (current.role === "superuser") {
      setUsers(await api("/api/admin/users"));
      setSubmissions(await api("/api/admin/submissions"));
    }
  }

  useEffect(() => { load().catch((reason) => setError(reason.message)); }, []);

  async function login(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password, email }) });
      setPassword("");
      await load();
    } catch (reason) {
      setError(reason.message);
    }
  }

  function patch(mutator) {
    setDraft((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
  }

  async function save() {
    setStatus("Saving…");
    await api("/api/admin/draft", { method: "PUT", body: JSON.stringify(draft) });
    setStatus("Draft saved.");
  }

  async function publishDraft() {
    setStatus("Publishing…");
    await api("/api/admin/publish", { method: "POST", body: JSON.stringify({ document: draft, note: "Published from admin" }) });
    setRevisions(await api("/api/admin/revisions"));
    setStatus("Published. The public site is using this version.");
  }

  if (!session) return <p className="wrap">Loading…</p>;
  if (!session.authenticated) {
    return (
      <main className="admin">
        <form className="login-card stack" onSubmit={login}>
          <h1>Site admin</h1>
          <p className="note">Superuser password, or an editor email and password.</p>
          {error && <p role="alert">{error}</p>}
          <label><span>Email, for editor accounts</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          <button className="primary" type="submit">Sign in</button>
        </form>
      </main>
    );
  }
  if (!draft) return <p className="wrap">Loading the draft…</p>;

  const page = draft.pages.find((item) => item.slug === pageSlug) || draft.pages[0];
  const section = page?.sections?.find((item) => item.id === sectionId) || page?.sections?.[0];
  const superuser = session.role === "superuser";

  return (
    <main className="admin">
      <div className="admin-bar">
        <div>
          <strong>GPP admin</strong>
          <div className="note">{session.role} · edits stay in draft until you publish</div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="status" role="status">{status}</span>
          <button type="button" onClick={() => save().catch((reason) => setStatus(reason.message))}>Save draft</button>
          <a href="/preview" target="_blank" rel="noreferrer">Preview</a>
          <button className="primary" type="button" onClick={() => publishDraft().catch((reason) => setStatus(reason.message))}>Publish</button>
          <button type="button" onClick={() => api("/api/admin/logout", { method: "POST" }).then(() => setSession({ authenticated: false }))}>Sign out</button>
        </div>
      </div>
      <div className="admin-tabs">
        {["pages", "people", "insights", "media", "navigation", "brand", "form", "access", "history"].map((item) => (
          <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "pages" && (
        <div className="admin-main">
          <div className="panel stack">
            {draft.pages.map((item) => (
              <button key={item.slug} type="button" aria-pressed={item.slug === page.slug} onClick={() => { setPageSlug(item.slug); setSectionId(item.sections[0]?.id || ""); }}>{item.title}</button>
            ))}
            <NewPage onCreate={(created) => patch((next) => { next.pages.push(created); setPageSlug(created.slug); })} />
          </div>
          <div className="panel stack">
            <label><span>Page title</span><input value={page.title} onChange={(event) => patch((next) => { findPage(next, page.slug).title = event.target.value; })} /></label>
            <label><span>SEO title</span><input value={page.seoTitle || ""} onChange={(event) => patch((next) => { findPage(next, page.slug).seoTitle = event.target.value; })} /></label>
            <label><span>Description</span><textarea value={page.description || ""} onChange={(event) => patch((next) => { findPage(next, page.slug).description = event.target.value; })} /></label>
            <label className="check"><input type="checkbox" checked={!!page.hidden} onChange={(event) => patch((next) => { findPage(next, page.slug).hidden = event.target.checked; })} /> Hidden</label>
            {!page.protected && <button type="button" onClick={() => patch((next) => { next.pages = next.pages.filter((item) => item.slug !== page.slug); setPageSlug("home"); })}>Delete page</button>}
            <div className="section-list stack">
              {page.sections.map((item, index) => (
                <div key={item.id} style={{ display: "flex", gap: "0.4rem" }}>
                  <button type="button" aria-pressed={section?.id === item.id} onClick={() => setSectionId(item.id)}>{item.hidden ? "Hidden: " : ""}{item.type}: {item.heading || item.id}</button>
                  <button type="button" onClick={() => moveSection(patch, page.slug, index, -1)} aria-label="Move up">Up</button>
                  <button type="button" onClick={() => moveSection(patch, page.slug, index, 1)} aria-label="Move down">Down</button>
                </div>
              ))}
            </div>
            <AddSection onAdd={(type) => patch((next) => {
              const created = emptySection(type);
              findPage(next, page.slug).sections.push(created);
              setSectionId(created.id);
            })} />
            {section && <SectionEditor section={section} media={media} onChange={(mutator) => patch((next) => mutator(findSection(next, page.slug, section.id)))} onDuplicate={() => patch((next) => {
              const copy = structuredClone(section);
              copy.id = uid("section");
              const target = findPage(next, page.slug);
              const index = target.sections.findIndex((item) => item.id === section.id);
              target.sections.splice(index + 1, 0, copy);
            })} onDelete={() => patch((next) => {
              const target = findPage(next, page.slug);
              target.sections = target.sections.filter((item) => item.id !== section.id);
            })} />}
          </div>
        </div>
      )}
      {tab === "people" && <PeopleEditor people={draft.people} media={media} patch={patch} />}
      {tab === "insights" && <InsightsEditor insights={insights} media={media} onChange={setInsights} />}
      {tab === "media" && <MediaLibrary media={media} onChange={setMedia} />}
      {tab === "navigation" && <NavEditor draft={draft} patch={patch} />}
      {tab === "brand" && <BrandEditor draft={draft} patch={patch} media={media} superuser={superuser} />}
      {tab === "form" && <FormEditor draft={draft} patch={patch} />}
      {tab === "access" && superuser && <AccessEditor users={users} onChange={setUsers} />}
      {tab === "access" && !superuser && <p className="admin-main">Only a superuser can change who has access.</p>}
      {tab === "history" && <History revisions={revisions} submissions={submissions} superuser={superuser} onRestore={async (id) => { await api("/api/admin/rollback", { method: "POST", body: JSON.stringify({ id }) }); await load(); setStatus("Restored."); }} />}
    </main>
  );
}

function findPage(draft, slug) {
  return draft.pages.find((item) => item.slug === slug);
}
function findSection(draft, slug, id) {
  return findPage(draft, slug).sections.find((item) => item.id === id);
}
function moveSection(patch, slug, index, delta) {
  patch((next) => {
    const sections = findPage(next, slug).sections;
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const [item] = sections.splice(index, 1);
    sections.splice(target, 0, item);
  });
}
function emptySection(type) {
  return { id: uid("section"), type, hidden: false, eyebrow: "", heading: "New section", subheading: "", body: "", image: "", imageAlt: "", linkLabel: "", linkHref: "", link2Label: "", link2Href: "", background: "paper", spacing: "normal", layout: "stack", align: "left", items: [] };
}

function NewPage({ onCreate }) {
  const [title, setTitle] = useState("");
  return (
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!slug) return;
      onCreate({ slug, title, protected: false, hidden: false, description: "", seoTitle: title, sections: [emptySection("text")] });
      setTitle("");
    }}>
      <label><span>New page title</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <button type="submit">Create page</button>
    </form>
  );
}

function AddSection({ onAdd }) {
  const [type, setType] = useState("text");
  return (
    <div style={{ display: "flex", gap: "0.4rem" }}>
      <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Section type">{TYPES.map((item) => <option key={item}>{item}</option>)}</select>
      <button type="button" onClick={() => onAdd(type)}>Add section</button>
    </div>
  );
}

function Field({ label, value, onChange, area = false }) {
  const Input = area ? "textarea" : "input";
  return <label><span>{label}</span><Input value={value || ""} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SectionEditor({ section, onChange, onDuplicate, onDelete, media }) {
  const set = (key, value) => onChange((target) => { target[key] = value; });
  return (
    <div className="stack">
      <h2>Section</h2>
      <label><span>Type</span><select value={section.type} onChange={(event) => set("type", event.target.value)}>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <Field label="Eyebrow" value={section.eyebrow} onChange={(value) => set("eyebrow", value)} />
      <Field label="Heading" value={section.heading} onChange={(value) => set("heading", value)} area />
      <Field label="Supporting line" value={section.subheading} onChange={(value) => set("subheading", value)} />
      <Field label="Body" value={section.body} onChange={(value) => set("body", value)} area />
      <Field label="Image address" value={section.image} onChange={(value) => set("image", value)} />
      <MediaSelect media={media} onPick={(url) => set("image", url)} />
      <Field label="Image description" value={section.imageAlt} onChange={(value) => set("imageAlt", value)} />
      <Field label="Link label" value={section.linkLabel} onChange={(value) => set("linkLabel", value)} />
      <Field label="Link address" value={section.linkHref} onChange={(value) => set("linkHref", value)} />
      <Field label="Second link label" value={section.link2Label} onChange={(value) => set("link2Label", value)} />
      <Field label="Second link address" value={section.link2Href} onChange={(value) => set("link2Href", value)} />
      <label><span>Background</span><select value={section.background} onChange={(event) => set("background", event.target.value)}>{BACKGROUNDS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Spacing</span><select value={section.spacing} onChange={(event) => set("spacing", event.target.value)}><option>compact</option><option>normal</option><option>generous</option></select></label>
      <label><span>Layout</span><select value={section.layout} onChange={(event) => set("layout", event.target.value)}><option>stack</option><option>split</option><option>split-reverse</option></select></label>
      <label className="check"><input type="checkbox" checked={!!section.hidden} onChange={(event) => set("hidden", event.target.checked)} /> Hide section</label>
      {(section.type === "modes" || section.type === "diagram") && (
        <ItemEditor items={section.items || []} onChange={(items) => set("items", items)} diagram={section.type === "diagram"} />
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" onClick={onDuplicate}>Duplicate section</button>
        <button type="button" onClick={onDelete}>Delete section</button>
      </div>
    </div>
  );
}

function ItemEditor({ items, onChange, diagram }) {
  function update(index, key, value) {
    const next = items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    onChange(next);
  }
  return (
    <div className="stack">
      <h3>{diagram ? "Drivers and capabilities" : "Items"}</h3>
      {items.map((item, index) => (
        <div key={item.id} className="stack" style={{ borderTop: "1px solid #ddd", paddingTop: "0.6rem" }}>
          {diagram && (
            <label><span>Group</span>
              <select value={item.group || "driver"} onChange={(event) => update(index, "group", event.target.value)}>
                <option value="driver">driver</option>
                <option value="capability">capability</option>
              </select>
            </label>
          )}
          <Field label="Title" value={item.title} onChange={(value) => update(index, "title", value)} />
          <Field label="Text" value={item.text} onChange={(value) => update(index, "text", value)} area />
          <button type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove item</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { id: uid("item"), title: "New item", text: "", group: "driver" }])}>Add item</button>
    </div>
  );
}

function MediaSelect({ media, onPick }) {
  if (!media.length) return null;
  return (
    <label><span>Or choose from the library</span>
      <select defaultValue="" onChange={(event) => event.target.value && onPick(event.target.value)}>
        <option value="">Select an upload</option>
        {media.map((item) => <option key={item.id} value={`/api/media/${item.id}`}>{item.filename}</option>)}
      </select>
    </label>
  );
}

function PeopleEditor({ people, patch, media }) {
  const [id, setId] = useState(people[0]?.id);
  const person = people.find((item) => item.id === id) || people[0];
  function set(key, value) {
    patch((next) => {
      const target = next.people.find((item) => item.id === person.id);
      target[key] = value;
    });
  }
  return (
    <div className="admin-main">
      <div className="panel stack">
        {people.map((item, index) => (
          <div key={item.id} style={{ display: "flex", gap: "0.3rem" }}>
            <button type="button" onClick={() => setId(item.id)}>{item.name}</button>
            <button type="button" aria-label={`Move ${item.name} up`} onClick={() => patch((next) => swap(next.people, index, -1))}>Up</button>
            <button type="button" aria-label={`Move ${item.name} down`} onClick={() => patch((next) => swap(next.people, index, 1))}>Down</button>
          </div>
        ))}
        <button type="button" onClick={() => patch((next) => {
          const created = { id: uid("person"), name: "New person", role: "Senior Associate", group: "associate", order: next.people.length + 1, hidden: false, photo: "", photoAlt: "", photoX: 50, photoY: 20, photoZoom: 1, bio: "", links: [] };
          next.people.push(created);
          setId(created.id);
        })}>Add person</button>
      </div>
      {person && (
        <div className="panel stack">
          <Field label="Name" value={person.name} onChange={(value) => set("name", value)} />
          <Field label="Role" value={person.role} onChange={(value) => set("role", value)} />
          <label><span>Group</span>
            <select value={person.group} onChange={(event) => set("group", event.target.value)}>
              <option value="founding">Founding Partners</option>
              <option value="associate">Senior Associates</option>
            </select>
          </label>
          <Field label="Biography" value={person.bio} onChange={(value) => set("bio", value)} area />
          <Field label="Portrait address" value={person.photo} onChange={(value) => set("photo", value)} />
          <MediaSelect media={media} onPick={(url) => set("photo", url)} />
          <Field label="Portrait description" value={person.photoAlt} onChange={(value) => set("photoAlt", value)} />
          <label><span>Crop horizontal ({person.photoX})</span><input type="range" min="0" max="100" value={person.photoX} onChange={(event) => set("photoX", Number(event.target.value))} /></label>
          <label><span>Crop vertical ({person.photoY})</span><input type="range" min="0" max="100" value={person.photoY} onChange={(event) => set("photoY", Number(event.target.value))} /></label>
          <label><span>Crop zoom ({person.photoZoom})</span><input type="range" min="1" max="2" step="0.05" value={person.photoZoom} onChange={(event) => set("photoZoom", Number(event.target.value))} /></label>
          <Field label="Link label" value={person.links?.[0]?.label || ""} onChange={(value) => set("links", [{ label: value, href: person.links?.[0]?.href || "" }])} />
          <Field label="Link address" value={person.links?.[0]?.href || ""} onChange={(value) => set("links", [{ label: person.links?.[0]?.label || "Link", href: value }])} />
          <label className="check"><input type="checkbox" checked={!!person.hidden} onChange={(event) => set("hidden", event.target.checked)} /> Hide</label>
          <button type="button" onClick={() => patch((next) => { next.people = next.people.filter((item) => item.id !== person.id); })}>Remove person</button>
        </div>
      )}
    </div>
  );
}

function swap(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  list.forEach((entry, entryIndex) => { entry.order = entryIndex + 1; });
}

function InsightsEditor({ insights, onChange, media }) {
  const blank = { title: "", summary: "", body: "", url: "", source: "Global Place Partners", category: "", author: "", image: "", imageAlt: "", seoTitle: "", seoDescription: "", slug: "", status: "draft", featured: false, publishAt: "" };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState("");
  function set(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event) {
    event.preventDefault();
    const payload = { ...form, slug: form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
    const saved = await api(editing ? `/api/admin/insights/${editing}` : "/api/admin/insights", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    const next = await api("/api/admin/insights");
    onChange(next);
    setEditing(saved.id);
    setForm(saved);
  }
  return (
    <div className="admin-main">
      <div className="panel stack">
        {insights.map((item) => (
          <button key={item.id} type="button" onClick={() => { setEditing(item.id); setForm(item); }}>{item.status}: {item.title}</button>
        ))}
        <button type="button" onClick={() => { setEditing(""); setForm(blank); }}>New article</button>
      </div>
      <form className="panel stack" onSubmit={save}>
        <Field label="Title" value={form.title} onChange={(value) => set("title", value)} />
        <Field label="Summary" value={form.summary} onChange={(value) => set("summary", value)} area />
        <Field label="Body, for an article on this site" value={form.body} onChange={(value) => set("body", value)} area />
        <Field label="External URL" value={form.url} onChange={(value) => set("url", value)} />
        <Field label="Slug" value={form.slug} onChange={(value) => set("slug", value)} />
        <Field label="Category" value={form.category} onChange={(value) => set("category", value)} />
        <Field label="Author" value={form.author} onChange={(value) => set("author", value)} />
        <Field label="Source" value={form.source} onChange={(value) => set("source", value)} />
        <Field label="Featured image" value={form.image} onChange={(value) => set("image", value)} />
        <MediaSelect media={media} onPick={(url) => set("image", url)} />
        <Field label="Image description" value={form.imageAlt} onChange={(value) => set("imageAlt", value)} />
        <Field label="SEO title" value={form.seoTitle} onChange={(value) => set("seoTitle", value)} />
        <Field label="SEO description" value={form.seoDescription} onChange={(value) => set("seoDescription", value)} area />
        <label><span>Status</span>
          <select value={form.status} onChange={(event) => set("status", event.target.value)}>
            <option value="draft">draft</option>
            <option value="scheduled">scheduled</option>
            <option value="published">published</option>
          </select>
        </label>
        <label><span>Publish at, for scheduled articles</span><input type="datetime-local" value={form.publishAt ? form.publishAt.slice(0, 16) : ""} onChange={(event) => set("publishAt", event.target.value ? new Date(event.target.value).toISOString() : "")} /></label>
        <label className="check"><input type="checkbox" checked={!!form.featured} onChange={(event) => set("featured", event.target.checked)} /> Featured article</label>
        <button className="primary" type="submit">{editing ? "Save article" : "Create article"}</button>
        {editing && <button type="button" onClick={async () => { await api(`/api/admin/insights/${editing}`, { method: "DELETE" }); onChange(await api("/api/admin/insights")); setEditing(""); setForm(blank); }}>Delete article</button>}
      </form>
    </div>
  );
}

function MediaLibrary({ media, onChange }) {
  const [alt, setAlt] = useState("");
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("image", file);
    body.append("alt", alt);
    await api("/api/admin/upload", { method: "POST", body });
    onChange(await api("/api/admin/media"));
  }
  return (
    <div className="admin-main" style={{ gridTemplateColumns: "1fr" }}>
      <div className="panel stack">
        <label><span>Description for the next upload</span><input value={alt} onChange={(event) => setAlt(event.target.value)} /></label>
        <label><span>Upload image</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} /></label>
        {media.map((item) => (
          <form key={item.id} className="stack" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const file = form.get("image");
            if (file && file.size) {
              form.set("alt", form.get("alt") || item.alt);
              await api(`/api/admin/media/${item.id}`, { method: "PUT", body: form });
            } else {
              await api(`/api/admin/media/${item.id}`, { method: "PUT", body: JSON.stringify({ alt: form.get("alt") }) });
            }
            onChange(await api("/api/admin/media"));
          }}>
            <img src={`/api/media/${item.id}`} alt={item.alt || ""} style={{ width: 160 }} />
            <label><span>Alt text for {item.filename}</span><input name="alt" defaultValue={item.alt} /></label>
            <label><span>Replace file</span><input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
            <button type="submit">Update image</button>
          </form>
        ))}
      </div>
    </div>
  );
}

function NavEditor({ draft, patch }) {
  return (
    <div className="admin-main" style={{ gridTemplateColumns: "1fr" }}>
      <div className="panel stack">
        <p className="note">Desktop and mobile use this order. A mobile label is optional.</p>
        {draft.settings.nav.map((item, index) => (
          <div key={item.id} className="stack" style={{ borderTop: "1px solid #ddd", paddingTop: "0.6rem" }}>
            <Field label="Label" value={item.label} onChange={(value) => patch((next) => { next.settings.nav[index].label = value; })} />
            <Field label="Mobile label" value={item.mobileLabel} onChange={(value) => patch((next) => { next.settings.nav[index].mobileLabel = value; })} />
            <Field label="Link" value={item.href} onChange={(value) => patch((next) => { next.settings.nav[index].href = value; })} />
            <label className="check"><input type="checkbox" checked={item.visible} onChange={(event) => patch((next) => { next.settings.nav[index].visible = event.target.checked; })} /> Visible</label>
            <div>
              <button type="button" onClick={() => patch((next) => swap(next.settings.nav, index, -1))}>Up</button>
              <button type="button" onClick={() => patch((next) => swap(next.settings.nav, index, 1))}>Down</button>
              <button type="button" onClick={() => patch((next) => { next.settings.nav = next.settings.nav.filter((entry) => entry.id !== item.id); })}>Remove</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => patch((next) => next.settings.nav.push({ id: uid("nav"), label: "New link", mobileLabel: "", href: "/", visible: true }))}>Add link</button>
      </div>
    </div>
  );
}

function BrandEditor({ draft, patch, media, superuser }) {
  const colors = draft.settings.colors;
  return (
    <div className="admin-main" style={{ gridTemplateColumns: "1fr" }}>
      <div className="panel stack">
        {Object.keys(colors).map((key) => (
          <label key={key}><span>{key}</span><input type="color" value={colors[key]} onChange={(event) => patch((next) => { next.settings.colors[key] = event.target.value; })} /></label>
        ))}
        <label><span>Heading font</span><select value={draft.settings.fonts.heading} onChange={(event) => patch((next) => { next.settings.fonts.heading = event.target.value; })}>{FONTS.map((font) => <option key={font}>{font}</option>)}</select></label>
        <label><span>Body font</span><select value={draft.settings.fonts.body} onChange={(event) => patch((next) => { next.settings.fonts.body = event.target.value; })}>{FONTS.map((font) => <option key={font}>{font}</option>)}</select></label>
        <Field label="Logo address" value={draft.settings.logo.src} onChange={(value) => patch((next) => { next.settings.logo.src = value; })} />
        <MediaSelect media={media} onPick={(url) => patch((next) => { next.settings.logo.src = url; })} />
        <Field label="Logo description" value={draft.settings.logo.alt} onChange={(value) => patch((next) => { next.settings.logo.alt = value; })} />
        <Field label="Public email" value={draft.settings.contact.email} onChange={(value) => patch((next) => { next.settings.contact.email = value; })} />
        {superuser && <Field label="Enquiry recipient, stored on the server" value={draft.secrets?.recipientEmail || ""} onChange={(value) => patch((next) => { next.secrets = { ...next.secrets, recipientEmail: value }; })} />}
        <Field label="Footer line" value={draft.settings.footer.blurb} onChange={(value) => patch((next) => { next.settings.footer.blurb = value; })} />
        <Field label="Legal footer" value={draft.settings.legal.text} onChange={(value) => patch((next) => { next.settings.legal.text = value; })} area />
        <Field label="Canonical site address" value={draft.settings.canonicalBase} onChange={(value) => patch((next) => { next.settings.canonicalBase = value; })} />
        {(draft.settings.footer.legalLinks || []).map((item, index) => (
          <div key={item.id || index} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.4rem" }}>
            <input aria-label="Legal link label" value={item.label} onChange={(event) => patch((next) => { next.settings.footer.legalLinks[index].label = event.target.value; })} />
            <input aria-label="Legal link address" value={item.href} onChange={(event) => patch((next) => { next.settings.footer.legalLinks[index].href = event.target.value; })} />
            <button type="button" onClick={() => patch((next) => { next.settings.footer.legalLinks.splice(index, 1); })}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => patch((next) => next.settings.footer.legalLinks.push({ id: uid("legal"), label: "New policy", href: "/privacy" }))}>Add legal link</button>
      </div>
    </div>
  );
}

function FormEditor({ draft, patch }) {
  const form = draft.settings.form;
  return (
    <div className="admin-main" style={{ gridTemplateColumns: "1fr" }}>
      <div className="panel stack">
        {Object.keys(form).map((key) => (
          <Field key={key} label={key} value={form[key]} onChange={(value) => patch((next) => { next.settings.form[key] = value; })} area={key === "intro" || key === "confirmation" || key === "consentLabel"} />
        ))}
      </div>
    </div>
  );
}

function AccessEditor({ users, onChange }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "editor" });
  return (
    <div className="admin-main" style={{ gridTemplateColumns: "1fr" }}>
      <div className="panel stack">
        <p className="note">The superuser password stays in the server environment. Editors can change content but not the enquiry recipient or access list.</p>
        {users.map((user) => (
          <div key={user.id}>{user.name} · {user.email} · {user.role} <button type="button" onClick={async () => { await api(`/api/admin/users/${user.id}`, { method: "DELETE" }); onChange(await api("/api/admin/users")); }}>Remove</button></div>
        ))}
        <form className="stack" onSubmit={async (event) => {
          event.preventDefault();
          await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) });
          onChange(await api("/api/admin/users"));
          setForm({ name: "", email: "", password: "", role: "editor" });
        }}>
          <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
          <label><span>Role</span>
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="editor">editor</option>
              <option value="superuser">superuser</option>
            </select>
          </label>
          <button className="primary" type="submit">Add user</button>
        </form>
      </div>
    </div>
  );
}

function History({ revisions, submissions, superuser, onRestore }) {
  return (
    <div className="admin-main" style={{ gridTemplateColumns: "1fr" }}>
      <div className="panel stack">
        <h2>Revisions</h2>
        {revisions.length === 0 && <p>Nothing has been published yet.</p>}
        {revisions.map((item) => (
          <div key={item.id}>{item.at} · {item.note} {superuser && <button type="button" onClick={() => onRestore(item.id)}>Restore</button>}</div>
        ))}
        {superuser && (
          <>
            <h2>Enquiries</h2>
            {submissions.length === 0 && <p>No stored enquiries yet.</p>}
            {submissions.map((item) => <p key={item.id}>{item.at} · {item.name} · {item.email} · {item.delivered}</p>)}
          </>
        )}
      </div>
    </div>
  );
}
