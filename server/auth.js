import crypto from "node:crypto";

const COOKIE = "admin_token";
const MAX_AGE = 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required");
  return value;
}

export function cookieName() {
  return COOKIE;
}

export function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("hex");
  return `${body}.${signature}`;
}

export function readToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data?.iat || Date.now() - data.iat > MAX_AGE) return null;
    if (data.role !== "superuser" && data.role !== "editor") return null;
    return data;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    sameSite: "lax",
    path: "/",
  };
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const next = crypto.scryptSync(String(password), salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return crypto.timingSafeEqual(next, prev);
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
