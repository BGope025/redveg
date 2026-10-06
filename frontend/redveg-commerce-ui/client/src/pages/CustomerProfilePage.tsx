import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowRight,
  FileText,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { StoreShell } from "@/components/storefront/StoreShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

type CustomerProfile = {
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  createdAt: string | null;
};

type SavedAddress = {
  id: string;
  label: string;
  recipientName: string;
  phoneNumber: string;
  addressLine: string;
  locality: string;
  landmark: string;
  pincode: string;
  createdAt: string;
};

type OrderReceipt = {
  id: string;
  receiptNumber: string;
  status: string;
  createdAt: string;
  customerName: string;
  phoneNumber: string;
  address: string;
  subtotalAmount: number;
  discountAmount: number;
  deliveryFee: number;
  couponCode: string | null;
  totalAmount: number;
  paymentStatus: string;
  receivedAmount: number;
  balanceAmount: number;
  items: Array<{
    productName: string;
    variantLabel: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};

type AddressForm = {
  label: string;
  recipientName: string;
  phoneNumber: string;
  addressLine: string;
  locality: string;
  landmark: string;
  pincode: string;
};

const emptyAddress: AddressForm = {
  label: "Home",
  recipientName: "",
  phoneNumber: "",
  addressLine: "",
  locality: "",
  landmark: "",
  pincode: "",
};

async function requestAccountData<T>(
  path: string,
  token: string,
  init: RequestInit = {}
) {
  const response = await apiFetch(path, init, {
    forceBackend: true,
    authToken: token,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(
      payload?.message || "Your account data could not be loaded."
    );
  }
  return payload.data as T;
}

function formatMoney(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (["delivered", "completed", "paid"].includes(value)) {
    return "bg-[#E9F4E8] text-[#28643C]";
  }
  if (["cancelled", "canceled", "failed"].includes(value)) {
    return "bg-[#FBE9E7] text-[#A82A2A]";
  }
  return "bg-[#F8F0E4] text-[#7B531B]";
}

export default function CustomerProfilePage() {
  const { user, getCustomerIdToken, signOutUser } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [orders, setOrders] = useState<OrderReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [removingAddressId, setRemovingAddressId] = useState<string | null>(
    null
  );
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddress);
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null);
  const sessionVersionRef = useRef(0);

  useEffect(() => {
    let active = true;
    sessionVersionRef.current += 1;
    setProfile(null);
    setAddresses([]);
    setOrders([]);
    setShowAddressForm(false);
    setSavingAddress(false);
    setRemovingAddressId(null);
    setAddressForm(emptyAddress);
    setOpenReceiptId(null);
    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getCustomerIdToken();
        if (!token)
          throw new Error("Your sign-in has expired. Please sign in again.");
        const [profileData, orderData] = await Promise.all([
          requestAccountData<{
            profile: CustomerProfile | null;
            addresses: SavedAddress[];
          }>("customers/me", token),
          requestAccountData<OrderReceipt[]>("customers/me/orders", token),
        ]);
        if (!active) return;
        setProfile(profileData.profile);
        setAddresses(profileData.addresses || []);
        setOrders(orderData || []);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Your account data could not be loaded."
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    if (user?.uid) void loadProfile();
    return () => {
      active = false;
    };
  }, [user?.uid, getCustomerIdToken]);

  const updateAddressField =
    (field: keyof AddressForm) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setAddressForm(current => ({ ...current, [field]: event.target.value }));

  const saveAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    const operationVersion = sessionVersionRef.current;
    setSavingAddress(true);
    try {
      const token = await getCustomerIdToken();
      if (!token)
        throw new Error("Your sign-in has expired. Please sign in again.");
      const address = await requestAccountData<SavedAddress>(
        "customers/me/addresses",
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(addressForm),
        }
      );
      if (sessionVersionRef.current !== operationVersion) return;
      setAddresses(current => [address, ...current]);
      setAddressForm(emptyAddress);
      setShowAddressForm(false);
      toast.success("Address saved to your profile.");
    } catch (saveError) {
      if (sessionVersionRef.current !== operationVersion) return;
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save this address."
      );
    } finally {
      if (sessionVersionRef.current === operationVersion)
        setSavingAddress(false);
    }
  };

  const removeAddress = async (addressId: string) => {
    const operationVersion = sessionVersionRef.current;
    setRemovingAddressId(addressId);
    try {
      const token = await getCustomerIdToken();
      if (!token)
        throw new Error("Your sign-in has expired. Please sign in again.");
      await requestAccountData<{ id: string }>(
        `customers/me/addresses/${encodeURIComponent(addressId)}`,
        token,
        { method: "DELETE" }
      );
      if (sessionVersionRef.current !== operationVersion) return;
      setAddresses(current =>
        current.filter(address => address.id !== addressId)
      );
      toast.success("Saved address removed.");
    } catch (removeError) {
      if (sessionVersionRef.current !== operationVersion) return;
      toast.error(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove this address."
      );
    } finally {
      if (sessionVersionRef.current === operationVersion)
        setRemovingAddressId(null);
    }
  };

  const visibleName = profile?.displayName || user?.displayName || "My profile";
  const visibleEmail = profile?.email || user?.email;
  const visiblePhone = profile?.phoneNumber || user?.phoneNumber;

  return (
    <StoreShell>
      <div className="min-h-[70vh] bg-[#FBF7F2] py-8 sm:py-12">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-5 rounded-2xl bg-[#261A16] p-6 text-white shadow-[0_18px_45px_rgba(50,26,20,.16)] sm:flex-row sm:items-end sm:justify-between sm:p-9">
            <div className="min-w-0">
              <h1 className="break-words font-display text-3xl font-black tracking-[-0.035em] sm:text-4xl">
                My Profile
              </h1>
              <p className="mt-2 text-sm font-semibold text-[#EBC7A8]">
                {visibleName !== "My profile"
                  ? visibleName
                  : "Manage your RedVeg account details."}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/75">
                {visibleEmail && <span>{visibleEmail}</span>}
                {visiblePhone && <span>{visiblePhone}</span>}
                {!visibleEmail && !visiblePhone && (
                  <span>Signed in with your RedVeg account</span>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => void signOutUser()}
              className="shrink-0 rounded-full border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Sign out
            </Button>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-6 flex flex-col gap-3 rounded-2xl border border-[#E7B8B4] bg-[#FFF3F1] p-5 text-sm text-[#8E2926] sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{error}</span>
              {/expired|invalid|sign[ -]in/i.test(error) && (
                <Link
                  href="/login?returnTo=%2Fprofile"
                  className="inline-flex shrink-0 items-center gap-2 font-bold underline underline-offset-4"
                >
                  Sign in again <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          )}

          {loading ? (
            <div
              className="grid min-h-72 place-items-center"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-3 text-sm font-semibold text-[#66554D]">
                <Loader2 className="size-5 animate-spin text-[#B4232C]" />{" "}
                Loading your profile from RedVeg…
              </div>
            </div>
          ) : !error ? (
            <div className="mt-7 grid items-start gap-6 lg:grid-cols-[0.82fr_1.18fr]">
              <div className="space-y-6">
                <section
                  className="rounded-2xl bg-white p-5 shadow-[0_12px_32px_rgba(51,30,23,.06)] sm:p-6"
                  aria-labelledby="saved-addresses-heading"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2
                        id="saved-addresses-heading"
                        className="text-xl font-black tracking-tight text-[#2A1D19]"
                      >
                        Saved addresses
                      </h2>
                      <p className="mt-1 text-sm leading-5 text-[#74645D]">
                        Only you can see and manage these delivery details.
                      </p>
                    </div>
                    {!showAddressForm && (
                      <Button
                        type="button"
                        onClick={() => setShowAddressForm(true)}
                        className="size-10 shrink-0 rounded-full bg-[#B4232C] p-0 text-white hover:bg-[#941D25]"
                        aria-label="Add a saved address"
                      >
                        <Plus className="size-5" />
                      </Button>
                    )}
                  </div>

                  {showAddressForm && (
                    <form
                      onSubmit={saveAddress}
                      className="mt-5 space-y-4 rounded-xl bg-[#FBF7F2] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold text-[#2A1D19]">
                          Add an address
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddressForm(false);
                            setAddressForm(emptyAddress);
                          }}
                          className="grid size-8 place-items-center rounded-full text-[#74645D] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C]"
                          aria-label="Close address form"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <AddressField label="Label">
                          <Input
                            required
                            value={addressForm.label}
                            onChange={updateAddressField("label")}
                            placeholder="Home, work…"
                            className="rounded-lg bg-white"
                          />
                        </AddressField>
                        <AddressField label="Recipient name">
                          <Input
                            required
                            value={addressForm.recipientName}
                            onChange={updateAddressField("recipientName")}
                            className="rounded-lg bg-white"
                          />
                        </AddressField>
                        <AddressField label="Phone">
                          <Input
                            required
                            type="tel"
                            value={addressForm.phoneNumber}
                            onChange={updateAddressField("phoneNumber")}
                            inputMode="tel"
                            className="rounded-lg bg-white"
                          />
                        </AddressField>
                        <AddressField label="Pincode">
                          <Input
                            required
                            value={addressForm.pincode}
                            onChange={updateAddressField("pincode")}
                            inputMode="numeric"
                            maxLength={6}
                            className="rounded-lg bg-white"
                          />
                        </AddressField>
                      </div>
                      <AddressField label="House, street and building">
                        <Input
                          required
                          value={addressForm.addressLine}
                          onChange={updateAddressField("addressLine")}
                          className="rounded-lg bg-white"
                        />
                      </AddressField>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <AddressField label="Locality">
                          <Input
                            required
                            value={addressForm.locality}
                            onChange={updateAddressField("locality")}
                            className="rounded-lg bg-white"
                          />
                        </AddressField>
                        <AddressField label="Landmark">
                          <Input
                            value={addressForm.landmark}
                            onChange={updateAddressField("landmark")}
                            className="rounded-lg bg-white"
                          />
                        </AddressField>
                      </div>
                      <Button
                        type="submit"
                        disabled={savingAddress}
                        className="w-full rounded-full bg-[#B4232C] font-bold text-white hover:bg-[#941D25]"
                      >
                        {savingAddress ? (
                          <>
                            <Loader2 className="size-4 animate-spin" /> Saving…
                          </>
                        ) : (
                          "Save address"
                        )}
                      </Button>
                    </form>
                  )}

                  {addresses.length === 0 ? (
                    <div className="mt-5 rounded-xl bg-[#FBF7F2] px-4 py-6 text-center">
                      <MapPin className="mx-auto size-5 text-[#8B756B]" />
                      <p className="mt-2 text-sm font-bold text-[#3B2C26]">
                        No saved addresses yet
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#74645D]">
                        Add a delivery address to keep it with your account.
                      </p>
                    </div>
                  ) : (
                    <ul className="mt-5 space-y-3">
                      {addresses.map(address => (
                        <li
                          key={address.id}
                          className="rounded-xl bg-[#FBF7F2] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-bold text-[#2A1D19]">
                                <MapPin className="size-4 shrink-0 text-[#267345]" />
                                {address.label}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-[#3B2C26]">
                                {address.recipientName}{" "}
                                <span className="font-normal text-[#74645D]">
                                  · {address.phoneNumber}
                                </span>
                              </p>
                              <p className="mt-1 text-sm leading-5 text-[#74645D]">
                                {address.addressLine}, {address.locality}
                                {address.landmark
                                  ? ` · ${address.landmark}`
                                  : ""}{" "}
                                · {address.pincode}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={removingAddressId === address.id}
                              onClick={() => void removeAddress(address.id)}
                              className="grid size-9 shrink-0 place-items-center rounded-full text-[#8A625C] transition-colors hover:bg-white hover:text-[#A82A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C] disabled:opacity-50"
                              aria-label={`Remove ${address.label} address`}
                            >
                              {removingAddressId === address.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section
                  className="rounded-2xl bg-white p-5 shadow-[0_12px_32px_rgba(51,30,23,.06)] sm:p-6"
                  aria-labelledby="account-details-heading"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-[#F7E9E3] text-[#8B332E]">
                      <UserRound className="size-5" />
                    </span>
                    <div>
                      <h2
                        id="account-details-heading"
                        className="font-black text-[#2A1D19]"
                      >
                        Account details
                      </h2>
                      <p className="text-xs text-[#74645D]">
                        From your verified sign-in
                      </p>
                    </div>
                  </div>
                  <dl className="mt-5 space-y-3 text-sm">
                    <ProfileDetail
                      label="Name"
                      value={profile?.displayName || user?.displayName}
                    />
                    <ProfileDetail
                      label="Email"
                      value={profile?.email || user?.email}
                    />
                    <ProfileDetail
                      label="Phone"
                      value={profile?.phoneNumber || user?.phoneNumber}
                    />
                  </dl>
                </section>
              </div>

              <section
                className="rounded-2xl bg-white p-5 shadow-[0_12px_32px_rgba(51,30,23,.06)] sm:p-6"
                aria-labelledby="orders-heading"
              >
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2
                      id="orders-heading"
                      className="text-xl font-black tracking-tight text-[#2A1D19]"
                    >
                      Orders & receipts
                    </h2>
                    <p className="mt-1 text-sm text-[#74645D]">
                      Order history loaded for this signed-in account.
                    </p>
                    <p className="mt-2 max-w-xl text-xs leading-5 text-[#74645D]">
                      Receipts are based on these saved orders. Historical
                      sales-report invoices are not linked to Firebase accounts,
                      so they are not matched by name or phone.
                    </p>
                  </div>
                  <span className="rounded-full bg-[#F6F1EC] px-3 py-1.5 text-xs font-bold tabular-nums text-[#65534C]">
                    {orders.length} {orders.length === 1 ? "order" : "orders"}
                  </span>
                </div>

                {orders.length === 0 ? (
                  <div className="mt-6 rounded-xl bg-[#FBF7F2] px-5 py-10 text-center">
                    <PackageCheck className="mx-auto size-7 text-[#8B756B]" />
                    <h3 className="mt-3 font-bold text-[#3B2C26]">
                      No orders on this account yet
                    </h3>
                    <p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-[#74645D]">
                      Orders placed while signed in will appear here with their
                      saved item and total details.
                    </p>
                    <Link
                      href="/shop"
                      className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#B4232C]"
                    >
                      Explore the shop <ArrowRight className="size-4" />
                    </Link>
                  </div>
                ) : (
                  <ul className="mt-5 space-y-4">
                    {orders.map(order => {
                      const receiptOpen = openReceiptId === order.id;
                      return (
                        <li
                          key={order.id}
                          className="overflow-hidden rounded-xl bg-[#FBF7F2]"
                        >
                          <div className="p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="break-all text-sm font-black text-[#2A1D19]">
                                  {order.id}
                                </p>
                                <p className="mt-1 text-xs text-[#74645D]">
                                  {formatDate(order.createdAt)}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[0.68rem] font-black capitalize ${statusTone(order.status)}`}
                              >
                                {order.status.replace(/[_-]/g, " ")}
                              </span>
                            </div>
                            <div className="mt-4 flex items-end justify-between gap-3 border-t border-[#E9DED5] pt-3">
                              <div>
                                <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#74645D]">
                                  Order total
                                </p>
                                <p className="mt-0.5 text-lg font-black tabular-nums text-[#2A1D19]">
                                  {formatMoney(order.totalAmount)}
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-expanded={receiptOpen}
                                onClick={() =>
                                  setOpenReceiptId(
                                    receiptOpen ? null : order.id
                                  )
                                }
                                className="inline-flex items-center gap-2 rounded-full border border-[#DCCDC4] bg-white px-3.5 py-2 text-xs font-bold text-[#8B332E] transition-colors hover:bg-[#FFF8F3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4232C]"
                              >
                                <ReceiptText className="size-4" />{" "}
                                {receiptOpen ? "Hide receipt" : "View receipt"}
                              </button>
                            </div>
                          </div>
                          {receiptOpen && (
                            <div className="border-t border-[#E9DED5] bg-white p-4 sm:p-5">
                              <div className="flex items-center gap-2 text-sm font-black text-[#2A1D19]">
                                <FileText className="size-4 text-[#267345]" />{" "}
                                Order receipt{" "}
                                <span className="ml-auto break-all text-xs font-semibold text-[#74645D]">
                                  {order.receiptNumber}
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-[#74645D]">
                                This itemized receipt is based on the order
                                record saved at checkout.
                              </p>
                              <div className="mt-4 divide-y divide-[#EEE7E1]">
                                {order.items.map((item, index) => (
                                  <div
                                    key={`${item.productName}-${item.variantLabel}-${index}`}
                                    className="flex items-start justify-between gap-3 py-3 text-sm"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-bold text-[#3B2C26]">
                                        {item.productName}
                                      </p>
                                      <p className="mt-0.5 text-xs text-[#74645D]">
                                        {item.variantLabel
                                          ? `${item.variantLabel} · `
                                          : ""}
                                        {item.quantity} ×{" "}
                                        {formatMoney(item.unitPrice)}
                                      </p>
                                    </div>
                                    <span className="shrink-0 font-bold tabular-nums text-[#3B2C26]">
                                      {formatMoney(item.lineTotal)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="space-y-2 border-t border-[#EEE7E1] pt-3 text-sm">
                                <ReceiptRow
                                  label="Subtotal"
                                  value={formatMoney(order.subtotalAmount)}
                                />
                                {order.discountAmount > 0 && (
                                  <ReceiptRow
                                    label={`Discount${order.couponCode ? ` · ${order.couponCode}` : ""}`}
                                    value={`−${formatMoney(order.discountAmount)}`}
                                  />
                                )}
                                <ReceiptRow
                                  label="Delivery"
                                  value={
                                    order.deliveryFee > 0
                                      ? formatMoney(order.deliveryFee)
                                      : "Free"
                                  }
                                />
                                <ReceiptRow
                                  label="Total"
                                  value={formatMoney(order.totalAmount)}
                                  strong
                                />
                                <ReceiptRow
                                  label="Payment status"
                                  value={order.paymentStatus.replace(
                                    /[_-]/g,
                                    " "
                                  )}
                                />
                              </div>
                              <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#F3F7F0] p-3 text-xs leading-5 text-[#3E6244]">
                                <ShieldCheck className="mt-0.5 size-4 shrink-0" />{" "}
                                Order and receipt details are visible only to
                                the account that placed this order.
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </StoreShell>
  );
}

function AddressField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-xs font-bold text-[#51423C]">
      <span className="block">{label}</span>
      {children}
    </label>
  );
}

function ProfileDetail({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#F0EAE5] pb-2 last:border-0 last:pb-0">
      <dt className="text-[#74645D]">{label}</dt>
      <dd className="max-w-[65%] break-words text-right font-semibold text-[#342721]">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${strong ? "pt-1 text-base font-black text-[#2A1D19]" : "text-[#74645D]"}`}
    >
      <span>{label}</span>
      <span
        className={`text-right tabular-nums ${strong ? "" : "font-semibold text-[#3B2C26]"}`}
      >
        {value}
      </span>
    </div>
  );
}
