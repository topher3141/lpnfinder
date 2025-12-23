# lpnfinder

Simple web app to upload an Excel manifest and look up items by LPN (barcode scan or typing).

## Local run
```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy (Vercel)
1. Push this repo to GitHub
2. Import into Vercel as a Next.js project
3. Deploy

## Notes
- Parsing happens client-side in your browser.
- The app searches all sheets and finds the header row containing a column named `LPN` (so it doesn't depend on hard-coded column letters).
- A barcode scanner typically acts like a keyboard, so just keep focus in the LPN input box and scan.
