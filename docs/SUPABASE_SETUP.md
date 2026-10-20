# FieldLedger cloud setup (Supabase): sign-in, sync, web link and updates

This guide sets up three things, in about 20 minutes:

1. **Sign-in and sync** with Supabase, so the same records appear on every phone and on the web.
2. **A public web link** for FieldLedger, through GitHub Pages.
3. **The update channel** that the Android app checks, which fixes "Could not check for updates".

None of this needs programming. Steps 1–4 happen in the browser. Step 5 is optional: it means people only ever see email and password.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> and sign up. The free plan is enough.
2. Click **New project**.
   - Name it `fieldledger`.
   - Set a strong database password and save it somewhere safe.
   - Pick the region closest to you (e.g. *Mumbai / ap-south-1*).
3. Wait about 2 minutes until the project is ready.

> On the free plan, Supabase pauses a project after about a week with no use. Opening the dashboard and clicking **Restore** brings it back. Records saved on phones while it is paused stay on the phones and sync once it is back.

## 2. Create the tables (copy and paste)

In the Supabase dashboard, open **SQL Editor → New query**. Paste everything below and click **Run**.

```sql
-- One row per daily entry (Brinjal or Muskmelon). The whole entry is stored as JSON in "data".
create table if not exists public.ledger_entries (
  user_id           uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id                text        not null,
  product           text        not null check (product in ('brinjal', 'muskmelon')),
  entry_date        date,
  data              jsonb       not null default '{}'::jsonb,
  deleted           boolean     not null default false,
  updated_at        timestamptz not null default now(),          -- when the farmer saved it (from the phone)
  server_updated_at timestamptz not null default clock_timestamp(), -- when the server received it (used for sync)
  primary key (user_id, id)
);
create index if not exists ledger_entries_sync_idx on public.ledger_entries (user_id, server_updated_at);

-- One row per account: brinjal types, default wages, farm profile.
create table if not exists public.ledger_settings (
  user_id    uuid        primary key default auth.uid() references auth.users(id) on delete cascade,
  settings   jsonb       not null default '{}'::jsonb,
  profile    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Stamp every insert/update with the server time so phones can fetch "what changed since last time".
create or replace function public.ledger_touch() returns trigger language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists ledger_entries_touch on public.ledger_entries;
create trigger ledger_entries_touch before insert or update on public.ledger_entries
  for each row execute function public.ledger_touch();

-- Row-level security: every account sees and changes ONLY its own rows.
alter table public.ledger_entries  enable row level security;
alter table public.ledger_settings enable row level security;

drop policy if exists "own entries"  on public.ledger_entries;
drop policy if exists "own settings" on public.ledger_settings;
create policy "own entries"  on public.ledger_entries  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own settings" on public.ledger_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
```

Check that it worked: **Table Editor** lists `ledger_entries` and `ledger_settings`, each showing an "RLS enabled" badge.

## 3. Turn on email sign-in

Open **Authentication → Sign In / Providers → Email**.

- **Enable Email provider:** on.
- **Confirm email:**
  - **On (recommended):** a new account must click the link in the confirmation email before signing in.
  - **Off:** "Create account" signs in immediately. This is simpler for a small family business.
- Set a **minimum password length** of 6 or more.

Then open **Authentication → URL Configuration**:

- **Site URL:** your web link from step 4, e.g. `https://tharun1343.github.io/fieldledger-releases/`.
  - Confirmation and **Forgot password** emails open this page.
  - FieldLedger shows **Set a new password** there automatically.
- **Redirect URLs:** add the same address.

## 4. Publish the web link and the update channel (GitHub)

You need one **public** repository that holds only the app files, never your data. A public repo is required because phones download updates from it without signing in.

1. On GitHub, click **New repository**.
   - Name: `fieldledger-releases`
   - Visibility: **Public**
   - Do not add a README.
