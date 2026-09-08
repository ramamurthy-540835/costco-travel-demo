"""Pure server-side policy functions; model output cannot override them."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

@dataclass(frozen=True)
class ReviewDecision:
    requires_human_review: bool
    reason: str | None = None

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def parse_datetime(value: str | datetime) -> datetime:
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def validate_trip_dates(pickup_at: str | datetime, drop_at: str | datetime, now: datetime | None = None, *, require_future_time: bool = True) -> tuple[datetime, datetime]:
    """Validate using the pickup's local calendar before normalizing to UTC."""
    pickup = pickup_at if isinstance(pickup_at, datetime) else datetime.fromisoformat(pickup_at.replace("Z", "+00:00"))
    drop = drop_at if isinstance(drop_at, datetime) else datetime.fromisoformat(drop_at.replace("Z", "+00:00"))
    if pickup.tzinfo is None: pickup = pickup.replace(tzinfo=timezone.utc)
    if drop.tzinfo is None: drop = drop.replace(tzinfo=pickup.tzinfo)
    current = (now or utc_now()).astimezone(pickup.tzinfo)
    minimum_date: date = current.date()
    if pickup.date() < minimum_date:
        raise ValueError("pickup_at must be today or later in the pickup timezone.")
    if require_future_time and pickup <= current:
        raise ValueError("pickup_at time must be in the future.")
    if drop <= pickup:
        raise ValueError("drop_at must be after pickup_at.")
    return pickup.astimezone(timezone.utc), drop.astimezone(timezone.utc)
def hours_until(pickup_at: str | datetime, now: datetime | None = None) -> float:
    return (parse_datetime(pickup_at) - (now or utc_now())).total_seconds() / 3600

def penalty_preview(pickup_at: str | datetime, daily_rate: float, total: float, now: datetime | None = None) -> dict[str, Any]:
    pickup, current = parse_datetime(pickup_at), now or utc_now()
    remaining = hours_until(pickup, current)
    if remaining >= 48:
        fee, tier = 0.0, "free"
    elif remaining >= 24:
        fee, tier = min(float(daily_rate), float(total)), "partial"
    else:
        fee, tier = float(total), "no_show"
    return {"tier": tier, "fee": round(fee, 2), "refund": round(max(0.0, total-fee), 2), "free_deadline": (pickup-timedelta(hours=48)).isoformat()}

def change_review(pickup_at: str | datetime, *, cost_delta_percent: float | None = None, now: datetime | None = None) -> ReviewDecision:
    current, pickup = now or utc_now(), parse_datetime(pickup_at)
    hrs = hours_until(pickup, current)
    if hrs < 0:
        return ReviewDecision(True, "This reservation's pickup date has passed. Please contact Costco Travel Member Services to modify it.")
    if pickup.date() == current.date():
        return ReviewDecision(True, "Same-day changes require human review.")
    if hrs < 48:
        return ReviewDecision(True, "Changes within 48 hours of pickup require human review.")
    if cost_delta_percent is not None and abs(cost_delta_percent) > 30:
        return ReviewDecision(True, "Total cost changes greater than 30% require human review.")
    return ReviewDecision(False)

def cancellation_review(pickup_at: str | datetime, *, penalty: float, now: datetime | None = None) -> ReviewDecision:
    current, pickup = now or utc_now(), parse_datetime(pickup_at)
    hrs = hours_until(pickup, current)
    if hrs < 0:
        return ReviewDecision(True, "This reservation's pickup date has passed. Please contact Costco Travel Member Services to cancel it.")
    if pickup.date() == current.date():
        return ReviewDecision(True, "Same-day cancellations require human review.")
    if hrs < 24:
        return ReviewDecision(True, "Cancellations within 24 hours of pickup require human review.")
    if penalty > 100:
        return ReviewDecision(True, "Penalty exposure greater than $100 requires human review.")
    return ReviewDecision(False)

def cancellation_schedule() -> list[dict[str, str]]:
    return [{"tier":"free","window":">=48h","fee":"0"},{"tier":"partial","window":"24-48h","fee":"one_day_rate"},{"tier":"no_show","window":"<24h","fee":"reservation_total"}]
