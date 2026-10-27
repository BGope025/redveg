import { StoreShell } from "@/components/storefront/StoreShell";
import { SeoMetadata } from "@/components/storefront/SeoMetadata";
import { Link } from "wouter";
import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

const sections = [
  ["information", "Information we collect"],
  ["use", "How we use information"],
  ["location", "Delivery location"],
  ["payments", "Payments"],
  ["sharing", "When information is shared"],
  ["analytics", "Cookies, storage and advertising measurement"],
  ["retention", "How long we keep information"],
  ["choices", "Your choices and requests"],
  ["security", "Security and children"],
  ["changes", "Changes to this policy"],
] as const;

function PolicySection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-[#E9DED7] pb-7 last:border-0">
      <h2 className="text-lg font-black tracking-tight text-[#251B18] sm:text-xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-[#635752]">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <StoreShell>
      <SeoMetadata
        title="Privacy Policy | RedVeg"
        description="Learn how RedVeg collects, uses and shares information when you browse, sign in and place an order."
        canonicalPath="/privacy-policy"
      />
      <header className="bg-[#F7F0EA] px-5 py-12 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-serif text-4xl font-black tracking-tight text-[#251B18] sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#635752]">
            This policy describes the information RedVeg handles when you visit our website, use an account, contact us or order fresh food for delivery.
          </p>
          <p className="mt-5 text-xs font-bold text-[#756761]">Effective 25 October 2026</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:py-14 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="self-start lg:sticky lg:top-24">
          <h2 className="text-xs font-black uppercase tracking-[0.16em] text-[#756761]">On this page</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-1">
            {sections.map(([id, title]) => (
              <li key={id}><a className="text-[#635752] underline decoration-[#D9C8BE] underline-offset-4 hover:text-[#B4232C] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C]" href={`#${id}`}>{title}</a></li>
            ))}
          </ul>
        </nav>

        <article className="max-w-3xl space-y-8">
          <div className="flex gap-3 rounded-2xl border border-[#E8D9D2] bg-white p-5 text-sm leading-6 text-[#51443F]">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#267345]" aria-hidden="true" />
            <p>We use information to provide and support your orders, operate customer accounts, and improve how the RedVeg storefront works. You can contact us with a privacy question or request using the details at the end of this page.</p>
          </div>

          <PolicySection id="information" title="Information we collect">
            <p>Depending on how you use RedVeg, we may handle information you provide, including your name, email address, phone number, account sign-in details, delivery address, locality, pincode, landmark, delivery notes, order contents, payment status, and messages or other details you send to customer support.</p>
            <p>When you browse or use the storefront, our systems and service providers may receive technical information such as device and browser details, pages or products viewed, interaction events, approximate network information, and diagnostic or security logs.</p>
          </PolicySection>

          <PolicySection id="use" title="How we use information">
            <p>We use information to create and manage accounts; prepare, confirm, deliver and support orders; calculate delivery availability and charges; process eligible offers; verify payments; communicate about orders and support requests; protect the website and prevent misuse; maintain business and transaction records; and understand storefront performance and advertising campaign activity.</p>
            <p>We use information for these purposes and other purposes explained to you when information is collected, as permitted by applicable law.</p>
          </PolicySection>

          <PolicySection id="location" title="Delivery location">
            <p>You may provide a pincode and address to check delivery serviceability and calculate a delivery estimate. If you choose a current-location feature and allow your browser to access location, the storefront may use the location coordinates you authorize to make a more precise delivery estimate. You can instead enter a delivery area or address manually and manage location permission in your browser settings.</p>
          </PolicySection>

          <PolicySection id="payments" title="Payments">
            <p>Online payments are processed through Razorpay and its participating banks or payment providers. Those providers handle payment details under their own terms and privacy practices. RedVeg receives information needed to identify the order and confirm its payment status. Do not send us your card PIN, banking password or one-time password.</p>
          </PolicySection>

          <PolicySection id="sharing" title="When information is shared">
            <p>We share information with service providers when needed to operate the storefront and fulfil the purposes above. These include Firebase and Google services used for customer sign-in and account functions, Razorpay and payment partners for online payments, Meta Platforms for advertising measurement, and providers that support website hosting, security, communications, maps or delivery estimates.</p>
            <p>We may also disclose information when needed to respond to a lawful request, protect customers or the service, address fraud or security issues, or establish and defend legal claims. We do not publish your account or order details for other customers to see.</p>
          </PolicySection>

          <PolicySection id="analytics" title="Cookies, storage and advertising measurement">
            <p>The storefront uses browser storage to remember choices such as your cart, selected delivery area and coupon entry, and may use cookies or similar technologies for sign-in, security and site operation. Clearing browser storage may remove saved preferences or an unsubmitted cart.</p>
            <p>RedVeg uses Meta Pixel to measure visits and storefront actions such as product views, cart additions, checkout starts and completed purchases. These events can include product, order and transaction-value information. Meta may receive device or browser identifiers and process information under its own policies. You can review advertising preferences in your Meta account and use browser controls to restrict cookies or tracking technologies; some site features may not work as expected when storage is blocked.</p>
          </PolicySection>

          <PolicySection id="retention" title="How long we keep information">
            <p>We keep information for as long as reasonably needed to provide the service, maintain customer and transaction records, resolve support issues, protect the service, and meet applicable legal or accounting requirements. Retention periods can differ depending on the type of information and why it was collected. When information is no longer needed for these purposes, it will be deleted or otherwise handled as permitted by law.</p>
          </PolicySection>

          <PolicySection id="choices" title="Your choices and requests">
            <p>You can update account or delivery details through available account features, change location permissions in your browser, clear browser storage, or contact us to ask about access, correction, deletion, or another privacy concern. We may need to verify your request before acting and may retain information where required or permitted by law.</p>
            <p>For privacy requests, email <a className="font-bold text-[#B4232C] underline underline-offset-4" href="mailto:support@redveg.in?subject=Privacy%20request">support@redveg.in</a> from the address or phone number associated with the request where possible. You can also call +91 89105 58446.</p>
          </PolicySection>

          <PolicySection id="security" title="Security and children">
            <p>We use reasonable safeguards designed to protect information, but no online service can guarantee complete security. Please keep your sign-in methods private and contact us promptly if you suspect unauthorized access to your account.</p>
            <p>RedVeg’s storefront is intended for people placing household food orders. A parent or guardian should contact us if they believe a child has provided personal information to RedVeg.</p>
          </PolicySection>

          <PolicySection id="changes" title="Changes to this policy">
            <p>We may update this policy when our services or information practices change. The current version will be posted on this page with its effective date. Please check this page periodically for updates.</p>
          </PolicySection>

          <section className="rounded-2xl bg-[#17110F] p-6 text-white sm:p-7" aria-labelledby="privacy-contact-heading">
            <h2 id="privacy-contact-heading" className="text-xl font-black">Privacy contact</h2>
            <p className="mt-2 text-sm leading-6 text-white/75">REDVEG FOOD VENTURES PRIVATE LIMITED COMPANY<br />Prantik Sarani, Rabindra Nagar, Dum Dum Cantonment, P.O. Dum Dum, Kolkata, West Bengal 700065</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:gap-7">
              <a className="inline-flex items-center gap-2 font-bold text-white underline decoration-white/40 underline-offset-4 hover:text-[#A5D68C]" href="tel:+918910558446"><Phone className="size-4" aria-hidden="true" />+91 89105 58446</a>
              <a className="inline-flex items-center gap-2 font-bold text-white underline decoration-white/40 underline-offset-4 hover:text-[#A5D68C]" href="mailto:support@redveg.in"><Mail className="size-4" aria-hidden="true" />support@redveg.in</a>
              <Link href="/terms" className="inline-flex items-center gap-2 font-bold text-white underline decoration-white/40 underline-offset-4 hover:text-[#A5D68C]"><MapPin className="size-4" aria-hidden="true" />Terms &amp; Conditions</Link>
            </div>
          </section>
          <p className="text-xs leading-6 text-[#756761]">For information about order acceptance, delivery, cancellation or refunds, also see our <Link href="/return-policy" className="font-bold text-[#B4232C] underline underline-offset-4">Returns &amp; refunds policy</Link>.</p>
        </article>
      </main>
    </StoreShell>
  );
}
