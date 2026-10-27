import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { assets } from "@/lib/assets";

export function CustomerPhonePrompt() {
  const { user, getCustomerIdToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!user) {
      setOpen(false);
      return () => { active = false; };
    }
    const loadProfile = async () => {
      setLoading(true);
      try {
        const token = await getCustomerIdToken();
        if (!token) throw new Error("Please sign in again to add your phone number.");
        const response = await apiFetch("customers/me", {}, { forceBackend: true, authToken: token });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error(payload?.message || "Could not check your profile.");
        if (!active) return;
        const savedPhone = String(payload.data?.profile?.phoneNumber || "");
        if (savedPhone) setPhone(savedPhone);
        else setOpen(true);
      } catch (loadError) {
        console.error("Unable to check customer phone number:", loadError);
        if (active) {
          setError("We couldn’t check your saved number. Enter it to continue.");
          setOpen(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProfile();
    return () => { active = false; };
  }, [user?.uid, getCustomerIdToken]);

  const save = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      setError("Enter a valid phone number with 10 to 15 digits.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await getCustomerIdToken();
      if (!token) throw new Error("Please sign in again to save your number.");
      const response = await apiFetch("customers/me/phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone.trim() }),
      }, { forceBackend: true, authToken: token });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "Could not save your number.");
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your number. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open && !loading} onOpenChange={() => undefined}>
      <DialogContent
        className="rounded-2xl sm:max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <img src={assets.logoMaster} alt="Redveg" className="mb-2 h-12 max-w-40 self-center object-contain" />
          <DialogTitle>Add a phone number to your profile</DialogTitle>
          <DialogDescription>Add your contact number so Redveg can reach you about orders and delivery.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="customer-profile-phone" className="text-sm font-semibold">Phone number</label>
          <Input id="customer-profile-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={phone} onChange={(event) => { setPhone(event.target.value); setError(""); }} placeholder="e.g. +91 98765 43210" aria-invalid={!!error} />
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" className="bg-[#B4232C] text-white hover:bg-[#941D25]" onClick={() => void save()} disabled={saving}>
            {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save phone number"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
