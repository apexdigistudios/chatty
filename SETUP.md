# Gist me — Setup (Step 07 · Supabase backend)

Mobile-first social network for Ghanaian SHS students. Next.js App Router,
TypeScript, Tailwind CSS v4, Motion, Zustand, **Supabase** (Postgres, Auth,
Realtime), and Cloudflare R2 for media storage.
There is no mock data: every screen reads and writes the live database.

---

## 1 · Install

```bash
npm install
```

## 2 · Database — pick ONE path

### A · Existing project (`wemdjlyxorixmknfruam`) — **this is the one in `.env`**

The project already has `schools`, `profiles`, `posts`, `comments`, `likes`,
`confessions`, `reports`, and the `public_confessions` view, with real student
data in it. **Do not run `schema.sql`
here.** Instead paste `migration-step7.sql` into **SQL Editor → New query** and run
it. It is additive and idempotent; it adds:

- `is_school_moderator()` and `claim_school()` (RPC)
- the founder→moderator trigger, plus a back-fill for existing founders
- `confession_reactions` (the reaction bar hides itself until this exists)
- campus-scoped moderator policies on `posts`, `comments`, `reports`
- no seeded school communities; students add and select communities during signup

The app works against the live project **before** the migration too — reactions
and "Claim & moderate" are the only features that wait for it.

### A9 · User-created school communities and logos

Run `supabase/migrations/clean_and_deduplicate_schools.sql` in the SQL Editor.
It clears existing school image URLs without deleting communities, adds case- and
whitespace-insensitive name uniqueness, and provisions signup-time community creation.
The migration also creates legacy Supabase Storage policies; media uploads now use
Cloudflare R2. If normalized duplicate names
already exist, the migration stops and lists them so their records can be merged
without silently reassigning students or posts. Apply this migration before
deploying the updated school queries or signup flow.

### A2 · Applying Step 9 (sub-communities + trending + school lock)

Run `migration-step9.sql` in the SQL Editor **after** `migration-step7.sql`. It adds
`school_groups`, `group_memberships`, `posts.group_id`, the `post_like_counts` view
used by Smart Trending (≥ 1,000 likes), author soft-delete permissions and the
permanent SHS-identity lock trigger. The app degrades gracefully until it is applied:
the Groups tab shows an empty state, club creation explains the migration, and
Trending falls back to the highest-liked gists.

### A3 · Applying Step 10 (video + Shoutout Post Office)

Run `migration-step10.sql` after Step 9. It adds `posts.media_type`,
`posts.video_duration_seconds`, optional `profiles.full_name` and
`profiles.class_form`, and the `shoutouts` table with participant RLS and
delivery-stage timestamps. Videos work even before the migration (media type is
inferred from the file extension); profile identity fields and postal mail need it.

### A4 · Step 11 (Shoutout Wizard)

No new database objects are required. The full-screen postal wizard lives at
`/shoutouts/create`; `/shoutouts` is now the Inbox / Outbox hub. Profile deep
links (`/shoutouts?to=<userId>`) are forwarded into the wizard automatically.
Envelope themes and wax seals are client-side presentation only, stored in the
existing `shoutouts.envelope_theme` and `shoutouts.stamp` columns.

### A5 · Applying Step 12 (Real-Time Notifications)

Run `migration-step12.sql` after Step 10. It adds `likes` to the `supabase_realtime`
publication (posts, comments and shoutouts are already published) so the notification
centre can listen for live INSERTs.

No new tables are required: the notification feed is a projection over `likes`,
`comments`, `shoutouts` and `posts`, scoped by the RLS policies you already have.
Read/unread receipts are stored on the device in `localStorage`, so a future
`notification_reads` table can replace them without changing any caller.

### A6 · Applying Step 13 (Profile Cover Photos)

Run `migration-step13.sql` after Step 12. It adds `profiles.cover_url` for student
cover photos. Cover photos are compressed on-device and uploaded to Cloudflare R2.

### Flexible student usernames

Run `supabase/migrations/username_all_characters.sql` after the core profile
migrations. It allows usernames from 3 to 24 characters with any character type
and keeps the signup trigger from stripping symbols, spaces, or emoji.

### A7 · Spotlight and blocked-user feeds

Run `supabase/migrations/spotlight_and_reports.sql` and
`supabase/migrations/user_blocks.sql` in the SQL Editor. Deploy the Edge Functions
`init-spotlight-payment` and `moderate-spotlight`, and configure the server secrets
`PAYSTACK_SECRET_KEY`, `OPENAI_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
Spotlight package prices are validated server-side in pesewas:
2 hours = GHS 3, 1 day = GHS 8, 2 days = GHS 14, and 7 days = GHS 35.

### A8 · Community reporting and safety management

Run `supabase/migrations/safety_reporting.sql` after the Spotlight migration.
It adds hidden-post state, the 72-hour / serious-report threshold trigger,
creator safety notifications, and admin-only safety queue reads. Deploy
`supabase/functions/safety-admin-action` as well. Safety management is limited
to users with the existing `admin_roles.role = 'global_admin'` role; the
dashboard supports report dismissal/restoration, recoverable post removal, and
account suspension until manually lifted. Refunds are not initiated by the
dashboard and must be processed manually.

### A10 · Comment threads, likes, and confession comments

Run `supabase/migrations/comment_threads.sql` after the existing schema migrations.
It adds nested replies and per-comment likes to post comments, plus an anonymous-
safe comments table and likes for approved confessions. New replies must remain in
the same post or confession thread, and confession authors remain hidden.

### A11 · Server-rendered social share metadata

The Next.js App Router metadata generators for `/posts/:id` and
`/confessions/:id` query Supabase on the server and return native Open Graph and
Twitter metadata. Configure `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in the deployment environment. The share dialog
can also export a customizable PNG card in the browser.

