# Supabase Auth setup — required for OTP verification

The app now uses one-time codes (not links) for signup verification, password
reset, email changes, and password changes. The code side is complete, but
two things only exist in the **Supabase Dashboard** (Authentication section)
and can't be set from this repo with an anon key — do these once:

## 1. Add the OTP code to email templates

Dashboard → **Authentication → Emails → Templates**. For each of the
templates below, add `{{ .Token }}` somewhere in the body (Supabase already
includes `{{ .ConfirmationURL }}` by default — keep that too if you want a
fallback link, but the app's UI expects the 6-digit `{{ .Token }}`):

- **Confirm signup** — used by the Register page's verification step.
- **Change Email Address** — used by Settings → Account & Security → Email.
  This one is sent to *both* the old and new address; each contains its own
  `{{ .Token }}`.
- **Reset Password** — used by the "Forgot password?" flow on `/reset-password`.

A minimal addition to any of these templates:

```html
<p>Your verification code is: <strong>{{ .Token }}</strong></p>
<p>This code expires shortly — if you didn't request this, ignore this email.</p>
```

## 2. Enable secure (dual-confirmation) email change

Dashboard → **Authentication → Sign In / Providers → Email**, or
**Authentication → Settings** depending on your dashboard version → enable
**"Secure email change"**. With this on, changing your email requires
confirming a code from *both* the current and the new inbox — which is what
Settings → Account & Security → Email now walks the user through. If this is
left off, Supabase only requires confirming the new address.

## 3. (Optional but recommended) Custom SMTP

Supabase's built-in email sender is rate-limited and fine for testing, but
for production auth email supply your own SMTP provider under
**Authentication → Settings → SMTP Settings** (e.g. Resend, Postmark,
SendGrid) so signup/reset/change-email codes are delivered reliably.

## What already works without any dashboard change

- Sign up / sign in with email+password, Google OAuth.
- `reauthenticate()`-based password change (Settings → Password) — this uses
  a built-in GoTrue nonce flow and doesn't depend on the templates above,
  though the emailed code still needs `{{ .Token }}` in the **Reauthentication**
  template to be visible to the user (add it the same way as step 1).
- Sign out of all devices (Settings → Sessions).
