"""GCS image URLs signed through ADC self-impersonation."""
import os
from datetime import timedelta
from functools import lru_cache
import google.auth
from google.auth import impersonated_credentials
from google.auth.transport.requests import Request
from google.cloud import storage
from .recommend import slug

CLASS_OBJECTS={"Intermediate":"cars/intermediate.jpg","Economy":"cars/economy.jpg","Compact":"cars/compact.jpg","Full-Size":"cars/full-size.jpg","Standard SUV":"cars/standard-suv.jpg","Full-Size SUV":"cars/full-size-suv.jpg","Minivan":"cars/minivan.jpg","Luxury":"cars/luxury.jpg","Convertible":"cars/convertible.jpg","Pickup":"cars/pickup.jpg"}

@lru_cache(maxsize=1)
def _storage_client():
    return storage.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT"))

@lru_cache(maxsize=1)
def _signer():
    source,_=google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"]); source.refresh(Request())
    principal=os.environ.get("RUNTIME_SERVICE_ACCOUNT") or getattr(source,"service_account_email",None)
    if not principal: return None
    return impersonated_credentials.Credentials(source_credentials=source,target_principal=principal,target_scopes=["https://www.googleapis.com/auth/devstorage.read_only"],lifetime=3600)

def image_url(car_class:str)->str|None:
    bucket=os.environ.get("ASSETS_BUCKET"); name=CLASS_OBJECTS.get(car_class,f"cars/{slug(car_class)}.jpg")
    if not bucket: return None
    try:
        blob=_storage_client().bucket(bucket).blob(name)
        if not blob.exists(): return None
        signer=_signer()
        if signer is None: return None
        return blob.generate_signed_url(version="v4",expiration=timedelta(hours=1),method="GET",credentials=signer)
    except Exception:
        return None
