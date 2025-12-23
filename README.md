# /lpnfinder (Blob version)

This app lets you:
- Upload one or more Excel manifests once
- Data is saved going forward using **Vercel Blob**
- Look up items by scanning/typing an **LPN** (assumed unique)

## Storage layout in Blob
- Raw uploads (optional): `manifests/<timestamp>-<filename>.xlsx` (private)
- Sharded indexes: `index/shards/AA.json` (public)
- Meta: `index/meta.json` (public)

Sharding is by the first 2 characters of the normalized LPN, so lookups only download one small shard.

## Deploy on Vercel
1) Push repo to GitHub
2) Import to Vercel
3) Add **Vercel Blob** storage to the project (it sets `BLOB_READ_WRITE_TOKEN`)
4) Deploy

## Local dev
Create `.env` from `.env.example` with your `BLOB_READ_WRITE_TOKEN`, then:
```bash
npm install
npm run dev
```
