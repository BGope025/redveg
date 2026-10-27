import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { campaignApi } from "@/lib/campaignApi";
import type {
  Campaign,
  CampaignOccasion,
  CampaignPlacement,
} from "@/types/commerce";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Eye,
  Palette,
  Target,
  LayoutTemplate,
  MessageSquare,
} from "lucide-react";

const REDVEG_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 330;

function toIstDateTimeInput(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

function dateTimeInputValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : toIstDateTimeInput(date);
}

function parseIstDateTimeInput(value: string) {
  return new Date(`${value}:00+05:30`);
}

const emptyCampaign: Partial<Campaign> = {
  name: "",
  slug: "",
  occasion: "custom",
  status: "draft",
  startsAt: toIstDateTimeInput(new Date()),
  endsAt: toIstDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  timezone: REDVEG_TIME_ZONE,
  placement: "both",
  priority: 10,
  label: "",
  message: "",
  ctaLabel: "",
  destinationType: "url",
  destinationValue: "",
  backgroundColor: "#B4232C",
  foregroundColor: "#FFFFFF",
  accentColor: "#F59E0B",
  buttonColor: "#FFFFFF",
  buttonTextColor: "#B4232C",
  collectionTitle: "",
  collectionSubtitle: "",
};

interface AdminCampaignFormProps {
  /** Campaign ID for edit mode */
  campaignId?: string;
  /** Pre-loaded campaign data (optional) */
  campaign?: Campaign;
  /** Callback when save is successful */
  onSave?: (data: Campaign) => void;
  /** Callback when form should be closed */
  onClose?: () => void;
}

