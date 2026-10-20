# FieldLedger setup: 6-digit email code sign-in, sync, web link and app updates

FieldLedger signs people in with a **6-digit code sent by email**. There are no passwords: a new email address gets its account created by its first code. Records sync through your Supabase project.

The web app, the Android APK and the update file are all published from **this one repository** (`tharun1343/Field_ledger_Surya`).

Your progress so far:

| Step | Status |
|---|---|
| 1. Supabase project + SQL tables | ✅ Done. **No SQL changes are needed** for code sign-in. |
| 2. Custom SMTP (email sending) | ✅ Done |
| 3. Switch emails from links to 6-digit codes | ⬜ Below |
| 4. Make the repo public + turn on GitHub Pages | ⬜ Below |
| 5. Connect the app to your project | ✅ Done (built into the app) |
| 7. Storage bucket for bill photos (optional, new in 2.5) | ⬜ Below |

---

## 3. Switch Supabase emails to 6-digit codes

All of this is in the Supabase dashboard of your project.

### 3a. Email provider settings
Open **Authentication → Sign In / Providers → Email**:

| Setting | Value |
|---|---|
| Enable Email provider | **On** |
| Confirm email | **On**. Typing the code confirms the email, so nothing extra is needed. |
| Email OTP Length | **6** |
| Email OTP Expiration | **600** seconds (10 minutes) |

Click **Save**. Leave password settings as they are; FieldLedger doesn't use passwords.

### 3b. Put the code in the emails
Open **Authentication → Emails → Templates**. Edit **two** templates, because Supabase uses a different one for brand-new and existing users:

| Template | When it is sent |
|---|---|
| **Confirm signup** | The very first code for a new email address |
| **Magic Link** | Every later sign-in |

For each one:
1. Replace the body with the HTML below. `{{ .Token }}` is where Supabase inserts the 6-digit code.
2. Set the **subject** to `Your FieldLedger code`.
3. Click **Save**.

```html
<h2>Your FieldLedger sign-in code</h2>
<p>Enter this code in the FieldLedger app:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>The code expires in 10 minutes. If you did not ask for it, you can ignore this email.</p>
```

> **The link is optional.** You can also keep the old link (`{{ .ConfirmationURL }}`) in the email. If someone taps it instead of typing the code, the web link signs them in as well. Codes alone are simpler, especially on phones.

### 3c. Sender and rate limits
- **Authentication → Emails → SMTP Settings:** confirm that the **sender email** and **sender name** (e.g. `FieldLedger`) match your SMTP account. Your SMTP host and password are already set.
- **Authentication → Rate Limits:**
  - **Emails sent per hour:** with custom SMTP you can raise it, e.g. to **60–100**.
  - **OTP / magic link interval per user:** leave at **60 seconds**. The app's "Resend code" button waits 60 seconds to match.

### 3d. Site URL
Open **Authentication → URL Configuration**:
- **Site URL:** `https://tharun1343.github.io/Field_ledger_Surya/`
- **Redirect URLs:** add the same address.

## 4. Publish from this repository (public)

1. **Make the repo public.** Open GitHub → `Field_ledger_Surya` → **Settings → General**, scroll to **Danger Zone → Change repository visibility → Make public**, then confirm.
   - Check it worked: the repo page shows a **Public** badge next to its name.
   - *When I last checked, GitHub still reported this repo as private.*
2. **Turn on GitHub Pages.** Open **Settings → Pages**:
   - **Source:** *Deploy from a branch*
   - **Branch:** `claude/magical-darwin-k0wakh` (or `main` if you rename it), folder **`/ (root)`**
   - Click **Save**.
   - After 1–2 minutes the web app is live at **https://tharun1343.github.io/Field_ledger_Surya/**.

What is published from this repository:

| File | Used for |
|---|---|
| `index.html` | The web app (GitHub Pages) |
| `release/FieldLedger-<version>.apk` | The Android app |
| `release/version.json` | What installed apps check for updates |

The app checks `https://raw.githubusercontent.com/tharun1343/Field_ledger_Surya/HEAD/release/version.json`.
- `HEAD` means "the default branch", so the address keeps working if you rename the branch.
- On the phone: **Settings → App updates → Check for updates** (also under **More**). The app also checks by itself each time it is opened (at most every 30 minutes).
- The app asks the GitHub Releases API first, then `raw.githubusercontent.com`, then GitHub Pages, so one blocked address does not stop updates. The APK is downloaded inside the app from the first address that works (GitHub Releases, raw, jsDelivr or Pages), checked against its SHA-256, and installed with Android's installer session.

