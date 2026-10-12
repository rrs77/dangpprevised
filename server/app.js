import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { cookieName, cookieOptions, hashPassword, readToken, safeEqual, signToken, verifyPassword } from "./auth.js";
import {
  addMedia,
  addSubmission,
  addUser,
  deleteInsight,
  deleteUser,
  findUser,
  getDraft,
  getPublished,
  getRecipient,
  initStore,
  listInsights,
  listMedia,
  listRevisions,
  listSubmissions,
  listUsers,
  publish,
  readMedia,
  replaceMedia,
  rollback,
  saveDraft,
  saveInsight,
  toPublic,
  updateMedia,
  visibleInsight,
} from "./store.js";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
    cb(ok ? null : new Error("Only JPEG, PNG, WebP or GIF images can be uploaded"), ok);
  },
});

const hits = new Map();
let ready;

export function start() {
  if (!ready) ready = initStore();
  return ready;
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

function requireUser(req, res, next) {
  const session = readToken(req.cookies?.[cookieName()]);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  req.user = session;
  next();
}

function requireSuper(req, res, next) {
  if (req.user?.role !== "superuser") return res.status(403).json({ error: "Superuser permission required" });
  next();
}

function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const recent = (hits.get(ip) || []).filter((time) => now - time < windowMs);
  if (recent.length >= 5) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const data = await response.json();
  return Boolean(data?.success);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

app.set("trust proxy", 1);
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(async (_req, _res, next) => {
  try {
    await start();
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (_req, res) => {
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
  });
});

app.get("/api/content", async (_req, res, next) => {
  try {
    res.json(toPublic(await getPublished()));
  } catch (error) {
    next(error);
  }
});

app.get("/api/insights", async (_req, res, next) => {
  try {
    const rows = await listInsights();
    res.json(rows.filter((item) => visibleInsight(item)));
  } catch (error) {
    next(error);
  }
});

app.get("/api/media/:id", async (req, res, next) => {
  try {
    const media = await readMedia(req.params.id);
    if (!media) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", media.mime || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(media.buffer);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", async (req, res, next) => {
  try {
    const { password, email } = req.body || {};
    if (password && process.env.ADMIN_PASSWORD && safeEqual(password, process.env.ADMIN_PASSWORD)) {
      res.cookie(cookieName(), signToken({ role: "superuser", email: "superuser" }), cookieOptions());
      return res.json({ success: true, role: "superuser" });
    }
    if (email && password) {
      const user = await findUser(String(email).trim().toLowerCase());
      if (user && verifyPassword(password, user.passwordHash)) {
        res.cookie(cookieName(), signToken({ role: user.role, email: user.email }), cookieOptions());
        return res.json({ success: true, role: user.role });
      }
    }
    res.status(401).json({ error: "Invalid password" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie(cookieName(), { path: "/" });
  res.json({ success: true });
});

app.get("/api/admin/session", (req, res) => {
  const session = readToken(req.cookies?.[cookieName()]);
  res.json({ authenticated: Boolean(session), role: session?.role || null, email: session?.email || null });
});

app.get("/api/admin/draft", requireUser, async (_req, res, next) => {
  try {
    const draft = await getDraft();
    if (_req.user.role !== "superuser") {
      const copy = structuredClone(draft);
      delete copy.secrets;
      return res.json(copy);
    }
    res.json(draft);
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/draft", requireUser, async (req, res, next) => {
  try {
    await saveDraft(req.body, req.user.role);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/publish", requireUser, async (req, res, next) => {
  try {
    if (req.body?.document) await saveDraft(req.body.document, req.user.role);
    const revision = (await publish(req.body?.note || "Published")).revisions[0];
    res.json({ success: true, revision: { id: revision.id, note: revision.note, at: revision.at } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/revisions", requireUser, async (_req, res, next) => {
  try {
    res.json(await listRevisions());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/rollback", requireUser, requireSuper, async (req, res, next) => {
  try {
    await rollback(req.body?.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/insights", requireUser, async (_req, res, next) => {
  try {
    res.json(await listInsights());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/insights", requireUser, async (req, res, next) => {
  try {
    const saved = await saveInsight(cleanInsight(req.body));
    res.json(saved.insights[0]);
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/insights/:id", requireUser, async (req, res, next) => {
  try {
    const saved = await saveInsight(cleanInsight(req.body), req.params.id);
    res.json(saved.insights.find((item) => item.id === req.params.id));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/insights/:id", requireUser, async (req, res, next) => {
  try {
    await deleteInsight(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/media", requireUser, async (_req, res, next) => {
  try {
    res.json(await listMedia());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/upload", requireUser, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const record = await addMedia({
      filename: req.file.originalname,
      mime: req.file.mimetype,
      alt: req.body.alt || "",
      buffer: req.file.buffer,
    });
    res.json({ ...record, url: `/api/media/${record.id}` });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/media/:id", requireUser, upload.single("image"), async (req, res, next) => {
  try {
    if (typeof req.body.alt === "string" && !req.file) {
      await updateMedia(req.params.id, req.body.alt);
      return res.json({ success: true });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const record = await replaceMedia(req.params.id, {
      filename: req.file.originalname,
      mime: req.file.mimetype,
      buffer: req.file.buffer,
      alt: req.body.alt,
    });
    res.json({ ...record, url: `/api/media/${record.id}` });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requireUser, requireSuper, async (_req, res, next) => {
  try {
    res.json(await listUsers());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users", requireUser, requireSuper, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = req.body?.role === "superuser" ? "superuser" : "editor";
    if (!email.includes("@") || password.length < 8) {
      return res.status(400).json({ error: "Email and a password of at least 8 characters are required" });
    }
    await addUser({
      id: `user-${Date.now()}`,
      name: String(req.body?.name || email),
      email,
      role,
      passwordHash: hashPassword(password),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id", requireUser, requireSuper, async (req, res, next) => {
  try {
    await deleteUser(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/submissions", requireUser, requireSuper, async (_req, res, next) => {
  try {
    res.json(await listSubmissions());
  } catch (error) {
    next(error);
  }
});

app.post("/api/contact", async (req, res, next) => {
  try {
    const { name, email, organisation, project, website, captchaToken, consent } = req.body || {};
    if (typeof website === "string" && website.trim() !== "") return res.json({ success: true });
    const errors = [];
    if (typeof name !== "string" || !name.trim()) errors.push("Name is required");
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push("A valid email is required");
    if (typeof organisation !== "string" || !organisation.trim()) errors.push("Organisation is required");
    if (typeof project !== "string" || !project.trim()) errors.push("A message is required");
    if (consent !== true) errors.push("Consent is required");
    if (typeof captchaToken !== "string" || !captchaToken.trim()) errors.push("Verification is required");
    if (errors.length) return res.status(400).json({ error: "Invalid submission", details: errors });

    const ip = clientIp(req);
    if (!(await verifyTurnstile(captchaToken, ip))) {
      return res.status(400).json({ error: "Verification failed. Please try again." });
    }
    if (!rateLimit(ip)) return res.status(429).json({ error: "Too many submissions. Please try again later." });

    const published = await getPublished();
    const recipients = getRecipient(published);
    const safeName = name.trim();
    const safeEmail = email.trim();
    const safeOrg = organisation.trim();
    const safeProject = project.trim();
    const submission = { name: safeName, email: safeEmail, organisation: safeOrg, message: safeProject, delivered: "stored" };

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const from = process.env.RESEND_FROM_EMAIL || "Global Place Partners <onboarding@resend.dev>";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: recipients,
          reply_to: safeEmail,
          subject: `New website enquiry from ${safeName}`,
          text: `Name: ${safeName}\nEmail: ${safeEmail}\nOrganisation: ${safeOrg}\n\nMessage:\n${safeProject}`,
          html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222"><h2>New website enquiry</h2><p><strong>Name:</strong> ${escapeHtml(safeName)}</p><p><strong>Email:</strong> ${escapeHtml(safeEmail)}</p><p><strong>Organisation:</strong> ${escapeHtml(safeOrg)}</p><p style="white-space:pre-wrap">${escapeHtml(safeProject)}</p></div>`,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("Resend error", result);
        return res.status(502).json({ error: "Failed to send message" });
      }
      submission.delivered = "email";
    }

    await addSubmission(submission);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

function cleanInsight(body = {}) {
  const status = ["draft", "scheduled", "published"].includes(body.status) ? body.status : "draft";
  return {
    title: String(body.title || "").trim(),
    summary: String(body.summary || ""),
    body: String(body.body || ""),
    url: String(body.url || ""),
    source: String(body.source || "Global Place Partners"),
    category: String(body.category || ""),
    author: String(body.author || ""),
    image: String(body.image || ""),
    imageAlt: String(body.imageAlt || ""),
    seoTitle: String(body.seoTitle || ""),
    seoDescription: String(body.seoDescription || ""),
    slug: String(body.slug || "").trim(),
    status,
    featured: Boolean(body.featured),
    publishAt: body.publishAt ? String(body.publishAt) : "",
  };
}

if (process.env.SERVE_STATIC === "1") {
  const dist = path.join(process.cwd(), "dist");
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    if (req.path === "/services" || req.path === "/services/") return res.redirect(301, "/our-work");
    if (req.path === "/team" || req.path === "/team/") return res.redirect(301, "/people");
    const file = path.join(dist, "index.html");
    if (!fs.existsSync(file)) return res.status(404).send("Build the site before serving it.");
    res.sendFile(file);
  });
}

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: error.message || "Server error" });
});

export default app;
