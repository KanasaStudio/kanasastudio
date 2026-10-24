# Kanasa Studio × Dhandang Studio — website

Static site (no build step): HTML + CSS + ES modules, Supabase for Postgres, Auth and Storage.
Deploy by pushing to GitHub and enabling **Pages** (branch `main`, root). `.nojekyll` is included.

## Structure
- `index.html` — public site (hash routes: `#/services`, `#/portfolio`, `#/order`, `#/track` …)
- `admin/index.html` — admin panel (`/admin/`), requires a Supabase user with a row in `user_roles`
- `css/tokens.css` (design tokens) · `base.css` · `site.css` · `admin.css`
- `js/` — `app.js` (public), `admin*.js`, `theme.js`, `cart.js`, `config.js` (URL + publishable key only)
- `supabase/migrations/` — versioned SQL, already applied to project `geroipkbzmbkigzwjdok`
- `supabase/provision_admin.sql` — create the first owner (run once, by hand)
- `supabase/rollback/DANGEROUS_drop_all.sql` — manual rollback, destroys data; back up first

## First-time admin setup
1. Supabase Dashboard → Authentication → Users → **Add user** (auto-confirm).
2. Authentication → Providers → Email → turn **off** "Allow new users to sign up".
3. Edit the email in `supabase/provision_admin.sql` and run it in the SQL editor.
4. Open `/admin/` and sign in. Set real prices under *Services & pricing*, then **Publish** in *Site editor*.

## Security model
- Only the publishable key is in the browser. Never commit the `service_role` / secret key.
- RLS is on for every table; table grants are explicit. Visitors read only published services/portfolio/settings.
- Orders are created only through `create_order()` (server-side pricing, validation, rate limit, idempotency).
  Tracking uses reference + a secret token (stored hashed). Private files live in the `order-attachments` bucket.
- Admin operations require `is_admin()` in the database; hiding routes is not relied upon.

## Not implemented yet (deliberately)
Online payment, email/Discord notifications, client accounts/portal, delivery-file workflow, bot challenge (e.g. Turnstile via Edge Function),
and per-route SEO crawlability (hash routing). None of these are claimed in the UI.
