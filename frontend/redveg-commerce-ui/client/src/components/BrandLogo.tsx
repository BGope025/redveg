import { assets } from "@/lib/assets";
import { Link } from "wouter";

export function BrandLogo({
  inverse = false,
  compact = false,
  className = "",
}: {
  inverse?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center ${className}`.trim()}
      aria-label="RedVeg home"
    >
      <img
        src={compact ? assets.logoMark : assets.logoMaster}
        alt=""
        className={
          compact
            ? "h-10 w-16 object-contain transition-transform duration-200 group-hover:scale-[1.03]"
            : "h-16 w-auto max-w-[190px] object-contain transition-transform duration-200 group-hover:scale-[1.03]"
        }
      />
    </Link>
  );
}