> **If you make the repo private again:**
> - Phones can't download updates. The app says "No update has been published", and nothing else breaks.
> - On the free GitHub plan, the GitHub Pages web link goes offline.
> - Sign-in and sync keep working in the installed Android app; they use Supabase, not GitHub.
> - Before each release, make it public, push, let phones update, then make it private again.

## 5. Connect the app to your project

In Supabase open **Project Settings → API** (also called *Data API* / *API Keys*). Copy:
- **Project URL:** `https://xxxx.supabase.co`
- **anon public key** (`eyJ…`), or on newer projects the **publishable key** (`sb_publishable_…`).

**Never** use the `service_role` / *secret* key. It bypasses all security.

Then choose one:
- **A. Build it into the app (recommended).** Send me the Project URL and the anon/publishable key; they are safe to share. I rebuild the APK and web app with them built in, so people only see *Email → code*.
- **B. Enter it per phone.** On first launch FieldLedger asks for *Project URL* and *Anon / publishable key*. Paste them and tap **Connect**.

## 6. Signing in (what users see)

1. Type the email and tap **Send code**.
2. Open the email and type the **6-digit code**. The app signs in as soon as the 6th digit is entered.
   - A **new** email address gets its account created at this step.
   - **Resend code** unlocks after 60 seconds. **Change email** goes back to step 1.
3. On a second phone, use the **same email**. The records download automatically.

The dot on the account button shows the sync state:

| Dot | Meaning |
|---|---|
| 🟢 | Online, everything synced |
| 🟠 | Syncing, changes waiting, or not signed in |
| 🔴 | Offline. Entries still save on the phone and upload later |

**How sync behaves:**
- **Conflicts:** if two phones edit the same day, the newest save wins.
- **Sample data:** demo records are never uploaded. They are removed when you first sign in.
- **Signing out:** removes this phone's copy. Your records stay in your account.

## 7. Bill photos in your account (optional)

Bill photos attached to expenses are always saved **on the phone** and inside **JSON backups**. To also keep them in your Supabase account (so a second phone can see them), create a private storage bucket once.

Open **SQL Editor → New query**, paste this and click **Run**:

```sql
-- Private bucket for bill photos: <user id>/<photo id>.jpg
insert into storage.buckets (id, name, public)
values ('bills', 'bills', false)
on conflict (id) do nothing;

-- Each account can read, add, replace and delete only the files in its own folder.
create policy "bills: read own"   on storage.objects for select to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bills: add own"    on storage.objects for insert to authenticated
  with check (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bills: update own" on storage.objects for update to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bills: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'bills' and (storage.foldername(name))[1] = auth.uid()::text);
```

Check it worked: **Storage** shows a bucket named **bills** marked *Private*.

Without this step everything still works; the account sheet just notes that bill photos stay on the phone.

## Do I need to change the SQL?

**No** for records and sign-in (step 7 is only for bill photos). The tables and row-level security you created already work with code sign-in, and the new 2.5 fields (size prices, payments, photo ids) are stored inside the existing `data` column:
- each account still gets a user id;
- `ledger_entries` and `ledger_settings` still allow each account to read and write only its own rows.

To double-check, open **Table Editor**: `ledger_entries` and `ledger_settings` should exist and show **RLS enabled**.

## Troubleshooting

| What you see | Fix |
|---|---|
| The email contains a link but no code | Step 3b: add `{{ .Token }}` to **both** the *Confirm signup* and *Magic Link* templates. |
| "That code is wrong or has expired" | Use the code from the **latest** email (each resend replaces the old one) within 10 minutes. |
| "Too many requests" | Wait a minute. Check **Rate Limits** (step 3c). |
| No email arrives | Check spam. In Supabase open **Logs → Auth** to see SMTP errors. Re-check host, port, username and password in SMTP Settings. |
| "Signups not allowed for otp" | In Authentication → Sign In / Providers, allow new users to sign up. |
| Orange dot with "relation … does not exist" | The SQL was run in a different project than the app is connected to. |
| "No update has been published yet" | The repo is private, or `release/version.json` isn't pushed yet (step 4). |
| "Could not reach the update server" | The phone is offline, or all GitHub addresses are blocked on this network. Try Wi-Fi or mobile data. |
| Account sheet says bill photos stay on this phone | Create the **bills** bucket (step 7). |