export default function AdminCampaignForm({
  campaignId,
  campaign,
  onSave,
  onClose,
}: AdminCampaignFormProps = {}) {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/admin/campaigns/:id");

  // Determine mode: props take precedence over route
  const isEditingFromProps = campaignId !== undefined || campaign !== undefined;
  const isEditingFromRoute = match && params?.id !== "new";
  const isEditing = isEditingFromProps || isEditingFromRoute;

  // Get the effective campaign ID for edit mode
  const effectiveCampaignId =
    campaignId ?? (isEditingFromRoute ? params?.id : undefined);

  // Form state
  const [formData, setFormData] = useState<Partial<Campaign>>(emptyCampaign);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeEditor = () => {
    if (onClose) onClose();
    else navigate("/admin/offers");
  };

  // Load campaign data for edit mode if not pre-loaded
  useEffect(() => {
    if (isEditing && effectiveCampaignId && !campaign) {
      const loadCampaign = async () => {
        setLoading(true);
        setError(null);
        try {
          const data = await campaignApi.getCampaignById(effectiveCampaignId);
          if (data) {
            // Convert ISO timestamps to datetime-local format for form
            setFormData({
              ...data,
              startsAt: dateTimeInputValue(data.startsAt),
              endsAt: dateTimeInputValue(data.endsAt),
            });
          } else {
            setError("Campaign not found");
            closeEditor();
          }
        } catch (err) {
          setError("Failed to load campaign");
          closeEditor();
        } finally {
          setLoading(false);
        }
      };
      loadCampaign();
    } else if (campaign) {
      // Use pre-loaded campaign data
      setFormData({
        ...campaign,
        startsAt: dateTimeInputValue(campaign.startsAt),
        endsAt: dateTimeInputValue(campaign.endsAt),
      });
    }
  }, [isEditing, effectiveCampaignId, campaign, onClose]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  const handleSave = async (status: Campaign["status"]) => {
    if (
      !formData.name?.trim() ||
      !formData.slug?.trim() ||
      !formData.occasion ||
      !formData.placement
    ) {
      const message =
        "Campaign name, slug, occasion, and placement are required";
      setError(message);
      toast.error(message);
      return;
    }
    const startsAt = parseIstDateTimeInput(formData.startsAt || "");
    const endsAt = parseIstDateTimeInput(formData.endsAt || "");
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      const message = "End date and time must be after the start date and time";
      setError(message);
      toast.error(message);
      return;
    }
    if (
      status === "published" &&
      !formData.desktopImageUrl &&
      !formData.mobileImageUrl &&
      !formData.posterImageUrl
    ) {
      const message =
        "Add a campaign image before publishing so customers can see this offer in the storefront hero.";
      setError(message);
      toast.error(message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dataToSave = {
        ...formData,
        status,
        timezone: REDVEG_TIME_ZONE,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      } as Campaign;

      let result: Campaign | null = null;
      if (isEditing && effectiveCampaignId) {
        result = await campaignApi.updateCampaign(
          effectiveCampaignId,
          dataToSave
        );
        if (!result) {
          throw new Error("Campaign was not found on the server. No changes were saved.");
        }
        toast.success("Campaign updated successfully");
      } else {
        result = await campaignApi.createCampaign(dataToSave);
        if (!result) {
          throw new Error("The server did not confirm the campaign save.");
        }
        toast.success("Campaign created successfully");
      }

      if (result && onSave) {
        onSave(result);
      }
      closeEditor();
    } catch (err: any) {
      setError(err.message || "Failed to save campaign");
      toast.error(err.message || "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminShell title="Loading..." subtitle="">
        <div className="p-8">Loading...</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={isEditing ? "Edit Campaign" : "New Campaign"}
      subtitle="Configure seasonal banners and collections"
      action={
        <div className="flex gap-3">
          <Button variant="outline" onClick={closeEditor}>
            <ArrowLeft className="size-4 mr-2" /> Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave("draft")}
            disabled={saving}
          >
            <Save className="size-4 mr-2" /> Save Draft
          </Button>
          <Button
            onClick={() => handleSave("published")}
            disabled={saving}
            className="bg-[#B4232C] hover-bg-[#901c23] text-white"
          >
            Publish Campaign
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sidebar */}
        <div className="space-y-8">
          {/* Visual Theme */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Palette className="size-5 text-[#B4232C]" /> Visual Theme
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">
                  Background Color
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="backgroundColor"
                    value={formData.backgroundColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="backgroundColor"
                    value={formData.backgroundColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Text Color</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="foregroundColor"
                    value={formData.foregroundColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="foregroundColor"
                    value={formData.foregroundColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Accent Color</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="accentColor"
                    value={formData.accentColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="accentColor"
                    value={formData.accentColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <label className="text-sm font-semibold">Button BG</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="buttonColor"
                    value={formData.buttonColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="buttonColor"
                    value={formData.buttonColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Button Text</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="buttonTextColor"
                    value={formData.buttonTextColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="buttonTextColor"
                    value={formData.buttonTextColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Targeting */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Target className="size-5 text-[#B4232C]" /> Targeting
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">
                  Priority (Higher overrides lower)
                </label>
                <Input
                  type="number"
                  name="priority"
                  value={formData.priority || 10}
                  onChange={handleChange}
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Target Devices</label>
                <select
                  name="targetDevice"
                  value={formData.targetDevice || "all"}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="all">All Devices</option>
                  <option value="desktop">Desktop Only</option>
                  <option value="mobile">Mobile Only</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Basic Info */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <LayoutTemplate className="size-5 text-[#B4232C]" /> Basic Info &
              Schedule
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Campaign Name</label>
                <Input
                  required
                  name="name"
                  value={formData.name || ""}
                  onChange={handleChange}
                  placeholder="e.g. Diwali Mega Sale"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">
                  Slug (URL friendly)
                </label>
                <Input
                  required
                  name="slug"
                  value={formData.slug || ""}
                  onChange={handleChange}
                  placeholder="diwali-sale-2026"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Occasion</label>
                <select
                  name="occasion"
                  value={formData.occasion || ""}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="custom">Custom</option>
                  <option value="diwali">Diwali</option>
                  <option value="holi">Holi</option>
                  <option value="durga_puja">Durga Puja</option>
                  <option value="christmas">Christmas</option>
                </select>
              </div>
              <fieldset className="md:col-span-2">
                  <legend className="text-sm font-bold">Where should this campaign appear?</legend>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Choose where this campaign appears. The homepage hero slideshow stays focused on RedVeg’s regular storefront slides.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {([
                      {
                        value: "header_strip" as CampaignPlacement,
                        title: "Top announcement bar",
                        description: "Rotates in the slim bar above the storefront header.",
                      },
                      {
                        value: "collection_module" as CampaignPlacement,
                        title: "Offer box below hero",
                        description: "Rotates in the large campaign box below the hero slideshow.",
                      },
                      {
                        value: "both" as CampaignPlacement,
                        title: "Both storefront boxes",
                        description: "Shows in the top announcement bar and the offer box below the hero.",
                      },
                    ]).map(option => (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${formData.placement === option.value ? "border-[#B4232C] bg-[#FFF7F6] ring-2 ring-[#B4232C]/10" : "border-black/10 bg-white hover:border-[#B4232C]/40"}`}
                      >
                        <input
                          type="radio"
                          name="placement"
                          value={option.value}
                          checked={formData.placement === option.value}
                          onChange={() => setFormData(previous => ({ ...previous, placement: option.value }))}
                          className="mt-1 size-4 accent-[#B4232C]"
                        />
                        <span>
                          <span className="block text-sm font-bold">{option.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
              </fieldset>
              <div className="space-y-2">
                <label className="text-sm font-semibold">
                  Start Date & Time (IST, GMT+5:30)
                </label>
                <Input
                  type="datetime-local"
                  name="startsAt"
                  value={formData.startsAt || ""}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">End Date & Time (IST, GMT+5:30)</label>
                <Input
                  type="datetime-local"
                  name="endsAt"
                  value={formData.endsAt || ""}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold">
                  Desktop campaign image URL
                </label>
                <Input
                  name="desktopImageUrl"
                  value={formData.desktopImageUrl || ""}
                  onChange={handleChange}
                  placeholder="https://.../offer-banner.jpg"
                />
                <p className="text-xs text-muted-foreground">
                  Required when publishing. This image is shown in the
                  campaign image in its selected storefront placement.
                </p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold">
                  Mobile hero image URL{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <Input
                  name="mobileImageUrl"
                  value={formData.mobileImageUrl || ""}
                  onChange={handleChange}
                  placeholder="https://.../offer-mobile.jpg"
                />
              </div>
            </div>
          </div>

          {/* Copy & Messaging */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <MessageSquare className="size-5 text-[#B4232C]" /> Messaging &
              CTA
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">
                    Label / Callout (Short)
                  </label>
                  <Input
                    name="label"
                    value={formData.label || ""}
                    onChange={handleChange}
                    placeholder="e.g. SALE"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">
                    CTA Button Text
                  </label>
                  <Input
                    name="ctaLabel"
                    value={formData.ctaLabel || ""}
                    onChange={handleChange}
                    placeholder="e.g. Shop Now"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Main Message</label>
                <Input
                  name="message"
                  value={formData.message || ""}
                  onChange={handleChange}
                  placeholder="e.g. Get 20% off on all fresh cuts this festive season!"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">
                    Destination Type
                  </label>
                  <select
                    name="destinationType"
                    value={formData.destinationType || ""}
                    onChange={handleChange}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="url">Custom URL</option>
                    <option value="category">Category</option>
                    <option value="product">Product</option>
                    <option value="collection">Collection</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">
                    Destination Value
                  </label>
                  <Input
                    name="destinationValue"
                    value={formData.destinationValue || ""}
                    onChange={handleChange}
                    placeholder="e.g. /shop or category-slug"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Visual Theme */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Palette className="size-5 text-[#B4232C]" /> Visual Theme
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">
                  Background Color
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="backgroundColor"
                    value={formData.backgroundColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="backgroundColor"
                    value={formData.backgroundColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Text Color</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="foregroundColor"
                    value={formData.foregroundColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="foregroundColor"
                    value={formData.foregroundColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Accent Color</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="accentColor"
                    value={formData.accentColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="accentColor"
                    value={formData.accentColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <label className="text-sm font-semibold">Button BG</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="buttonColor"
                    value={formData.buttonColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="buttonColor"
                    value={formData.buttonColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Button Text</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    name="buttonTextColor"
                    value={formData.buttonTextColor || ""}
                    onChange={handleChange}
                    className="w-10 h-10 p-1"
                  />
                  <Input
                    name="buttonTextColor"
                    value={formData.buttonTextColor || ""}
                    onChange={handleChange}
                    className="w-24 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Targeting */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Target className="size-5 text-[#B4232C]" /> Targeting
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">
                  Priority (Higher overrides lower)
                </label>
                <Input
                  type="number"
                  name="priority"
                  value={formData.priority || 10}
                  onChange={handleChange}
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Target Devices</label>
                <select
                  name="targetDevice"
                  value={formData.targetDevice || "all"}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="all">All Devices</option>
                  <option value="desktop">Desktop Only</option>
                  <option value="mobile">Mobile Only</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
