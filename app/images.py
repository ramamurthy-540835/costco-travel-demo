"""Public GCS image URLs for vehicle classes.

Bucket has uniform public read access (allUsers:objectViewer), so images
are served directly from storage.googleapis.com — no signed URLs needed.
"""
import os
from .recommend import slug

_CLASS_OBJECTS: dict[str, str] = {
    "Intermediate":  "cars/intermediate.jpg",
    "Economy":       "cars/economy.jpg",
    "Compact":       "cars/compact.jpg",
    "Full-Size":     "cars/full-size.jpg",
    "Standard SUV":  "cars/standard-suv.jpg",
    "Full-Size SUV": "cars/full-size-suv.jpg",
    "Minivan":       "cars/minivan.jpg",
    "Luxury":        "cars/luxury.jpg",
    "Convertible":   "cars/convertible.jpg",
    "Pickup":        "cars/pickup.jpg",
}

def image_url(car_class: str) -> str | None:
    bucket = os.environ.get("ASSETS_BUCKET")
    if not bucket:
        return None
    name = _CLASS_OBJECTS.get(car_class) or f"cars/{slug(car_class)}.jpg"
    return f"https://storage.googleapis.com/{bucket}/{name}"
