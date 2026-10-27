import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Archive, CalendarClock, Edit3, Gift, Plus, Timer, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { campaignApi } from "@/lib/campaignApi";
import type { Campaign } from "@/types/commerce";
import { useLocation } from "wouter";

function formatIstDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(date);
}

function campaignStateLabel(campaign: Campaign, now: number) {
  if (campaign.status === "archived") return "Archived";
  if (campaign.status === "draft" || campaign.status === "paused") return "Off";
  if (campaign.status === "scheduled" || now < new Date(campaign.startsAt).getTime()) return "Scheduled";
  if (now >= new Date(campaign.endsAt).getTime()) return "Expired";
  return "Active";
}

export default function AdminOffers() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [, setLocation] = useLocation();

  const setPending = (id: string, pending: boolean) => {
    setPendingIds(current => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // Fetch campaigns on mount and whenever needed (we could add a refresh function)
  useEffect(() => {
    const fetchCampaigns = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await campaignApi.getCampaigns();
        setCampaigns(data);
      } catch (err) {
        setError("Failed to load offers. Please try again.");
        toast.error("Failed to load offers");
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, []); // Empty deps for mount; we could add a refresh token later

  const handleCreate = () => {
    setLocation("/admin/campaigns/new");
  };

  const handleEdit = (campaign: Campaign) => {
    setLocation(`/admin/campaigns/${encodeURIComponent(campaign.id)}`);
  };

  const handleToggle = async (campaign: Campaign, enabled: boolean) => {
    setPending(campaign.id, true);
    try {
      const updated = await campaignApi.updateCampaign(campaign.id, {
        status: enabled ? "published" : "draft",
      });
      if (!updated) throw new Error("Campaign could not be found.");
      setCampaigns(current =>
        current.map(item => item.id === campaign.id ? { ...item, ...updated } : item)
      );
      toast.success(enabled ? "Campaign turned on" : "Campaign turned off");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Campaign status could not be updated.");
    } finally {
      setPending(campaign.id, false);
    }
  };

  const handleDelete = async (campaign: Campaign) => {
    const confirmed = window.confirm(
      `Delete “${campaign.name}” from the storefront? It will be archived and can be restored from the archived campaigns list.`
    );
    if (!confirmed) return;

    setPending(campaign.id, true);
    try {
      const deleted = await campaignApi.deleteCampaign(campaign.id);
      if (!deleted) throw new Error("Campaign could not be found.");
      setCampaigns(current =>
        current.map(item => item.id === campaign.id ? { ...item, status: "archived" } : item)
      );
      toast.success("Campaign archived and removed from the storefront");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Campaign could not be deleted.");
    } finally {
      setPending(campaign.id, false);
    }
  };

  const now = Date.now();
  const activeCampaigns = campaigns.filter(
    campaign =>
      campaign.status === "published" &&
      now >= new Date(campaign.startsAt).getTime() &&
      now < new Date(campaign.endsAt).getTime()
  );
  const scheduledCampaigns = campaigns.filter(
    campaign =>
      campaign.status === "scheduled" ||
      (campaign.status === "published" &&
        now < new Date(campaign.startsAt).getTime())
  );
  const expiringCampaigns = campaigns.filter(
    campaign =>
      campaign.status === "published" &&
      new Date(campaign.endsAt).getTime() > now &&
      new Date(campaign.endsAt).getTime() <= now + 48 * 60 * 60 * 1000
  );
  const archivedCount = campaigns.filter(campaign => campaign.status === "archived").length;
  const visibleCampaigns = campaigns.filter(
    campaign => showArchived || campaign.status !== "archived"
  );

  if (loading) {
    return (
      <AdminShell
        title="Offers & combos"
        subtitle="Schedule campaigns that publish and expire automatically."
      >
        <div className="p-8">Loading offers...</div>
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell
        title="Offers & combos"
        subtitle="Schedule campaigns that publish and expire automatically."
      >
        <div className="p-8 space-y-4">
          <p className="text-center text-muted-foreground">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Offers & combos"
      subtitle="Schedule campaigns that publish and expire automatically."
      action={
        <div className="flex flex-wrap gap-2">
          {archivedCount > 0 && (
            <Button variant="outline" onClick={() => setShowArchived(value => !value)} className="h-11 rounded-full bg-white px-4 font-bold">
              <Archive className="size-4" /> {showArchived ? "Hide archived" : `Archived (${archivedCount})`}
            </Button>
          )}
          <Button
            onClick={handleCreate}
            className="h-11 rounded-full bg-[#B4232C] px-5 font-black text-white hover:bg-[#951D24]"
          >
            <Plus className="size-4" /> Create offer
          </Button>
        </div>
      }
    >
      <div className="mb-7 grid gap-4 md:grid-cols-3">
        {/* Metrics - we'll compute from campaigns */}
        <Metric
          icon={Gift}
          label="Active offers"
          value={activeCampaigns.length.toString()}
          tone="red"
        />
        <Metric
          icon={CalendarClock}
          label="Scheduled"
          value={scheduledCampaigns.length.toString()}
          tone="green"
        />
        <Metric
          icon={Timer}
          label="Expiring in 48h"
          value={expiringCampaigns.length.toString()}
          tone="amber"
        />
      </div>
      {visibleCampaigns.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-white px-6 py-16 text-center shadow-[0_12px_34px_rgba(61,33,27,.04)]">
          <Gift className="mx-auto size-9 text-[#B4232C]" />
          <h2 className="mt-4 text-xl font-black">
            {campaigns.length === 0 ? "No offers or combos added yet" : showArchived ? "No archived campaigns" : "No current campaigns to show"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {campaigns.length === 0
              ? "This view is connected to the live campaigns database. Create an offer to publish the first one here."
              : "Archived campaigns are kept in the database and can be restored from the archived campaigns list."}
          </p>
          <Button
            onClick={handleCreate}
            className="mt-6 h-11 rounded-full bg-[#B4232C] px-5 font-black text-white hover:bg-[#951D24]"
          >
            <Plus className="size-4" /> Create offer
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {visibleCampaigns.map(campaign => {
            const stateLabel = campaignStateLabel(campaign, now);
            const campaignEnabled = campaign.status === "published" || campaign.status === "scheduled";
            const isPending = pendingIds.has(campaign.id);
            return (
            <article
              key={campaign.id}
              className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]"
            >
              <div className="relative aspect-[16/8] overflow-hidden">
                {campaign.desktopImageUrl ? (
                  <img
                    src={campaign.desktopImageUrl}
                    alt={campaign.altText || campaign.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="grid size-full place-items-center bg-[#F6F1EC] px-6 text-center text-sm font-bold text-muted-foreground">
                    No campaign image uploaded
                  </div>
                )}
                <span className={`absolute left-4 top-4 rounded-full px-3 py-1.5 text-[0.68rem] font-black ${stateLabel === "Active" ? "bg-[#E8F3E5] text-[#267345]" : stateLabel === "Archived" ? "bg-black/70 text-white" : "bg-white/95 text-[#74645D]"}`}>
                  {stateLabel}
                </span>
              </div>
              <div className="p-5">
                <p className="text-xs font-black tracking-[0.02em] text-[#B4232C]">{formatIstDateTime(campaign.startsAt)} – {formatIstDateTime(campaign.endsAt)} IST</p>
                <h2 className="mt-2 text-lg font-black">{campaign.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {campaign.message}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={campaignEnabled}
                      disabled={isPending}
                      onCheckedChange={enabled => void handleToggle(campaign, enabled)}
                      aria-label={`${campaignEnabled ? "Turn off" : "Turn on"} ${campaign.name}`}
                    />
                    <span className="text-sm font-bold">{campaignEnabled ? "On" : stateLabel}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleEdit(campaign)} variant="outline" size="icon" className="rounded-full bg-white" aria-label={`Edit ${campaign.name}`}>
                      <Edit3 className="size-4" />
                    </Button>
                    {campaign.status !== "archived" && (
                      <Button onClick={() => void handleDelete(campaign)} variant="outline" size="icon" className="rounded-full bg-white text-[#B4232C] hover:bg-[#FFF1F0]" aria-label={`Delete ${campaign.name}`} disabled={isPending}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          )})}
        </div>
      )}
    </AdminShell>
  );
}

// Simple metric component (same as before)
function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Gift;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-[1.25rem] bg-white p-5 shadow-[0_10px_30px_rgba(61,33,27,.045)] ring-1 ring-black/[0.04]">
      <span
        className={`grid size-11 place-items-center rounded-2xl ${tone === "red" ? "bg-[#FBE8E7] text-[#B4232C]" : tone === "green" ? "bg-[#E8F3E5] text-[#267345]" : "bg-[#FFF0D2] text-[#8A5A00]"}`}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-black">{value}</p>
      </div>
    </div>
  );
}
