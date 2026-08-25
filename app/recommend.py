"""Deterministic vehicle recommendations and pricing."""
from typing import Any

INVENTORY = (
 {"car":"Toyota Camry","class":"Intermediate","seats":5,"rate_per_day":47.0,"retail_per_day":55.0,"popularity":10,"emoji":"🚙"},
 {"car":"Chrysler Pacifica","class":"Minivan","seats":7,"rate_per_day":69.0,"retail_per_day":82.0,"popularity":7,"emoji":"🚐"},
 {"car":"Chevrolet Tahoe","class":"Full-Size SUV","seats":7,"rate_per_day":86.0,"retail_per_day":101.0,"popularity":7,"emoji":"🚙"},
 {"car":"Toyota RAV4","class":"Standard SUV","seats":5,"rate_per_day":63.0,"retail_per_day":74.0,"popularity":8,"emoji":"🚙"},
 {"car":"Nissan Versa","class":"Economy","seats":5,"rate_per_day":36.0,"retail_per_day":43.0,"popularity":6,"emoji":"🚗"},
 {"car":"Chevrolet Malibu","class":"Full-Size","seats":5,"rate_per_day":54.0,"retail_per_day":64.0,"popularity":8,"emoji":"🚘"},
)

def slug(value: str) -> str:
    return value.lower().replace(" ", "-")

def quote(car_class: str, days: int) -> dict[str, float]:
    car = next((x for x in INVENTORY if x["class"].lower() == car_class.lower()), None)
    if not car:
        raise ValueError(f"Unsupported car class: {car_class}")
    days=max(1,days); total=round(car["rate_per_day"]*days,2); retail=round(car["retail_per_day"]*days,2)
    return {"rate_per_day":car["rate_per_day"],"retail_per_day":car["retail_per_day"],"total":total,"retail_total":retail,"member_savings":round(retail-total,2)}

def rank_cars(*, days:int, party_size:int, location:str="", budget_per_day:float|None=None) -> list[dict[str,Any]]:
    ranked=[]
    for source in INVENTORY:
        if party_size>source["seats"] or (budget_per_day is not None and source["rate_per_day"]>budget_per_day):
            continue
        score=float(source["popularity"])
        if party_size>=6 and source["class"] in {"Minivan","Full-Size SUV"}: score+=3
        if days>=7 and source["class"] in {"Intermediate","Full-Size","Standard SUV","Full-Size SUV","Minivan"}: score+=2
        if days<=2 and source["class"]=="Economy": score+=2
        item=dict(source); item.pop("popularity"); item.update(savings_per_day=round(source["retail_per_day"]-source["rate_per_day"],2),est_total=round(source["rate_per_day"]*max(1,days),2),location=location)
        ranked.append((score,item))
    ranked.sort(key=lambda x:(-x[0],x[1]["rate_per_day"],x[1]["car"])); result=[x[1] for x in ranked]
    for i,item in enumerate(result):
        item.update(recommended=i==0,reason="Recommended for your trip" if i==0 else "Member rate with savings vs retail")
    return result
