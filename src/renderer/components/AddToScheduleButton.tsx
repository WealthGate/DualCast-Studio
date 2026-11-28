import React, { useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { addItemToSchedule, type ScheduleItemDraft } from "../utils/serviceScheduleActions";

const AddToScheduleButton: React.FC<{ getItem: () => ScheduleItemDraft | Promise<ScheduleItemDraft>; disabled?: boolean; label?: string }> = ({ getItem, disabled, label = "Item" }) => {
  const saved = useAppStore(state => state.settings.serviceSchedules);
  const schedules = saved ?? [];
  const active = useAppStore(state => state.activeScheduleId);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const target = active === "new" ? "new" : schedules.some(item => item.id === active) ? active : schedules[0]?.id ?? "new";
  const add = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const item = await getItem();
      const result = await addItemToSchedule(item, target === "new" ? null : target);
      setMessage(`Added to ${result.scheduleName}. The live output continues unchanged.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add this item to the schedule."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <div className="add-to-schedule">
    <div className="field-row">
      <button type="button" className="btn btn-outline" aria-label={`Add ${label} to schedule`} disabled={disabled || busy} onClick={() => void add()}>{busy ? "Adding…" : "Add to Schedule"}</button>
      {schedules.length > 0 && <select aria-label={`Schedule for ${label}`} disabled={busy} value={target} onChange={event => useAppStore.setState({ activeScheduleId: event.target.value })}>
        {schedules.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.name}</option>)}<option value="new">New service…</option>
      </select>}
    </div>
    {message && <span role="status" className="field-help">{message}</span>}
  </div>;
};
export default AddToScheduleButton;
