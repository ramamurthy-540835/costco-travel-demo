(function attachFlowMachine(root, factory) {
  const machine = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = machine;
  root.FlowMachine = machine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFlowMachine() {
  const STAGES = new Set(['idle','awaiting_dates','dates_selected','awaiting_car','awaiting_confirm','human_review','complete']);
  const TYPES = new Set([null,'change','cancel','new']);

  function initial() {
    return { type: null, stage: 'idle', resId: null, newDates: null, newCar: null, replacementId: null, pickerRendered: false, summaryRendered: false };
  }
  function start(type, resId = null) {
    if (!TYPES.has(type) || type === null) throw new Error('Invalid flow type');
    return { ...initial(), type, resId, stage: type === 'cancel' ? 'awaiting_confirm' : 'awaiting_dates' };
  }
  function advance(flow, stage, patch = {}) {
    if (!STAGES.has(stage)) throw new Error('Invalid flow stage');
    return { ...flow, ...patch, stage };
  }
  function canRenderPicker(flow) { return flow.stage === 'awaiting_dates' && !flow.pickerRendered; }
  function markPickerRendered(flow) { return canRenderPicker(flow) ? { ...flow, pickerRendered: true } : flow; }
  function canRenderSummary(flow) { return flow.stage === 'awaiting_confirm' && !flow.summaryRendered; }
  function markSummaryRendered(flow) { return canRenderSummary(flow) ? { ...flow, summaryRendered: true } : flow; }
  function reset() { return initial(); }

  return { initial, start, advance, canRenderPicker, markPickerRendered, canRenderSummary, markSummaryRendered, reset };
});
