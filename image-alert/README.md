# Image Alert Pipeline (GCP)

Bucket upload -> Eventarc -> Cloud Run function -> Gemini vision -> Telegram alert.

Secrets and IDs come from environment variables or Secret Manager. Nothing is hardcoded.
The Telegram bot token lives in Secret Manager as `telegram-bot-token`.

Deploy:

    gcloud run deploy image-alert --source . --function on_upload \
      --base-image python312 --region us-central1 \
      --service-account YOUR_SA_EMAIL --no-allow-unauthenticated \
      --set-env-vars GCP_PROJECT=YOUR_PROJECT,REGION=us-central1,TELEGRAM_CHAT_ID=YOUR_CHAT_ID \
      --set-secrets TELEGRAM_BOT_TOKEN=telegram-bot-token:latest
