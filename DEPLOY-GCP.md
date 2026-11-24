# Deploy the server to Google Cloud Run

One-time setup (replace PROJECT_ID / region as needed):

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create api-tester --repository-format=docker --location=asia-south1

# Secrets (use a MongoDB Atlas connection string; allow Cloud Run's IPs in Atlas Network Access)
printf 'mongodb+srv://rajkumarbfcsofttech_db_user:nzpvu7m4ZC55Hs7h@bfc.luimydi.mongodb.net/api_tester?retryWrites=true&w=majority' | gcloud secrets create MONGO_URI --data-file=-
printf 'UaaLGYkzDUqsuHF1NOZ5y6xSXPdCTOXZ' | gcloud secrets create JWT_SECRET --data-file=-

# Let Cloud Run read the secrets
PROJECT_NUMBER=$(gcloud projects describe api-tester-9956 --format='value(projectNumber)')
for s in MONGO_URI JWT_SECRET; do
  gcloud secrets add-iam-policy-binding $s \
    --member=serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com \
    --role=roles/secretmanager.secretAccessor
done
```

Deploy (from this folder):

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_CLIENT_URL=https://api-tester-client-386235460295.asia-south1.run.app,_ADMIN_EMAIL=rajkumargupt84952@gmail.com
```

The command prints the service URL. Check `<url>/api/health`, then use that URL as `_API_URL` when deploying the client.
Keep `ALLOW_PRIVATE_URLS=false` on a public server.
