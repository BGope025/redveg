import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { useHeaderTheme } from "@/contexts/HeaderThemeContext";
import { type HeaderTheme, type HeaderThemeId } from "@/themes/headerThemes";
import { Check, Eye, Palette, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminHeaderTheme() {
  const {
    effectiveTheme,
    activeThemeId,
    previewThemeId,
    themes,
    setPreview,
    applyTheme,
    resetToDefault,
  } = useHeaderTheme();

  const [saving, setSaving] = useState(false);

  const handlePreview = (id: HeaderThemeId) => {
    setPreview(id);
  };

  const handleApply = async (id: HeaderThemeId) => {
    setSaving(true);
    try {
      await applyTheme(id);
      toast.success(`"${themes.find((t) => t.id === id)?.name}" theme applied!`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The server could not save the theme.";
      toast.error(`Could not apply theme: ${reason}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetToDefault();
      toast.success("Header reset to Default RedVeg.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The server could not reset the theme.";
      toast.error(`Could not reset theme: ${reason}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClearPreview = () => {
    setPreview(null);
  };

  return (
    <AdminShell
      title="Header Appearance"
      subtitle="Apply festival and occasion themes to the storefront header."
      action={
        activeThemeId !== "default" ? (
          <Button
            variant="outline"
            className="h-11 gap-2 rounded-full border-[#E9D8D4] px-5 font-black text-[#B4232C] hover:bg-[#FFF5F0]"
            onClick={handleReset}
            disabled={saving}
          >
            <RotateCcw className="size-4" />
            Reset to default
          </Button>
        ) : undefined
      }
    >
      {/* Preview banner */}
      {previewThemeId && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <Eye className="size-5 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                Previewing: {themes.find((t) => t.id === previewThemeId)?.name}
              </p>
              <p className="text-xs text-amber-700">
                This preview is temporary — scroll up to see the header. Click "Apply" to publish.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={handleClearPreview}
            >
              Cancel preview
            </Button>
            <Button
              size="sm"
              className="rounded-full bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => handleApply(previewThemeId)}
              disabled={saving}
            >
              <Check className="mr-1 size-3.5" />
              {saving ? "Applying…" : "Apply now"}
            </Button>
          </div>
        </div>
      )}

      {/* Active theme indicator */}
      <div className="mb-7 rounded-2xl bg-white p-6 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#F8E7E6] text-lg">
            {themes.find((t) => t.id === activeThemeId)?.emoji || "🏠"}
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              Currently active
            </p>
            <p className="mt-1 text-xl font-black">
              {themes.find((t) => t.id === activeThemeId)?.name || "Default RedVeg"}
            </p>
          </div>
          {activeThemeId !== "default" && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-xs font-bold text-[#B4232C]"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Theme grid */}
      <div className="mb-4 flex items-center gap-2">
        <Palette className="size-5 text-[#B4232C]" />
        <h2 className="text-lg font-black">Choose a theme</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {themes.map((theme) => {
          const isActive = activeThemeId === theme.id;
          const isPreviewing = previewThemeId === theme.id;

          return (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={isActive}
              isPreviewing={isPreviewing}
              onPreview={() => handlePreview(theme.id)}
              onApply={() => handleApply(theme.id)}
              saving={saving}
            />
          );
        })}
      </div>
    </AdminShell>
  );
}

// ─── Theme Card ─────────────────────────────────────────────────────────────

function ThemeCard({
  theme,
  isActive,
  isPreviewing,
  onPreview,
  onApply,
  saving,
}: {
  theme: HeaderTheme;
  isActive: boolean;
  isPreviewing: boolean;
  onPreview: () => void;
  onApply: () => void;
  saving: boolean;
}) {
  const p = theme.palette;

  return (
    <div
      className={`group relative overflow-hidden rounded-[1.35rem] bg-white shadow-[0_10px_30px_rgba(61,33,27,.045)] ring-1 transition-all duration-200 hover:-translate-y-0.5 ${
        isActive
          ? "ring-2 ring-[#B4232C]"
          : isPreviewing
          ? "ring-2 ring-amber-400"
          : "ring-black/[0.04]"
      }`}
    >
      {/* Mini header preview */}
      <div className="relative overflow-hidden">
        {/* Top bar preview */}
        <div
          className="flex h-5 items-center px-3 text-[0.5rem] font-semibold tracking-wide"
          style={{ backgroundColor: p.topBarBg, color: p.topBarFg }}
        >
          <span className="truncate opacity-70">Freshly cut · Hygienically packed</span>
        </div>

        {/* Main header preview */}
        <div
          className="flex h-12 items-center gap-2 px-3"
          style={{ backgroundColor: p.headerBg, color: p.headerFg, borderBottom: `1px solid ${p.borderColor}` }}
        >
          <div className="size-6 rounded-lg bg-[#17110f] p-0.5">
            <div className="size-full rounded bg-[#B4232C]/80" />
          </div>
          <span className="text-[0.6rem] font-black tracking-tight" style={{ color: p.accent }}>
            REDVEG
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="h-5 w-14 rounded-full" style={{ backgroundColor: p.searchBg }} />
            <div className="size-5 rounded-full" style={{ backgroundColor: p.accent }}>
              <span className="grid size-full place-items-center text-[0.4rem] text-white">🛒</span>
            </div>
          </div>
        </div>

        {/* Nav preview */}
        <div className="flex items-center gap-1 px-3 py-1" style={{ backgroundColor: p.headerBg }}>
          {["Chicken", "Mutton", "Fish"].map((cat) => (
            <span
              key={cat}
              className="rounded-full px-1.5 py-0.5 text-[0.45rem] font-bold"
              style={{ color: p.navText }}
            >
              {cat}
            </span>
          ))}
          <span className="text-[0.4rem] opacity-40">…</span>
        </div>

        {/* Decorative accent line */}
        {theme.id !== "default" && (
          <div
            className="h-[2px] w-full"
            style={{ background: `linear-gradient(90deg, ${p.accent}, ${p.accentSecondary}, ${p.accent})` }}
          />
        )}
      </div>

      {/* Card body */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">{theme.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-black text-[#251B18]">{theme.name}</h3>
              {isActive && (
                <span className="shrink-0 rounded-full bg-[#E8F3E5] px-2 py-0.5 text-[0.6rem] font-black text-[#267345]">
                  Active
                </span>
              )}
              {isPreviewing && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-black text-amber-700">
                  Previewing
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {theme.description}
            </p>
          </div>
        </div>

        {/* Colour swatches */}
        <div className="mt-3 flex items-center gap-1.5">
          {[p.topBarBg, p.headerBg, p.accent, p.accentSecondary, p.navHoverBg, p.cartBadgeBg].map(
            (color, i) => (
              <div
                key={i}
                className="size-5 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: color }}
                title={color}
              />
            )
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          {!isActive && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5 rounded-full text-xs font-bold"
              onClick={onPreview}
            >
              <Eye className="size-3.5" />
              Preview
            </Button>
          )}
          {!isActive && (
            <Button
              size="sm"
              className="h-8 flex-1 gap-1.5 rounded-full bg-[#B4232C] text-xs font-bold text-white hover:bg-[#951D24]"
              onClick={onApply}
              disabled={saving}
            >
              <Sparkles className="size-3.5" />
              {saving ? "Applying…" : "Apply"}
            </Button>
          )}
          {isActive && (
            <p className="w-full text-center text-xs font-bold text-[#267345]">
              <Check className="mr-1 inline size-3.5" />
              Currently active on the storefront
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
