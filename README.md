# /lpnfinder

A simple Vercel + GitHub web app:

- Upload one or more Excel manifests (.xlsx)
- Server parses all sheets and stores each row keyed by **LPN** in **Vercel KV**
- Search by scanning/typing an LPN (LPNs are treated as unique)

## Local dev
1) Create a Vercel KV database and connect it to this project (recommended).
2) Copy env vars into `.env` from `.env.example`
3) Run:

```bash
npm install
npm run dev
```

## Deploy on Vercel
1) Push repo to GitHub
2) Import into Vercel
3) In Vercel: Storage → create/connect **KV**
4) Deploy

## Uploading manifests
Go to the **Upload** tab and select multiple .xlsx files at once.

## Notes
- Keys are stored as: `lpn:YOUR_LPN`
- Conflicts: if an LPN already exists, the newest upload overwrites it (but upload reports conflicts).
