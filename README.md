# Gist me — Next.js App Router

The existing React views, components, Supabase services, hooks, and CSS-first
Tailwind 4 theme are organized under the Next.js App Router.

## Run locally

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to your public Supabase project values.
2. Set `SUPABASE_SERVICE_ROLE_KEY` and `PAYSTACK_SECRET_KEY` in the server
   environment for verified subscriptions. Keep both keys private and never use
   a `NEXT_PUBLIC_` prefix.
3. Configure Cloudflare R2 using the variables in `.env.example`. The access key
   and secret must remain server-only; expose the bucket through its public
   custom domain for media URLs.
4. Apply `supabase/migrations/profile_avatar_storage_policies.sql`,
   `supabase/migrations/verified_subscriptions.sql`, and
   `supabase/migrations/username_all_characters.sql` to the Supabase project.
   After the seed-media migrations are applied, also run
   `supabase/migrations/cloudflare_r2_seed_media.sql`.
5. Run `npm install`.
6. Run `npm run dev`, then open `http://localhost:3000`.

`npm run build` runs the production App Router build. Shared post and confession
pages query Supabase server-side when generating Open Graph and Twitter metadata.
Students can start verification at `/get-verified`; Paystack transactions are
verified on the server before the subscription and profile are activated.
