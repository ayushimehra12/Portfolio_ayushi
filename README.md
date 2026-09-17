# Karo — Shared Kanban

This recreates the Kanban shown in the screenshot as a real web app. It has working add/edit/delete/move/star/search/group/export/theme/share controls and can sync changes between browsers through Supabase Realtime.

## 1. Create the database
1. Create a free Supabase project.
2. Open **SQL Editor**.
3. Paste all of `supabase.sql` and run it.
4. If Supabase asks you to enable Realtime/publication for the three tables, do so. The SQL includes the publication statement.

## 2. Add your Supabase keys
Open `config.js` and replace:
- `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE`
- `PASTE_YOUR_SUPABASE_ANON_KEY_HERE`

Find these under Supabase **Project Settings → API**.

## 3. Test it
You can open `index.html` locally, but some browsers block modules/features from `file://`. For easiest local testing, use any simple static server, e.g. VS Code Live Server.

## 4. Deploy
Upload the whole folder to a GitHub repository and import that repository into Vercel, or use another static host. No server code is required.

The resulting URL can be shared. The URL's `?board=sam-ayushi` identifies the board. Anyone with the link can edit the board because this version intentionally uses public RLS policies.

## Important security note
This is deliberately designed for a small trusted group where the link itself is the access control. Anyone who has the board URL can edit/delete its data. For a work board that needs private/member-only access, the next version should add authentication and board membership permissions.

## Local fallback
If `config.js` is not configured, the app still works as a local browser-only Kanban using localStorage. Changes will not sync between people in that mode.
