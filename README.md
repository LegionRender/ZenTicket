<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1f1e2a82-b500-4db2-9cf3-751b301c35ee

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Production OCR on Firebase

Firebase Hosting must route `/api/**` to the Firebase Function named `api`.
Provider keys must be configured as Functions secrets, not shipped in the web bundle.
For production resilience, configure at least primary and secondary Gemini keys. OpenAI is the optional secondary provider.

```bash
npx firebase-tools functions:secrets:set GEMINI_API_KEY_PRIMARY
npx firebase-tools functions:secrets:set GEMINI_API_KEY_SECONDARY
npx firebase-tools functions:secrets:set OPENAI_API_KEY
npx firebase-tools functions:secrets:set GEMINI_API_KEY
npm run build
npx firebase-tools deploy --only functions,hosting,firestore:rules
```

After deployment, `https://<your-domain>/api/tickets/analyze` is served by the backend function and uses provider failover for real OCR. Failed OCR attempts are recorded in `ocr_jobs`, queued in `ocr_retry_queue`, and surfaced to admins through `ocr_alerts`.
