# Gist me — Next.js App Router

The existing React views, components, Supabase services, hooks, and CSS-first
Tailwind 4 theme are organized under the Next.js App Router.

## Run locally

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to your public Supabase project values.
2. Run `npm install`.
3. Run `npm run dev`, then open `http://localhost:3000`.

`npm run build` runs the production App Router build. Shared post and confession
pages query Supabase server-side when generating Open Graph and Twitter metadata.
