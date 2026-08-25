"""Idempotent relative-date Firestore demo seed."""
from datetime import timedelta
from .policies import utc_now
from .recommend import quote
from .reservations import FirestoreRepository

DEMO_FAR_ID="CTR-D21OUT1"
DEMO_NEAR_ID="CTR-D30HRS1"

def seed(repository=None):
    repo=repository or FirestoreRepository(); now=utc_now(); created=[]
    definitions=[(DEMO_FAR_ID,now+timedelta(days=21),4,"Intermediate","MCO"),(DEMO_NEAR_ID,now+timedelta(hours=30),2,"Full-Size","LAS")]
    for identity,pickup,days,car_class,location in definitions:
        if repo.get(identity): continue
        stamp=now.isoformat()
        repo.create({"id":identity,"status":"CONFIRMED","car_class":car_class,"location_code":location,"pickup_at":pickup.isoformat(),"drop_at":(pickup+timedelta(days=days)).isoformat(),"pickup_time":pickup.strftime("%H:%M"),"drop_time":pickup.strftime("%H:%M"),"days":days,**quote(car_class,days),"created_at":stamp,"updated_at":stamp,"demo":True})
        created.append(identity)
    return created

if __name__=="__main__": print({"created":seed()})
