# Global Place Partners

Maintainable source for the Global Place Partners website. The previous repository history contained only a built Vercel deploy (Vite assets and a bundled API), so this tree is a reconstruction of that stack: a React SPA, an Express API, Cloudflare Turnstile, Resend for the enquiry form, and content stored for the admin.

Public pages read published content from the API. The admin at `/admin` edits a draft, previews it at `/preview`, and publishes it. Without `DATABASE_URL`, content is stored in `data/cms.json` (not committed). With `DATABASE_URL`, the same document is stored in Postgres and existing `site_content` and `insights` tables are left in place; legacy insight rows are copied in on first run.

```bash
cp .env.example .env
npm install
npm run dev
```

`SESSION_SECRET` and `ADMIN_PASSWORD` are required. See `.env.example` for Turnstile, Resend, and Postgres.

Do not deploy this tree to the live domain until the items in the relaunch notes are confirmed.
