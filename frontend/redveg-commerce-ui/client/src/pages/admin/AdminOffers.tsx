import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { assets } from "@/lib/assets";
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
        setError('Failed to load offers. Please try again.');
        toast.error('Failed to load offers');
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, []); // Empty deps for mount; we could add a refresh token later

  const handleCreate = () => {
    setLocation('/admin/campaigns/new');
  };

  const handleEdit = (campaign: Campaign) => {
    setLocation(`/admin/campaigns/${encodeURIComponent(campaign.id)}`);
  };

  if (loading) {
    return (
      <AdminShell title="Offers & combos" subtitle="Schedule campaigns that publish and expire automatically.">
        <div className="p-8">Loading offers...</div>
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell title="Offers & combos" subtitle="Schedule campaigns that publish and expire automatically.">
        <div className="p-8 space-y-4">
          <p className="text-center text-muted-foreground">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Offers & combos" subtitle="Schedule campaigns that publish and expire automatically." action={<Button onClick={handleCreate} className="h-11 rounded-full bg-[#B4232C] px-5 font-black text-white hover:bg-[#951D24]"><Plus className="size-4" /> Create offer</Button>}>
      <div className="mb-7 grid gap-4 md:grid-cols-3">
        {/* Metrics - we'll compute from campaigns */}
        <Metric
          icon={Gift}
          label="Active offers"
          value={campaigns.filter(c => c.status === 'published' && new Date() >= new Date(c.startsAt) && new Date() <= new Date(c.endsAt)).length.toString()}
          tone="red"
        />
        <Metric
          icon={CalendarClock}
          label="Scheduled"
          value={campaigns.filter(c => c.status === 'scheduled' || (c.status === 'published' && new Date() < new Date(c.startsAt))).length.toString()}
          tone="green"
        />
        <Metric
          icon={Timer}
          label="Expiring in 48h"
          value={campaigns.filter(c => c.status === 'published' && new Date() >= new Date(c.endsAt) && new Date() <= new Date(Date.now() + 48 * 60 * 60 * 1000)).length.toString()}
          tone="amber"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {campaigns.map((campaign) => (
          <article
            key={campaign.id}
            className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]"
          >
            <div className="relative aspect-[16/8] overflow-hidden">
              <img
                src={campaign.desktopImageUrl || assets.hero}
                alt={campaign.altText || ''}
                className="size-full object-cover"
              />
              <span className={`absolute left-4 top-4 rounded-full px-3 py-1.5 text-[0.68rem] font-black ${campaign.status === 'published' && new Date() >= new Date(campaign.startsAt) && new Date() <= new Date(campaign.endsAt) ? 'Active' : campaign.status === 'scheduled' || (campaign.status === 'published' && new Date() < new Date(campaign.startsAt)) ? 'Scheduled' : 'Expired'}`}>
                {campaign.status === 'published' && new Date() >= new Date(campaign.startsAt) && new Date() <= new Date(campaign.endsAt) ? 'Active' : campaign.status === 'scheduled' || (campaign.status === 'published' && new Date() < new Date(campaign.startsAt)) ? 'Scheduled' : 'Expired'}
              </span>
            </div>
            <div className="p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#B4232C]">{new Date(campaign.startsAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}-{new Date(campaign.endsAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
              <h2 className="mt-2 text-lg font-black">{campaign.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{campaign.message}</p>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <span className="text-sm font-black text-muted-foreground">{campaign.placement.replace('_', ' ')}</span>
                </div>
                <Button onClick={() => handleEdit(campaign)} variant="outline" size="icon" className="rounded-full bg-white">
                  <Edit3 className="size-4" />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-7 rounded-[1.5rem] bg-[#17110F] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#F2989C]">Automatic expiry</p>
            <h2 className="mt-2 text-xl font-black">No more midnight offer takedowns</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Scheduled campaigns are displayed from the server-provided start time and disappear automatically after the end time.</p>
          </div>
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#FFFDF9]/10"><Clock3 className="size-6 text-[#72B556]" /></span>
        </div>
      </div>

    </AdminShell>
  );
}

// Simple metric component (same as before)
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Gift; label: string; value: string; tone: string }) {
  return <div className="flex items-center gap-4 rounded-[1.25rem] bg-white p-5 shadow-[0_10px_30px_rgba(61,33,27,.045)] ring-1 ring-black/[0.04]">
    <span className={`grid size-11 place-items-center rounded-2xl ${tone === "red" ? "bg-[#FBE8E7] text-[#B4232C]" : tone === "green" ? "bg-[#E8F3E5] text-[#267345]" : "bg-[#FFF0D2] text-[#8A5A00]"}`}>
      <Icon className="size-5" />
    </span>
    <div>
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  </div>;
}
