import type { OrderStatus } from "@/types/commerce";

const styles: Record<OrderStatus, string> = {
  New: "bg-[#FCE7E7] text-[#B4232C]",
  Confirmed: "bg-[#E8EDFA] text-[#345AA8]",
  Processing: "bg-[#FFF0CD] text-[#8A5A00]",
  "Out for Delivery": "bg-[#E5F1F4] text-[#276B78]",
  Delivered: "bg-[#E4F3E5] text-[#267345]",
  Cancelled: "bg-[#EEEAE8] text-[#746965]",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const label = status === "New" ? "Pending" : status === "Confirmed" ? "Confirmed (Approved)" : status;
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-[0.68rem] font-black ${styles[status]}`}>{label}</span>;
}
