# /lpnfinder (GitHub manifests, deploy-time indexing)

### Why you saw '@vercel/blob' errors
That happens when old Blob-based files (like `app/api/upload/route.ts` or `app/api/_blob.ts`) are still in the repo.
This build does **not** use Blob or KV.

### How it works
- Put one or more `.xlsx` files in `/manifests`
- On build (Vercel deploy), `scripts/build-index.mjs` parses all manifests and writes:
  - `public/index/meta.json`
  - `public/index/shards/<2-chars>.json` (sharded by first 2 chars of LPN)

### Add/update manifests
Commit new files to `/manifests` and redeploy.

### Local dev
```bash
npm install
npm run dev
```
