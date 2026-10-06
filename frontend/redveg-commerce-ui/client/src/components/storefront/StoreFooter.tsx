import { assets } from "@/lib/assets";
import { Clock3, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

export function StoreFooter() {
  return (
    <footer className="mt-24 bg-[#17110f] text-white">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.6fr_1.1fr_1fr] lg:grid-cols-[1.55fr_1fr_1fr_1.05fr]">
        <div className="max-w-sm">
          <img
            src={assets.logoMaster}
            alt="RedVeg"
            className="h-28 w-44 object-contain object-left"
          />
          <p className="mt-5 text-sm leading-6 text-white/60">
            Fresh meat and seafood, carefully sourced, cut to order and
            delivered across Kolkata.
          </p>
          <div className="mt-6 space-y-3 text-sm text-white/70">
            <a
              href="https://maps.app.goo.gl/S2aBvWw49uN2pEXc7"
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 transition-colors hover:text-white"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#72B556]" />
              <span>
                Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, P.O, Dum
                Dum, Kolkata, West Bengal 700065
              </span>
            </a>
            <a
              href="tel:+918910558446"
              className="flex items-center gap-2 transition-colors hover:text-white"
            >
              <Phone className="size-4 text-[#72B556]" /> +91 89105 58446
            </a>
            <a
              href="mailto:support@redveg.in"
              className="flex items-center gap-2 transition-colors hover:text-white"
            >
              <Mail className="size-4 text-[#72B556]" /> support@redveg.in
            </a>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.15em] text-white/45">
            Shop
          </h3>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
            {["Chicken", "Mutton", "Fish", "Prawns", "Combos"].map(link => (
              <Link
                key={link}
                href="/shop"
                className="text-sm font-semibold text-white/75 transition-colors hover:text-white"
              >
                {link}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.15em] text-white/45">
            Delivery hours
          </h3>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Clock3 className="size-5 text-[#72B556]" />
            <p className="mt-3 font-bold">Every day</p>
            <p className="mt-1 text-sm text-white/55">9:00 AM – 8:00 PM</p>
          </div>
        </div>
        <div className="lg:border-l lg:border-white/10 lg:pl-8">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.15em] text-white/45">
            <ShieldCheck className="size-4 text-[#72B556]" aria-hidden="true" />
            <h3>Licensed &amp; trusted</h3>
          </div>
          <div className="mt-5 rounded-2xl bg-white p-3 shadow-[0_14px_30px_rgba(0,0,0,.12)]">
            <img
              src="/fssai-logo.svg"
              alt="FSSAI"
              className="h-auto w-full max-w-[190px] object-contain"
            />
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
            FSSAI license number
          </p>
          <p className="mt-1 font-mono text-sm font-bold tracking-[0.08em] text-white">
            12825013001173
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-3 py-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © 2026 REDVEG FOOD VENTURES PRIVATE LIMITED COMPANY. All rights
            reserved.
          </span>
          <span className="text-center">Developed by AIZEN TECHNOLOGIES</span>
          <span>Privacy · Terms · Refund policy</span>
        </div>
      </div>
    </footer>
  );
}
