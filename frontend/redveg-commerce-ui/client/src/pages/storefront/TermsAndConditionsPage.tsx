import { StoreShell } from "@/components/storefront/StoreShell";
import { SeoMetadata } from "@/components/storefront/SeoMetadata";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

const contents = [
  ["about", "About these terms"],
  ["products", "Products and availability"],
  ["prices", "Prices, offers and delivery charges"],
  ["orders", "Orders and confirmation"],
  ["payments", "Payments"],
  ["delivery", "Delivery"],
  ["cancellations", "Cancellations, returns and refunds"],
  ["accounts", "Your account and information"],
  ["site-use", "Using the website"],
  ["responsibility", "Our responsibility"],
  ["grievances", "Complaints and grievance redressal"],
  ["law", "Governing law"],
] as const;

function TermsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-[#E9DED7] pb-7 last:border-0">
      <h2 className="text-lg font-black tracking-tight text-[#251B18] sm:text-xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-[#635752]">{children}</div>
    </section>
  );
}

export default function TermsAndConditionsPage() {
  return (
    <StoreShell>
      <SeoMetadata
        title="Terms & Conditions | RedVeg"
        description="Terms for using RedVeg and ordering fresh meat, fish and seafood for delivery in Kolkata."
        canonicalPath="/terms"
      />
      <header className="bg-[#F7F0EA] px-5 py-12 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-serif text-4xl font-black tracking-tight text-[#251B18] sm:text-5xl">
            Terms &amp; Conditions
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#635752]">
            These terms explain how you can use RedVeg and place orders for fresh food delivery in our service areas.
          </p>
          <p className="mt-5 text-xs font-bold text-[#756761]">Effective 25 October 2026</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:py-14 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="self-start lg:sticky lg:top-24">
          <h2 className="text-xs font-black uppercase tracking-[0.16em] text-[#756761]">On this page</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-l border-[#D9C8BE] pl-4 text-sm sm:grid-cols-3 lg:grid-cols-1">
            {contents.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-[#635752] underline decoration-transparent underline-offset-4 transition-colors hover:text-[#B4232C] hover:decoration-[#B4232C] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B4232C]">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="max-w-[72ch] space-y-7">
          <div className="flex gap-3 rounded-2xl border border-[#E8D9D2] bg-white p-5 text-sm leading-6 text-[#51443F]">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#267345]" aria-hidden="true" />
            <p>These terms do not limit any rights or remedies that you have under applicable consumer protection law.</p>
          </div>

          <TermsSection id="about" title="About these terms">
            <p>
              This website is operated by <strong className="text-[#251B18]">REDVEG FOOD VENTURES PRIVATE LIMITED COMPANY</strong> ("RedVeg", "we", "us" or "our"). These terms apply when you visit redveg.in, create or use an account, or place an order with us. By using the website or placing an order, you agree to these terms. If you do not agree, please do not place an order through the website.
            </p>
            <p>RedVeg sells fresh chicken, mutton, fish, prawns and related food products for delivery in the areas shown as serviceable at checkout.</p>
          </TermsSection>

          <TermsSection id="products" title="Products and availability">
            <p>
              Product descriptions, available cuts, sizes, weights, images and prices are provided to help you choose. Fresh food is prepared and packed for an order, and its appearance may naturally vary. We confirm current availability when an order is processed. If an item or selected option is unavailable, we may contact you to discuss an appropriate alternative, adjustment or cancellation.
            </p>
            <p>Please review the items, quantities, variants and delivery details in your order before submitting it.</p>
          </TermsSection>

          <TermsSection id="prices" title="Prices, offers and delivery charges">
            <p>
              The item prices, any eligible discount, delivery charge and order total are shown at checkout before you submit the order. Delivery charges are calculated for the entered delivery location and may depend on the route distance. The final prices and eligible coupon or offer are checked when the order is saved. Offers and coupons are subject to the conditions, validity and availability displayed with them.
            </p>
          </TermsSection>

          <TermsSection id="orders" title="Orders and confirmation">
            <p>
              When you submit checkout, RedVeg records your order with a pending status. An order is accepted for fulfilment when RedVeg confirms it through the website, WhatsApp or another contact method. We may contact you to verify your order, delivery details or availability. Please keep your phone available so we can reach you about the order.
            </p>
            <p>
              If we cannot accept or fulfil an order, we will contact you and arrange any applicable payment reversal or refund in accordance with the law and our <Link href="/return-policy" className="font-bold text-[#B4232C] underline underline-offset-4">Returns &amp; Refunds policy</Link>.
            </p>
          </TermsSection>

          <TermsSection id="payments" title="Payments">
            <p>
              The payment methods available for an order are the methods shown at checkout. Online payments are processed through Razorpay and its participating banks or payment providers. A payment is treated as received only after the gateway payment is successfully verified. For cash orders, follow the WhatsApp confirmation steps shown after checkout. Do not share your bank password, card PIN or one-time password with RedVeg.
            </p>
            <p>Gateway, bank or payment-provider terms may also apply to the payment you choose.</p>
          </TermsSection>

          <TermsSection id="delivery" title="Delivery">
            <p>
              Delivery is available only to locations that RedVeg confirms as serviceable. The available delivery slots and any delivery charge are shown during checkout. We make reasonable efforts to deliver in the selected slot, but traffic, weather, public restrictions, safety concerns or other circumstances may affect timing. We will contact you if there is a material issue with your delivery.
            </p>
            <p>You are responsible for providing a complete and accurate address, a working contact number, and someone available to receive the order.</p>
          </TermsSection>

          <TermsSection id="cancellations" title="Cancellations, returns and refunds">
            <p>
              Contact us as soon as possible if you need to cancel. A cancellation request is reviewed against the order's preparation and dispatch status, so cancellation may no longer be possible once preparation or dispatch has begun. Fresh food orders are not returnable for a change of mind after delivery.
            </p>
            <p>
              If an item is missing, incorrect, damaged or appears spoiled, contact us promptly with your order number and details so we can review it. Depending on the issue and applicable law, we may arrange a replacement, refund or another appropriate resolution. Approved refunds are sent using an appropriate payment method; the time for the funds to appear may depend on your bank or payment provider.
            </p>
            <p>Read the full <Link href="/return-policy" className="font-bold text-[#B4232C] underline underline-offset-4">Returns &amp; Refunds policy</Link>. Nothing in these terms removes a consumer right or remedy available under applicable law.</p>
          </TermsSection>

          <TermsSection id="accounts" title="Your account and information">
            <p>
              Keep your account and delivery details accurate and up to date. You are responsible for maintaining access to your sign-in method and for activity carried out through your account. Contact us promptly if you believe your account has been accessed without your permission.
            </p>
            <p>We use order and contact details to process orders, communicate with you and arrange delivery. For privacy questions, write to <a href="mailto:support@redveg.in?subject=Privacy%20question" className="font-bold text-[#B4232C] underline underline-offset-4">support@redveg.in</a>.</p>
          </TermsSection>

          <TermsSection id="site-use" title="Using the website">
            <p>
              Use the website lawfully and provide accurate information. Do not interfere with the website, attempt unauthorized access, submit fraudulent orders, or use the service in a way that disrupts other customers. We may suspend access where reasonably necessary to protect customers, the service or our business, subject to applicable law.
            </p>
          </TermsSection>

          <TermsSection id="responsibility" title="Our responsibility">
            <p>
              We work to keep product, price, stock and delivery information current, but an occasional error or interruption may occur. If we discover a material order or listing error, we will contact you to resolve it. Nothing in these terms excludes liability that cannot lawfully be excluded or limits your statutory consumer rights.
            </p>
          </TermsSection>

          <TermsSection id="grievances" title="Complaints and grievance redressal">
            <p>
              For an order concern or consumer complaint, contact RedVeg Customer Support using the details below and include your order number and a description of the issue. We will acknowledge consumer complaints within 48 hours and seek to redress them within one month, in accordance with applicable requirements.
            </p>
          </TermsSection>

          <TermsSection id="law" title="Governing law">
            <p>
              These terms are governed by the laws of India. Any dispute will be handled by a forum or court with jurisdiction under applicable law; nothing here restricts your right to approach a competent consumer forum.
            </p>
          </TermsSection>

          <section className="rounded-2xl bg-[#17110F] p-6 text-white sm:p-7" aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="text-xl font-black">RedVeg Customer Support</h2>
            <p className="mt-2 text-sm leading-6 text-white/75">REDVEG FOOD VENTURES PRIVATE LIMITED COMPANY<br />Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, P.O. Dum Dum, Kolkata, West Bengal 700065</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:gap-7">
              <a className="inline-flex items-center gap-2 font-bold text-white underline decoration-white/40 underline-offset-4 hover:text-[#A5D68C]" href="tel:+918910558446"><Phone className="size-4" aria-hidden="true" />+91 89105 58446</a>
              <a className="inline-flex items-center gap-2 font-bold text-white underline decoration-white/40 underline-offset-4 hover:text-[#A5D68C]" href="mailto:support@redveg.in"><Mail className="size-4" aria-hidden="true" />support@redveg.in</a>
            </div>
          </section>
        </article>
      </main>
    </StoreShell>
  );
}
