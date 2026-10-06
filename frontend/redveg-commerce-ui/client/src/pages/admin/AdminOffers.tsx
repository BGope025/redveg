import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CalendarClock, Clock3, Edit3, Gift, Plus, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { campaignApi } from "@/lib/campaignApi";
import type { Campaign } from "@/types/commerce";
import { useLocation } from "wouter";

export default function AdminOffers() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();

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

  const now = Date.now();
  const activeCampaigns = campaigns.filter(
    campaign =>
      campaign.status === "published" &&
      now >= new Date(campaign.startsAt).getTime() &&
      now <= new Date(campaign.endsAt).getTime()
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
      new Date(campaign.endsAt).getTime() >= now &&
      new Date(campaign.endsAt).getTime() <= now + 48 * 60 * 60 * 1000
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
        <Button
          onClick={handleCreate}
          className="h-11 rounded-full bg-[#B4232C] px-5 font-black text-white hover:bg-[#951D24]"
        >
          <Plus className="size-4" /> Create offer
        </Button>
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
      {campaigns.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-white px-6 py-16 text-center shadow-[0_12px_34px_rgba(61,33,27,.04)]">
          <Gift className="mx-auto size-9 text-[#B4232C]" />
          <h2 className="mt-4 text-xl font-black">
            No offers or combos added yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            This view is connected to the live campaigns database. Create an
            offer to publish the first one here.
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
          {campaigns.map(campaign => (
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
                <span
                  className={`absolute left-4 top-4 rounded-full px-3 py-1.5 text-[0.68rem] font-black ${campaign.status === "published" && new Date() >= new Date(campaign.startsAt) && new Date() <= new Date(campaign.endsAt) ? "Active" : campaign.status === "scheduled" || (campaign.status === "published" && new Date() < new Date(campaign.startsAt)) ? "Scheduled" : "Expired"}`}
                >
                  {campaign.status === "published" &&
                  new Date() >= new Date(campaign.startsAt) &&
                  new Date() <= new Date(campaign.endsAt)
                    ? "Active"
                    : campaign.status === "scheduled" ||
                        (campaign.status === "published" &&
                          new Date() < new Date(campaign.startsAt))
                      ? "Scheduled"
                      : "Expired"}
                </span>
              </div>
              <div className="p-5">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#B4232C]">
                  {new Date(campaign.startsAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}
                  -
                  {new Date(campaign.endsAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}
                </p>
                <h2 className="mt-2 text-lg font-black">{campaign.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {campaign.message}
                </p>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <span className="text-sm font-black text-muted-foreground">
                      {campaign.placement.replace("_", " ")}
                    </span>
                  </div>
                  <Button
                    onClick={() => handleEdit(campaign)}
                    variant="outline"
                    size="icon"
                    className="rounded-full bg-white"
                  >
                    <Edit3 className="size-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
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