2. Let Claude push to it.
   - If GitHub refuses, open <https://claude.ai/connect-github> and give the Claude app access to the new repository.
   - Claude then pushes these files:
     - `index.html` (the web app)
     - `FieldLedger-<version>.apk`
     - `version.json` (what the app's update check reads)
     - `.nojekyll`
3. In the repository, open **Settings → Pages**.
   - **Source:** *Deploy from a branch*.
   - **Branch:** `main`, folder `/ (root)`.
   - Click **Save**.
   - After about a minute your web link is live at `https://tharun1343.github.io/fieldledger-releases/`.

The Android app checks for updates at
`https://raw.githubusercontent.com/tharun1343/fieldledger-releases/main/version.json`.
Once that file exists, **More → App updates → Check for updates** works.

> The claude.ai link can't sign in. claude.ai pages are not allowed to contact other servers. Use the GitHub Pages link or the Android app for sign-in and sync.

## 5. Connect the app to your project

Open **Project Settings → API** (also called *Data API* or *API Keys*). You need two values:

- **Project URL**, e.g. `https://abcd1234.supabase.co`
- **anon / public key**, a long text starting `eyJ…`. On newer projects it is the **publishable** key, starting `sb_publishable_…`.

**Never** use the `service_role` or *secret* key in the app. It bypasses all security.

There are two ways to connect:

- **Option A: in the app.** On first launch the sign-in screen asks for *Project URL* and *Anon public key*. Paste them and tap **Connect**. Do this once per phone or browser.
- **Option B: built into the app (recommended).** Then nobody sees those fields; they only see email and password.
  - Send the Project URL and anon key to Claude, which rebuilds the APK and web app with them built in. The anon key is safe to share.
  - Or run it yourself:

    ```bash
    python3 scripts/configure-cloud.py https://abcd1234.supabase.co <anon-public-key>
    android/build-apk.sh && python3 scripts/build-web.py
    ```

## 6. Daily use

1. Open FieldLedger, then tap **Create account** with your email and a password, or **Sign in**.
2. On the second phone, sign in with the **same** email and password. The records download automatically.
3. Every save is uploaded straight away. Without internet, it is saved on the phone and uploaded later.

| Dot on the account button | Meaning |
|---|---|
| 🟢 Green | Online and everything is synced |
| 🟠 Orange | Syncing, changes waiting to upload, or not signed in (this phone only) |
| 🔴 Red | Offline. Entries are still saved on the phone and sync when the connection returns |

Tap the account button to see the email, last sync time and waiting changes, and to **Sync now** or **Sign out**.

**How sync behaves:**
- **Conflicts:** if two phones edit the *same* day, the newest save wins.
- **Sample data:** the demo records are never uploaded. They are removed the first time you sign in.
- **Signing out:** removes this phone's copy. Your records stay in your account.

## 7. Backups and safety

- **Supabase backups:** Supabase keeps daily backups on paid plans. On the free plan, keep using **More → Export backup** now and then; the JSON file restores everything.
- **Your data in the dashboard:** see it in **Table Editor → ledger_entries**. Each row's `data` column holds the full entry.
- **Removing an account:** **Authentication → Users → ⋯ → Delete user** removes that account and, through `on delete cascade`, all its rows.

## Troubleshooting

| Message | Fix |
|---|---|
| "Project URL must look like https://xxxx.supabase.co" | Copy the URL exactly from Project Settings → API (no trailing path). |
| "Invalid login credentials" | Wrong password, or the email has not been confirmed yet (step 3). |
| "Email not confirmed" | Open the confirmation email, or turn *Confirm email* off. |
| Orange dot with "Sync problem: relation … does not exist" | Step 2 was not run, or was run in a different project. |
| Orange dot with "new row violates row-level security policy" | Re-run the policy part of step 2. |
| "No update has been published at the update address yet" | Step 4 is not done, or `version.json` is missing from the public repo. |
| "Could not reach the update server" | The phone has no internet, or the repository is not public. |
