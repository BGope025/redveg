import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { Clock3, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type DeliverySlot = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt?: string | null;
};

const EMPTY_FORM = { name: "", startTime: "08:00", endTime: "10:00" };

function formatTime(value: string) {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || !minute) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minute} ${suffix}`;
}

async function readSlots() {
  const response = await apiFetch("delivery-slots/admin", {}, { forceBackend: true });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.message || "Could not load delivery slots.");
  return Array.isArray(payload.data) ? payload.data as DeliverySlot[] : [];
}

export default function AdminDeliverySlots() {
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<DeliverySlot | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      setSlots(await readSlots());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load delivery slots.";
      setError(message);
      if (quiet) return;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30000);
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const createSlot = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await apiFetch("delivery-slots/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not create this slot.");
      setSlots(current => [...current, payload.data as DeliverySlot].sort((a, b) => a.sortOrder - b.sortOrder));
      setForm(EMPTY_FORM);
      toast.success("Delivery slot added", { description: "It is now available in checkout." });
    } catch (saveError) {
      toast.error("Could not add delivery slot", { description: saveError instanceof Error ? saveError.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const updateSlot = async (slot: DeliverySlot, values: typeof EMPTY_FORM, isActive: boolean) => {
    setUpdatingId(slot.id);
    try {
      const response = await apiFetch(`delivery-slots/admin/${encodeURIComponent(slot.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, isActive }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not update this slot.");
      const updated = payload.data as DeliverySlot;
      setSlots(current => current.map(item => item.id === slot.id ? updated : item));
      if (editing?.id === slot.id) setEditing(null);
      toast.success(isActive ? "Delivery slot is available" : "Delivery slot turned off", { description: "Checkout will sync the change within a few seconds." });
    } catch (saveError) {
      toast.error("Could not update delivery slot", { description: saveError instanceof Error ? saveError.message : "Please try again." });
    } finally {
      setUpdatingId(null);
    }
  };

  const openEdit = (slot: DeliverySlot) => {
    setEditing(slot);
    setEditForm({ name: slot.name, startTime: slot.startTime, endTime: slot.endTime });
  };

  return (
    <AdminShell title="Delivery slots" subtitle="Control the delivery windows customers can choose at checkout. Changes sync to checkout automatically.">
      <section className="rounded-[1.5rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04] sm:p-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-black">Add a delivery slot</h2><p className="mt-1 text-sm text-muted-foreground">Use the store’s local time. New slots become available as soon as they are saved.</p></div>
          <Button variant="outline" className="rounded-full" aria-label="Refresh delivery slots" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
        <form onSubmit={createSlot} className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-bold">Slot name<Input required maxLength={80} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="For example, Evening slot" className="mt-1 h-11 rounded-xl bg-[#FBF9F6]" /></label>
          <label className="text-xs font-bold">Starts at<Input required type="time" value={form.startTime} onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))} className="mt-1 h-11 rounded-xl bg-[#FBF9F6]" /></label>
          <label className="text-xs font-bold">Ends at<Input required type="time" value={form.endTime} onChange={event => setForm(current => ({ ...current, endTime: event.target.value }))} className="mt-1 h-11 rounded-xl bg-[#FBF9F6]" /></label>
          <Button type="submit" disabled={saving} className="h-11 rounded-full bg-[#B4232C] px-5 font-black text-white hover:bg-[#941D25]">{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}Add slot</Button>
        </form>
      </section>

      <section className="mt-5 overflow-hidden rounded-[1.5rem] bg-white shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
        <div className="border-b border-black/5 px-5 py-5 sm:px-6"><h2 className="text-lg font-black">Checkout availability</h2><p className="mt-1 text-sm text-muted-foreground">Turn a slot off when it is full. Existing orders keep their originally selected time.</p></div>
        {error ? <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<Button variant="link" onClick={() => void refresh()} className="ml-2 text-red-800">Try again</Button></div>
          : loading ? <div className="space-y-3 p-5" role="status" aria-label="Loading delivery slots">{[1, 2].map(item => <div key={item} className="h-16 animate-pulse rounded-xl bg-[#F5F2EE]" />)}</div>
            : slots.length === 0 ? <p className="px-5 py-10 text-sm text-muted-foreground">No delivery slots have been created.</p>
              : <div className="divide-y divide-black/5">{slots.map(slot => <article key={slot.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${slot.isActive ? "bg-[#EEF6F0] text-[#267345]" : "bg-[#F5F2EE] text-[#776A64]"}`}><Clock3 className="size-5" /></span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{slot.name}</h3><span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-black ${slot.isActive ? "bg-[#EEF6F0] text-[#267345]" : "bg-[#F5F2EE] text-[#776A64]"}`}>{slot.isActive ? "Available" : "Turned off"}</span></div><p className="mt-1 text-sm text-muted-foreground">{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</p></div>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => openEdit(slot)}><Pencil className="mr-1.5 size-3.5" />Edit</Button>
                <div className="flex items-center gap-2"><span className="text-xs font-bold text-muted-foreground">{slot.isActive ? "On" : "Off"}</span><Switch checked={slot.isActive} disabled={updatingId === slot.id} onCheckedChange={checked => void updateSlot(slot, { name: slot.name, startTime: slot.startTime, endTime: slot.endTime }, checked)} aria-label={`${slot.isActive ? "Turn off" : "Turn on"} ${slot.name}`} /></div>
              </article>)}</div>}
      </section>

      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !updatingId) setEditing(null); }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Edit delivery slot</DialogTitle><DialogDescription>Saved changes are used for new checkout orders. Past orders retain their saved slot.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold sm:col-span-2">Slot name<Input maxLength={80} value={editForm.name} onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} className="mt-1 rounded-xl bg-[#FBF9F6]" /></label>
            <label className="text-xs font-bold">Starts at<Input type="time" value={editForm.startTime} onChange={event => setEditForm(current => ({ ...current, startTime: event.target.value }))} className="mt-1 rounded-xl bg-[#FBF9F6]" /></label>
            <label className="text-xs font-bold">Ends at<Input type="time" value={editForm.endTime} onChange={event => setEditForm(current => ({ ...current, endTime: event.target.value }))} className="mt-1 rounded-xl bg-[#FBF9F6]" /></label>
          </div>
          <DialogFooter><Button variant="outline" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!editing || updatingId === editing.id} className="rounded-full bg-[#17110F] text-white" onClick={() => editing && void updateSlot(editing, editForm, editing.isActive)}>{updatingId === editing?.id ? "Saving…" : "Save changes"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
