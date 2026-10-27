import { StoreShell } from "@/components/storefront/StoreShell";
import { SeoMetadata } from "@/components/storefront/SeoMetadata";
import { Mail, Phone, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "Fresh food orders are not returnable for change of mind",
    body: "Because meat and seafood are perishable food products that are cut and packed for your order, we cannot accept a return or exchange simply because you changed your mind, selected the wrong item, or no longer need it after delivery. Please review your cart and delivery details before placing the order.",
  },
  {
    title: "If something is wrong with your order",
    body: "Please contact RedVeg as soon as possible if an item is missing, incorrect, damaged, appears spoiled, or does not match what you ordered. Share your order number and clear photos or a short video of the item and packaging so our team can review the issue. Do not consume food that you believe may be unsafe; keep it properly chilled while we respond.",
  },
  {
    title: "Review and resolution",
    body: "We will review the order details and the information you provide. Depending on the issue and applicable law, we may arrange a replacement, refund, or another appropriate resolution. If a refund is approved, we will confirm the amount and method with you; processing time can depend on your bank or payment provider.",
  },
  {
    title: "Order cancellation",
    body: "If you need to cancel an order, contact us immediately with your order number. A cancellation request is subject to review and may not be possible once the order has been prepared or dispatched. Any approved refund will be handled according to the payment method and applicable law.",
  },
];

export default function ReturnPolicyPage() {
  return (
    <StoreShell>
      <SeoMetadata
        title="Returns & Refunds | RedVeg"
        description="RedVeg's return and refund information for fresh meat and seafood orders in Kolkata."
        canonicalPath="/return-policy"
      />
      <div className="bg-[#F7F0EA] px-5 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#B4232C]">Customer care</p>
          <h1 className="mt-3 font-serif text-4xl font-black tracking-tight sm:text-5xl">Returns &amp; refunds</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#756761]">
            Our fresh meat and seafood are prepared for each order. This policy explains when a return is not suitable and how we handle an order that arrives with a problem.
          </p>
        </div>
      </div>
      <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <div className="mb-8 flex gap-3 rounded-2xl border border-[#E8D9D2] bg-white p-5 text-sm leading-6 text-[#51443F]">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#267345]" aria-hidden="true" />
          <p>Nothing in this policy limits any consumer rights or remedies available under applicable law.</p>
        </div>
        <div className="space-y-5">
          {sections.map((section, index) => (
            <section key={section.title} className="rounded-2xl border border-[#EFE5DF] bg-white p-6 shadow-sm sm:p-7">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#B4232C]">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-2 text-xl font-black">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#756761]">{section.body}</p>
            </section>
          ))}
        </div>
        <section className="mt-8 rounded-2xl bg-[#17110f] p-6 text-white sm:p-7">
          <h2 className="text-xl font-black">Need help with an order?</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">Contact us with your order number and we’ll help review it.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a className="inline-flex items-center gap-2 font-bold text-white hover:text-[#A5D68C]" href="tel:+918910558446"><Phone className="size-4" /> +91 89105 58446</a>
            <a className="inline-flex items-center gap-2 font-bold text-white hover:text-[#A5D68C] sm:ml-5" href="mailto:support@redveg.in"><Mail className="size-4" /> support@redveg.in</a>
          </div>
        </section>
        <p className="mt-8 text-xs text-[#8A7D77]">REDVEG FOOD VENTURES PRIVATE LIMITED COMPANY · Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, Kolkata, West Bengal 700065</p>
      </main>
    </StoreShell>
  );
}
