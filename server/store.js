import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { blankState } from "./seed.js";

let dataDir = path.join(process.cwd(), "data");
let mediaDir = path.join(dataDir, "media");
let filePath = path.join(dataDir, "cms.json");
let memoryState = null;

let pool = null;
let queue = Promise.resolve();

function remember(dir) {
  dataDir = dir;
  mediaDir = path.join(dir, "media");
  filePath = path.join(dir, "cms.json");
}

function directoryIsWritable(dir) {
  try {
    fs.mkdirSync(path.join(dir, "media"), { recursive: true });
    const probe = path.join(dir, ".write-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function enqueue(fn) {
  const job = queue.then(fn, fn);
  queue = job.then(() => {}, () => {});
  return job;
}

async function read() {
  if (!pool) {
    if (filePath && fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!memoryState) memoryState = blankState();
    return memoryState;
  }
  const result = await pool.query("select data from cms_state where id = 'current'");
  return result.rows[0].data;
}

async function write(state) {
  if (!pool) {
    memoryState = state;
    if (!filePath) return;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, filePath);
    } catch (error) {
      console.error("Content file could not be saved; keeping this copy in memory.", error.message);
    }
    return;
  }
  await pool.query(
    `insert into cms_state (id, data, updated_at) values ('current', $1::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [state]
  );
}

function update(mutator) {
  return enqueue(async () => {
    const state = await read();
    const next = await mutator(state);
    await write(next);
    return next;
  });
}

export function toPublic(doc) {
  const copy = structuredClone(doc);
  delete copy.secrets;
  return copy;
}

export function visibleInsight(item, now = Date.now()) {
  if (!item || item.hidden) return false;
  if (item.status === "published") return true;
  if (item.status === "scheduled" && item.publishAt) {
    const at = new Date(item.publishAt).getTime();
    return Number.isFinite(at) && at <= now;
  }
  return false;
}

async function migrate(client) {
  await client.query(`
    create table if not exists cms_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );
    create table if not exists cms_media (
      id text primary key,
      filename text not null default '',
      mime text not null default '',
      alt text not null default '',
      bytes bytea,
      created_at timestamptz not null default now()
    );
    create table if not exists site_content (
      key text primary key,
      value text not null default '',
      updated_at timestamptz not null default now()
    );
    create table if not exists insights (
      id serial primary key,
      title text not null,
      summary text not null default '',
      url text not null,
      source text not null default 'LinkedIn',
      created_at timestamptz not null default now()
    );
  `);
  const additions = [
    "category text default ''",
    "author text default ''",
    "body text default ''",
    "status text default 'published'",
    "featured boolean default false",
    "slug text default ''",
    "seo_title text default ''",
    "seo_description text default ''",
    "publish_at timestamptz",
    "image text default ''",
  ];
  for (const column of additions) {
    await client.query(`alter table insights add column if not exists ${column}`);
  }
}

async function importLegacy(state) {
  const legacy = await pool.query("select title, summary, url, source, created_at from insights order by created_at asc");
  if (!legacy.rowCount) return state;
  const known = new Set(state.insights.map((item) => item.url));
  for (const row of legacy.rows) {
    if (!row.url || known.has(row.url)) continue;
    state.insights.push({
      id: `legacy-${crypto.randomBytes(4).toString("hex")}`,
      slug: slugify(row.title || "insight"),
      title: row.title,
      summary: row.summary || "",
      body: "",
      url: row.url,
      source: row.source || "LinkedIn",
      category: "",
      author: "",
      image: "",
      imageAlt: "",
      seoTitle: row.title,
      seoDescription: row.summary || "",
      status: "published",
      featured: false,
      publishAt: "",
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    known.add(row.url);
  }
  return state;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
}

function sslFor(connectionString) {
  if (process.env.DATABASE_SSL === "false" || connectionString.includes("sslmode=disable")) return undefined;
  const local = /@(localhost|127\.0\.0\.1)([:/]|$)/.test(connectionString);
  if (local) return undefined;
  if (connectionString.includes("sslmode=require") || process.env.DATABASE_SSL === "true" || process.env.VERCEL) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

async function initDatabase() {
  const pg = await import("pg");
  const connectionString = process.env.DATABASE_URL;
  pool = new pg.default.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 8000,
    ssl: sslFor(connectionString),
  });
  await migrate(pool);
  const existing = await pool.query("select id from cms_state where id = 'current'");
  if (existing.rowCount === 0) {
    let state = blankState();
    state = await importLegacy(state);
    await write(state);
  }
}

function initFileStore() {
  const candidates = process.env.VERCEL
    ? ["/tmp/gpp-data"]
    : [path.join(process.cwd(), "data"), "/tmp/gpp-data"];
  for (const dir of candidates) {
    if (!directoryIsWritable(dir)) continue;
    remember(dir);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(blankState()));
    return;
  }
  filePath = null;
  if (!memoryState) memoryState = blankState();
}

export function storageMode() {
  if (pool) return "postgres";
  if (filePath) return "file";
  return "memory";
}

export async function initStore() {
  if (process.env.DATABASE_URL) {
    try {
      await initDatabase();
      return;
    } catch (error) {
      console.error("Postgres unavailable; serving the built-in site content.", error.message);
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
    }
  }
  initFileStore();
}

export function getDraft() {
  return enqueue(async () => (await read()).draft);
}

export function getPublished() {
  return enqueue(async () => (await read()).published);
}

export function saveDraft(doc, role) {
  return update((state) => {
    if (!doc?.settings || !Array.isArray(doc.pages) || !Array.isArray(doc.people)) {
      throw Object.assign(new Error("Invalid document"), { status: 400 });
    }
    if (role !== "superuser") doc.secrets = state.draft.secrets;
    state.draft = doc;
    return state;
  });
}

export function publish(note) {
  return update((state) => {
    state.published = structuredClone(state.draft);
    state.revisions.unshift({
      id: `rev-${Date.now()}`,
      note: note || "Published",
      at: new Date().toISOString(),
      snapshot: state.published,
    });
    state.revisions = state.revisions.slice(0, 40);
    return state;
  });
}

export function listRevisions() {
  return enqueue(async () => (await read()).revisions.map(({ snapshot, ...meta }) => meta));
}

export function rollback(id) {
  return update((state) => {
    const revision = state.revisions.find((item) => item.id === id);
    if (!revision) throw Object.assign(new Error("Revision not found"), { status: 404 });
    state.draft = structuredClone(revision.snapshot);
    state.published = structuredClone(revision.snapshot);
    state.revisions.unshift({
      id: `rev-${Date.now()}`,
      note: `Restored ${id}`,
      at: new Date().toISOString(),
      snapshot: state.published,
    });
    state.revisions = state.revisions.slice(0, 40);
    return state;
  });
}

export function listInsights() {
  return enqueue(async () => (await read()).insights);
}

export function saveInsight(input, id) {
  return update((state) => {
    const now = new Date().toISOString();
    if (id) {
      const index = state.insights.findIndex((item) => item.id === id);
      if (index < 0) throw Object.assign(new Error("Insight not found"), { status: 404 });
      state.insights[index] = { ...state.insights[index], ...input, id, updatedAt: now };
    } else {
      const created = {
        id: `insight-${crypto.randomBytes(4).toString("hex")}`,
        createdAt: now,
        updatedAt: now,
        status: "draft",
        featured: false,
        ...input,
      };
      state.insights.unshift(created);
    }
    if (input.featured) {
      const keep = id || state.insights[0].id;
      for (const item of state.insights) item.featured = item.id === keep;
    }
    return state;
  });
}

export function deleteInsight(id) {
  return update((state) => {
    state.insights = state.insights.filter((item) => item.id !== id);
    return state;
  });
}

export async function addMedia({ filename, mime, alt, buffer }) {
  const id = `media-${crypto.randomBytes(6).toString("hex")}`;
  if (pool) {
    await pool.query(
      "insert into cms_media (id, filename, mime, alt, bytes) values ($1, $2, $3, $4, $5)",
      [id, filename, mime, alt || "", buffer]
    );
  } else {
    fs.writeFileSync(path.join(mediaDir, id), buffer);
  }
  const record = { id, filename, mime, alt: alt || "", createdAt: new Date().toISOString() };
  await update((state) => {
    state.media.push(record);
    return state;
  });
  return record;
}

export async function replaceMedia(id, { filename, mime, buffer, alt }) {
  if (pool) {
    const result = await pool.query(
      "update cms_media set filename = $2, mime = $3, bytes = $4, alt = coalesce($5, alt) where id = $1",
      [id, filename, mime, buffer, alt ?? null]
    );
    if (!result.rowCount) throw Object.assign(new Error("Media not found"), { status: 404 });
  } else {
    const file = path.join(mediaDir, id);
    if (!fs.existsSync(file)) throw Object.assign(new Error("Media not found"), { status: 404 });
    fs.writeFileSync(file, buffer);
  }
  let record = null;
  await update((state) => {
    const item = state.media.find((entry) => entry.id === id);
    if (!item) throw Object.assign(new Error("Media not found"), { status: 404 });
    item.filename = filename;
    item.mime = mime;
    if (typeof alt === "string") item.alt = alt;
    record = item;
    return state;
  });
  return record;
}

export function updateMedia(id, alt) {
  return update((state) => {
    const item = state.media.find((entry) => entry.id === id);
    if (!item) throw Object.assign(new Error("Media not found"), { status: 404 });
    item.alt = alt;
    return state;
  });
}

export function listMedia() {
  return enqueue(async () => (await read()).media);
}

export async function readMedia(id) {
  const state = await enqueue(() => read());
  const meta = state.media.find((item) => item.id === id);
  if (!meta) return null;
  if (pool) {
    const result = await pool.query("select bytes, mime, alt from cms_media where id = $1", [id]);
    if (!result.rowCount) return null;
    return { ...meta, buffer: result.rows[0].bytes, mime: result.rows[0].mime };
  }
  const file = path.join(mediaDir, id);
  if (!fs.existsSync(file)) return null;
  return { ...meta, buffer: fs.readFileSync(file) };
}

export function listUsers() {
  return enqueue(async () => (await read()).users.map(({ passwordHash, ...user }) => user));
}

export function addUser(user) {
  return update((state) => {
    if (state.users.some((item) => item.email === user.email)) {
      throw Object.assign(new Error("A user with that email already exists"), { status: 409 });
    }
    state.users.push(user);
    return state;
  });
}

export function deleteUser(id) {
  return update((state) => {
    state.users = state.users.filter((item) => item.id !== id);
    return state;
  });
}

export function findUser(email) {
  return enqueue(async () => (await read()).users.find((item) => item.email === email) || null);
}

export function addSubmission(entry) {
  return update((state) => {
    state.submissions.unshift({ id: `sub-${Date.now()}`, at: new Date().toISOString(), ...entry });
    state.submissions = state.submissions.slice(0, 200);
    return state;
  });
}

export function listSubmissions() {
  return enqueue(async () => (await read()).submissions);
}

export function getRecipient(doc) {
  const fromEnv = (process.env.CONTACT_TO_EMAILS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const stored = doc?.secrets?.recipientEmail || doc?.settings?.contact?.email;
  return [stored || "enquiries@globalplacepartners.com"];
}
