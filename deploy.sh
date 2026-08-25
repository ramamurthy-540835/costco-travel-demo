export PROJECT_ID=ctoteam REGION=us-central1
gcloud services enable run.googleapis.com aiplatform.googleapis.com firestore.googleapis.com storage.googleapis.com iamcredentials.googleapis.com secretmanager.googleapis.com --project $PROJECT_ID
gcloud firestore databases create --location=$REGION --project $PROJECT_ID || true
gcloud iam service-accounts create costco-demo-run --project $PROJECT_ID || true
SA=costco-demo-run@$PROJECT_ID.iam.gserviceaccount.com
for ROLE in roles/aiplatform.user roles/datastore.user roles/storage.objectViewer roles/logging.logWriter; do gcloud projects add-iam-policy-binding $PROJECT_ID --member serviceAccount:$SA --role $ROLE; done
gcloud iam service-accounts add-iam-policy-binding $SA --member serviceAccount:$SA --role roles/iam.serviceAccountTokenCreator
gsutil mb -l $REGION gs://$PROJECT_ID-costco-demo-assets || true
gcloud secrets add-iam-policy-binding costco-demo-serpapi-key --project $PROJECT_ID --member serviceAccount:$SA --role roles/secretmanager.secretAccessor
gcloud run deploy costco-travel-demo --source . --region $REGION --service-account $SA --allow-unauthenticated --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID,VERTEX_LOCATION=global,AGENT_MODEL=gemini-3-flash-preview,ASSETS_BUCKET=$PROJECT_ID-costco-demo-assets,FIRESTORE_DATABASE=costco-demo,SERPAPI_SECRET_VERSION=2 --min-instances 0 --max-instances 3
