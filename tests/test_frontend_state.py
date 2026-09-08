import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_node(source: str) -> dict:
    source = "const fs=require('fs'),vm=require('vm'),box={};box.globalThis=box;vm.runInNewContext(fs.readFileSync('./static/flow-machine.js','utf8'),box);const F=box.FlowMachine;\n" + source
    result = subprocess.run(["node", "-e", source], cwd=ROOT, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def test_ten_turn_change_has_one_picker_and_one_summary():
    source = r'''

let flow=F.start('change','CTR-DEMO001'),pickers=0,summaries=0;
for(let turn=0;turn<10;turn++){
  if(F.canRenderPicker(flow)){pickers++;flow=F.markPickerRendered(flow)}
  if(turn===2) flow=F.advance(flow,'dates_selected',{newDates:{pickup:'2026-09-01',return:'2026-09-05'}});
  if(turn===3) flow=F.advance(flow,'awaiting_car');
  if(turn===5) flow=F.advance(flow,'awaiting_confirm',{newCar:{car:'Camry'}});
  if(F.canRenderSummary(flow)){summaries++;flow=F.markSummaryRendered(flow)}
  if(turn===8) flow=F.advance(flow,'complete');
}
console.log(JSON.stringify({pickers,summaries,stage:flow.stage}));
'''
    assert run_node(source) == {"pickers": 1, "summaries": 1, "stage": "complete"}


def test_abandon_resets_flow_to_idle():
    value = run_node("console.log(JSON.stringify(F.reset(F.start('change','CTR-X'))));")
    assert value["type"] is None and value["stage"] == "idle"


def test_cancel_starts_at_explicit_confirmation():
    value = run_node("console.log(JSON.stringify(F.start('cancel','CTR-X')));")
    assert value["stage"] == "awaiting_confirm"


def test_frontend_has_flow_specific_exit_copy_and_split_change_controls():
    app = (ROOT / "static/app.js").read_text()
    assert "No reservation was created" in app
    assert "Cancellation stopped" in app
    assert "Change vehicle" in app and "Change dates" in app
    assert 'startChange(reservation.id,"vehicle")' in app


def test_frontend_has_date_gate_and_no_hardcoded_trip_dates():
    app = (ROOT / "static/app.js").read_text()
    html = (ROOT / "static/index.html").read_text()
    assert "That date has already passed" in app
    assert "pickup.min=localDateAfter(0)" in app
    assert 'name="pickup_time"' in html and 'name="drop_time"' in html
    assert "from 2026-" not in html and "2025" not in html
    assert "populateTimeChoices" in app and "bookingPrefill" in app
    assert 'type="time"' not in html and html.count('<select name="') >= 2
