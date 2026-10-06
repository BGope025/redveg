import { useCart } from "@/contexts/CartContext";
import { Gift, Home, ShoppingBag, Store, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { StoreFooter } from "./StoreFooter";
import { StoreHeader } from "./StoreHeader";

export function StoreShell({
  children,
  showFooter = true,
}: {
  children: React.ReactNode;
  showFooter?: boolean;
}) {
  const [location] = useLocation();
  const { itemCount } = useCart();
  const { isAuthenticated } = useAuth();
  const links = [
    { href: "/", label: "Home", icon: Home },
    { href: "/shop", label: "Shop", icon: Store },
    { href: "/shop?category=offers", label: "Offers", icon: Gift },
    { href: "/cart", label: "Cart", icon: ShoppingBag },
    {
      href: isAuthenticated ? "/profile" : "/login",
      label: isAuthenticated ? "Profile" : "Account",
      icon: UserRound,
    },
  ];
  return (
    <div className="min-h-screen bg-[#FFFDF9] pb-16 text-[#251B18] lg:pb-0">
      <StoreHeader />
      <main>{children}</main>
      {showFooter && <StoreFooter />}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-black/5 bg-white/95 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(61,33,27,.09)] backdrop-blur-xl lg:hidden"
        aria-label="Mobile navigation"
      >
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? location === "/"
              : location.startsWith(href.split("?")[0]);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.62rem] font-black ${active ? "text-[#B4232C]" : "text-[#786B66]"}`}
            >
              <span
                className={`grid size-8 place-items-center rounded-full ${active ? "bg-[#FBE8E7]" : ""}`}
              >
                <Icon className="size-[18px]" />
              </span>
              {label}
              {label === "Cart" && itemCount > 0 && (
                <span className="absolute right-[24%] top-0 grid min-w-4 place-items-center rounded-full bg-[#267345] px-1 text-[0.55rem] leading-4 text-white">
                  {itemCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