### A12 · Automated media moderation

Run `supabase/migrations/automated_media_moderation.sql` after all migrations that
create or update `posts` and `post_media` policies. It routes post creation
through the authenticated server API and disables direct client inserts so the
moderation check cannot be skipped.
Set the server-only `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` values.
Optionally set `VIDEO_MODERATION_ENDPOINT` and `VIDEO_MODERATION_TOKEN` to use an
external video moderation service. The server sends the raw video bytes as a POST
body, with the bearer token, video content type, and `X-File-Name` header. The
service must return JSON with `flagged: boolean`, `safe: boolean`, or a
`decision` of `safe`, `approved`, `flagged`, or `rejected`; optional `categories`
must be a map of boolean flags. External-service errors or invalid responses
block the upload. If the external service is not configured, install FFmpeg and
FFprobe on the Node.js server or set `FFMPEG_PATH` and `FFPROBE_PATH`. Uploaded
videos are sampled at 25%, 50%, and 75%; if moderation is unavailable, the upload
is blocked rather than skipped. Flagged media is rejected before it reaches R2.
Global admins can review flagged entries in `automated_moderation_audit`.

### B · Fresh project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the whole of `schema.sql`, and run it.
   It is idempotent — safe to re-run. It creates:
   - tables: `schools`, `profiles`, `posts`, `comments`, `comment_likes`, `likes`,
     `confessions`, `confession_comments`, `confession_comment_likes`,
     `confession_reactions`, `reports`, `admin_roles`
   - RLS on every table with row-scoped policies
   - the `public_confessions` view (anonymity enforced in the DB)
   - triggers: profile-on-signup, founder-becomes-moderator
   - RPC: `claim_school(uuid)`
   - a legacy public `letsgist-media` Storage bucket + policies (not used for app uploads)
   - a user-created school community directory with optional R2-hosted school logos
3. **Auth → Providers → Email**: enabled by default. For a frictionless local dev
   loop, turn **off** "Confirm email" so sign-up creates a session immediately.
4. For Spotlight, reports, and account safety actions, also run
   `spotlight_and_reports.sql`, `user_blocks.sql`, and then `safety_reporting.sql`
   from `supabase/migrations/`, and deploy `init-spotlight-payment`,
   `moderate-spotlight`, and `safety-admin-action`.

## 3 · Configure the app

`.env` is already filled in for the existing project (and is git-ignored).
For a different project, copy `.env.example` and fill in from
**Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
CLOUDFLARE_R2_BUCKET_NAME=<bucket>
CLOUDFLARE_R2_ACCESS_KEY_ID=<R2 access key>
CLOUDFLARE_R2_SECRET_ACCESS_KEY=<R2 secret key>
CLOUDFLARE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

Keep the R2 access key and secret server-only. Configure the bucket's public
custom domain as `media.gistme.online`. The app serves all uploaded media through
`https://media.gistme.online`. After applying the
existing seed-media migrations, run `supabase/migrations/cloudflare_r2_seed_media.sql`
to allow the seed-post RPC to accept R2 object URLs.
For the one-time asset copy, set the Supabase S3 endpoint, region and credentials,
and set `SUPABASE_BUCKET_NAMES` to the exact three source bucket names (comma-separated).
Then run `npm run migrate:r2`; the script copies each bucket under a matching R2
prefix in the single destination bucket and leaves the source buckets unchanged.
After the copy succeeds, run
`supabase/migrations/migrate_public_media_urls_to_r2.sql` in the Supabase SQL Editor
to rewrite persisted public Storage URLs. It updates profile avatars and covers,
school crests and logos, post and confession media, and synthetic-profile avatars.

Until the Supabase variables exist the app renders a setup screen instead of the feed.

> Schema contract the client expects (matches the live project): `schools.school_type`
> is lowercase (`public` / `private` / `mission` / `technical`); short display names are
> derived client-side from `schools.name`; `posts.media_url` holds a single image.

```bash
npm run dev
```

## 4 · Make yourself a Global Admin

Sign up in the app, then run in the SQL Editor:

```sql
insert into public.admin_roles (user_id, role)
select id, 'global_admin' from public.profiles where username = 'your_username'
on conflict do nothing;
```

Reload — **Global admin** appears in the sidebar and account menu (`/admin`).

## 5 · Moderation model

| Role | How you get it | What you can do |
| --- | --- | --- |
| Student | Sign up | Post, like, comment, react, report, submit confessions |
| **School moderator** | Found a community (`schools.creator_id`), claim a seeded one, or be added to `admin_roles` | Flag / remove posts & delete comments **tagged to your school**, resolve reports routed to your school — via **Manage Community** on `/schools/:id` |
| **Global admin** | `admin_roles.role = 'global_admin'` | Approve / reject anonymous confessions, resolve all reports, moderate anything |

Routing: reports on posts/comments carry the post's `school_id` and go to that
school's moderators; reports on confessions always go to the global queue.

## 6 · Project structure

```
app/                         # Next.js App Router routes and layouts
components/                  # Shared UI, navigation, and feature components
context/AuthContext.tsx      # session, profile, roles
hooks/useModeration.ts       # canModerate(schoolId)
lib/supabase.ts              # Client, env guard, error helpers
lib/{time,media}.ts          # timeAgo, default avatar, crest colours
services/                    # Supabase data access and integrations
store/gistStore.ts           # Zustand cache over the services
types/models.ts              # DB enums, row types, UI view models
views/                       # Client-side page content rendered by app routes
```

## 7 · Scripts

| Command           | Purpose                    |
| ----------------- | -------------------------- |
| `npm run dev`     | Next.js development server |
| `npm run build`   | Production App Router build |
| `npm start`       | Run the production server  |
