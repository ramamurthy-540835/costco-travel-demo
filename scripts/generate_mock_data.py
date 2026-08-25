"""Generate deterministic, synthetic workshop datasets; never production data."""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "mock-data"
AIRPORTS = [("LAS","Las Vegas"),("MCO","Orlando"),("LAX","Los Angeles"),("SFO","San Francisco"),("SEA","Seattle"),("PHX","Phoenix"),("DEN","Denver"),("DFW","Dallas"),("JFK","New York"),("ORD","Chicago")]
PROVIDERS = [
    {"provider":"Alamo","rating":4.7,"discount":"8%","included_miles":"Unlimited"},
    {"provider":"Avis","rating":4.6,"discount":"10%","included_miles":"Unlimited"},
    {"provider":"Budget","rating":4.3,"discount":"12%","included_miles":"Unlimited"},
    {"provider":"Enterprise","rating":4.8,"discount":"9%","included_miles":"Unlimited"},
    {"provider":"National","rating":4.9,"discount":"7%","included_miles":"Unlimited"},
]
VEHICLES = [("Economy","Nissan","Versa",36),("Compact","Toyota","Corolla",41),("Mid-size","Toyota","Camry",47),("Full-size","Chevrolet","Malibu",54),("SUV","Toyota","RAV4",63),("Luxury","BMW","3 Series",92),("Convertible","Ford","Mustang",88),("Minivan","Chrysler","Pacifica",69),("Pickup","Ford","F-150",77)]
TIERS = ["Gold Star","Executive","Business"]
STATUSES = ["Pending","Confirmed","Completed","Cancelled"]


def write(name: str, value) -> None:
    (OUT / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    today = date.today()
    inventory = []
    for index in range(500):
        code, city = AIRPORTS[index % len(AIRPORTS)]
        vehicle_class, make, model, base = VEHICLES[index % len(VEHICLES)]
        provider = PROVIDERS[(index // len(AIRPORTS)) % len(PROVIDERS)]
        inventory.append({"rental_id":f"RC{10001+index}","airport_code":code,"city":city,"provider":provider["provider"],"vehicle_class":vehicle_class,"vehicle_make":make,"vehicle_model":model,"daily_rate":round(base+(index%7)*1.25,2),"member_discount":int(provider["discount"].rstrip("%")),"available":index%11!=0})
    members = [{"member_id":f"COST{100001+i}","first_name":f"Demo{i+1}","last_name":"Member","email":f"demo.member{i+1}@example.test","membership_tier":TIERS[i%len(TIERS)],"membership_status":"Active" if i%10 else "Inactive"} for i in range(100)]
    bookings = []
    for index in range(1000):
        code, city = AIRPORTS[index % len(AIRPORTS)]
        vehicle = VEHICLES[index % len(VEHICLES)]
        pickup = today + timedelta(days=7 + index % 330)
        bookings.append({"reservation_id":f"RES{900001+index}","member_id":members[index%len(members)]["member_id"],"pickup_city":city,"location_code":code,"provider":PROVIDERS[index%len(PROVIDERS)]["provider"],"vehicle":f"{vehicle[1]} {vehicle[2]}","pickup_date":pickup.isoformat(),"return_date":(pickup+timedelta(days=1+index%10)).isoformat(),"status":STATUSES[index%len(STATUSES)]})
    write("rental_providers.json", PROVIDERS)
    write("rental_inventory_500.json", inventory)
    write("members_100.json", members)
    write("bookings_1000.json", bookings)
    write("operational_relative_seeds.json", [{"reservation_id":"CTR-D21OUT1","pickup_offset":"21 days","duration_days":4,"car_class":"Intermediate","location_code":"MCO"},{"reservation_id":"CTR-D30HRS1","pickup_offset":"30 hours","duration_days":2,"car_class":"Full-Size","location_code":"LAS"}])
    print(f"generated {len(inventory)} rentals, {len(members)} members, {len(bookings)} bookings in {OUT}")


if __name__ == "__main__":
    main()
