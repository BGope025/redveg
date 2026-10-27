import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, RefreshCw, Search, Upload, Users } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { parseCustomerWorkbook, type ImportedCustomerRow } from "@/lib/customerWorkbook";
import { formatISTDate } from "@/lib/dateTime";

type SalesReportSummary = {
  invoiceCount: number;
  paidInvoiceCount: number;
  partialInvoiceCount: number;
  unpaidInvoiceCount: number;
  clearedAmount: number;
  dueAmount: number;
  cancelledInvoiceCount: number;
};

type Customer = {
  customer_id: string;
  name: string;
  phoneNo?: string | null;
  created_at?: string | null;
  first_sale_date?: string | null;
  recordType?: "account" | "sales_report" | "firebase" | "imported";
  address?: string | null;
  locality?: string | null;
  pincode?: string | null;
  notes?: string | null;
  salesReport?: SalesReportSummary | null;
};

type PaymentStatus = "Paid" | "Partial" | "Unpaid" | "Cancelled";

type SalesInvoice = {
  invoiceNo: string;
  orderNo?: string | null;
  saleDate: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  receivedAmount: number;
  dueAmount: number;
  sourcePaymentStatus: string;
  sourceReceivedAmount: number;
  sourceDueAmount: number;
  isOverridden: boolean;
  paymentUpdatedAt?: string | null;
  lineItemCount: number;
  isEditable: boolean;
};

type InvoiceDraft = { paymentStatus: Exclude<PaymentStatus, "Cancelled">; dueAmount: string };

const PAGE_SIZE = 25;
const EMPTY_SALES_REPORT: SalesReportSummary = {
  invoiceCount: 0,
  paidInvoiceCount: 0,
  partialInvoiceCount: 0,
  unpaidInvoiceCount: 0,
  clearedAmount: 0,
  dueAmount: 0,
  cancelledInvoiceCount: 0,
};

function formatDate(value?: string | null) {
  return formatISTDate(value);
}

function formatINR(value?: number | null) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function normalizeEditableStatus(value: string): Exclude<PaymentStatus, "Cancelled"> {
  const status = value.trim().toLowerCase();
  return status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Unpaid";
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [salesReportSummary, setSalesReportSummary] = useState<SalesReportSummary>(EMPTY_SALES_REPORT);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [invoicesByCustomer, setInvoicesByCustomer] = useState<Record<string, SalesInvoice[]>>({});
  const [invoiceDrafts, setInvoiceDrafts] = useState<Record<string, InvoiceDraft>>({});
  const [loadingInvoicesFor, setLoadingInvoicesFor] = useState<string | null>(null);
  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({});
  const [savingInvoiceKey, setSavingInvoiceKey] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [workbookRows, setWorkbookRows] = useState<ImportedCustomerRow[]>([]);
  const [workbookName, setWorkbookName] = useState("");
  const [readingWorkbook, setReadingWorkbook] = useState(false);
  const [importingWorkbook, setImportingWorkbook] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState({ name: "", phone: "", address: "", locality: "", pincode: "", notes: "" });

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (search.trim()) params.set("search", search.trim());
      try {
        const response = await apiFetch(`customers?${params.toString()}`, { signal: controller.signal }, { forceBackend: true });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) throw new Error(payload.message || `Could not load customers (HTTP ${response.status})`);
        setCustomers(Array.isArray(payload.data) ? payload.data : []);
        setTotal(Math.max(0, Number(payload.count) || 0));
        const reportSummary = payload.salesReportSummary || {};
        setSalesReportSummary({
          invoiceCount: Number(reportSummary.invoiceCount) || 0,
          paidInvoiceCount: Number(reportSummary.paidInvoiceCount) || 0,
          partialInvoiceCount: Number(reportSummary.partialInvoiceCount) || 0,
          unpaidInvoiceCount: Number(reportSummary.unpaidInvoiceCount) || 0,
          clearedAmount: Number(reportSummary.clearedAmount) || 0,
          dueAmount: Number(reportSummary.dueAmount) || 0,
          cancelledInvoiceCount: Number(reportSummary.cancelledInvoiceCount) || 0,
        });
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setCustomers([]);
        setTotal(0);
        setSalesReportSummary(EMPTY_SALES_REPORT);
        setError(fetchError instanceof Error ? fetchError.message : "Could not load customers.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, search, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invoiceDraftKey = (customerId: string, invoiceNo: string) => `${customerId}:${invoiceNo}`;

  const toggleInvoices = async (customer: Customer, retry = false) => {
    const customerId = customer.customer_id;
    if (!retry && expandedCustomerId === customerId) {
      setExpandedCustomerId(null);
      return;
    }
    if (!retry) setExpandedCustomerId(customerId);
    if (!retry && invoicesByCustomer[customerId]) return;

    setLoadingInvoicesFor(customerId);
    setInvoiceErrors((current) => ({ ...current, [customerId]: "" }));
    try {
      const response = await apiFetch(`customers/${encodeURIComponent(customerId)}/sales-invoices`, {}, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Could not load this customer’s invoices");
      const invoices = Array.isArray(payload.data) ? payload.data as SalesInvoice[] : [];
      setInvoicesByCustomer((current) => ({ ...current, [customerId]: invoices }));
      setInvoiceDrafts((current) => {
        const next = { ...current };
        for (const invoice of invoices) {
          next[invoiceDraftKey(customerId, invoice.invoiceNo)] = {
            paymentStatus: normalizeEditableStatus(invoice.paymentStatus),
            dueAmount: String(invoice.dueAmount),
          };
        }
        return next;
      });
    } catch (loadError) {
      setInvoiceErrors((current) => ({ ...current, [customerId]: loadError instanceof Error ? loadError.message : "Could not load invoices" }));
    } finally {
      setLoadingInvoicesFor((current) => current === customerId ? null : current);
    }
  };

  const updateInvoiceDraft = (customerId: string, invoice: SalesInvoice, status: Exclude<PaymentStatus, "Cancelled">) => {
    const key = invoiceDraftKey(customerId, invoice.invoiceNo);
    setInvoiceDrafts((current) => {
      const existing = current[key] || { paymentStatus: normalizeEditableStatus(invoice.paymentStatus), dueAmount: String(invoice.dueAmount) };
      let dueAmount = Number(existing.dueAmount);
      if (status === "Paid") dueAmount = 0;
      else if (status === "Unpaid") dueAmount = invoice.totalAmount;
      else if (!(dueAmount > 0 && dueAmount < invoice.totalAmount)) dueAmount = Number((invoice.totalAmount / 2).toFixed(2));
      return { ...current, [key]: { paymentStatus: status, dueAmount: String(dueAmount) } };
    });
  };

  const saveInvoicePayment = async (customerId: string, invoice: SalesInvoice, reset = false) => {
    const key = invoiceDraftKey(customerId, invoice.invoiceNo);
    const draft = invoiceDrafts[key] || { paymentStatus: normalizeEditableStatus(invoice.paymentStatus), dueAmount: String(invoice.dueAmount) };
    setSavingInvoiceKey(key);
    try {
      const response = await apiFetch(`customers/${encodeURIComponent(customerId)}/sales-invoices/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { invoiceNo: invoice.invoiceNo, reset: true } : {
          invoiceNo: invoice.invoiceNo,
          paymentStatus: draft.paymentStatus.toLowerCase(),
          dueAmount: Number(draft.dueAmount),
        }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Payment update failed");
      const updated = payload.data as SalesInvoice;
      setInvoicesByCustomer((current) => ({
        ...current,
        [customerId]: (current[customerId] || []).map((row) => row.invoiceNo === updated.invoiceNo ? updated : row),
      }));
      setInvoiceDrafts((current) => ({ ...current, [key]: {
        paymentStatus: normalizeEditableStatus(updated.paymentStatus),
        dueAmount: String(updated.dueAmount),
      } }));
      setRefreshKey((current) => current + 1);
      toast.success(reset ? `Restored ${invoice.invoiceNo} to the report values` : `Payment updated for ${invoice.invoiceNo}`);
    } catch (saveError) {
      toast.error("Could not update invoice payment", { description: saveError instanceof Error ? saveError.message : "Please try again." });
    } finally {
      setSavingInvoiceKey(null);
    }
  };

  const readWorkbook = async (file?: File) => {
    setWorkbookRows([]);
    setWorkbookName("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Choose an .xlsx Excel workbook", { description: "Save older .xls workbooks as .xlsx in Excel first." });
      return;
    }
    setReadingWorkbook(true);
    try {
      const rows = await parseCustomerWorkbook(file);
      if (!rows.length) throw new Error("No customer rows were found on the first worksheet.");
      setWorkbookRows(rows);
      setWorkbookName(file.name);
    } catch (parseError) {
      toast.error("Could not read this workbook", { description: parseError instanceof Error ? parseError.message : "Check the file and try again." });
    } finally {
      setReadingWorkbook(false);
    }
  };

  const submitWorkbook = async () => {
    if (!workbookRows.length) return;
    setImportingWorkbook(true);
    try {
      const response = await apiFetch("customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: workbookName, customers: workbookRows }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Customer import failed");
      const summary = payload.data || {};
      toast.success(`${Number(summary.inserted) || 0} new customers added`, {
        description: `${Number(summary.skippedDuplicates) || 0} duplicate${Number(summary.skippedDuplicates) === 1 ? "" : "s"} skipped · ${Number(summary.rejected) || 0} invalid row${Number(summary.rejected) === 1 ? "" : "s"} skipped`,
      });
      setImportOpen(false);
      setWorkbookRows([]);
      setWorkbookName("");
      setRefreshKey((current) => current + 1);
    } catch (importError) {
      toast.error("Could not import customers", { description: importError instanceof Error ? importError.message : "Please try again." });
    } finally {
      setImportingWorkbook(false);
    }
  };

  const startEditingCustomer = (customer: Customer) => {
    setCustomerDraft({ name: customer.name || "", phone: customer.phoneNo || "", address: customer.address || "", locality: customer.locality || "", pincode: customer.pincode || "", notes: customer.notes || "" });
    setEditingCustomer(customer);
  };

  const saveImportedCustomer = async () => {
    if (!editingCustomer) return;
    setSavingCustomer(true);
    try {
      const response = await apiFetch(`customers/imported/${encodeURIComponent(editingCustomer.customer_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerDraft),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.message || "Customer update failed");
      setEditingCustomer(null);
      setRefreshKey((current) => current + 1);
      toast.success("Imported customer updated");
    } catch (saveError) {
      toast.error("Could not update customer", { description: saveError instanceof Error ? saveError.message : "Please try again." });
    } finally {
      setSavingCustomer(false);
    }
  };

  return (
    <AdminShell title="Customers" subtitle="Registered accounts, imported phone customers, and sales-report parties. Firebase accounts remain separate from imported records.">
      <section className="mb-5 rounded-[1.5rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-black">Sales report payments</h2>
            <p className="text-xs text-muted-foreground">Across imported report invoices; cancelled invoices are excluded from balances.</p>
          </div>
          <p className="text-xs text-muted-foreground">{salesReportSummary.cancelledInvoiceCount.toLocaleString("en-IN")} cancelled invoices excluded</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl bg-[#FBF9F6] p-4"><p className="text-xs font-bold text-muted-foreground">Active invoices</p><p className="mt-2 text-xl font-black">{salesReportSummary.invoiceCount.toLocaleString("en-IN")}</p></div>
          <div className="rounded-xl bg-[#EEF6F0] p-4"><p className="text-xs font-bold text-muted-foreground">Paid</p><p className="mt-2 text-xl font-black">{salesReportSummary.paidInvoiceCount.toLocaleString("en-IN")}</p></div>
          <div className="rounded-xl bg-[#FFF7E8] p-4"><p className="text-xs font-bold text-muted-foreground">Partial</p><p className="mt-2 text-xl font-black">{salesReportSummary.partialInvoiceCount.toLocaleString("en-IN")}</p></div>
          <div className="rounded-xl bg-[#F8E7E6] p-4"><p className="text-xs font-bold text-muted-foreground">Unpaid</p><p className="mt-2 text-xl font-black">{salesReportSummary.unpaidInvoiceCount.toLocaleString("en-IN")}</p></div>
          <div className="rounded-xl bg-[#FBF9F6] p-4"><p className="text-xs font-bold text-muted-foreground">Cleared amount</p><p className="mt-2 text-lg font-black">{formatINR(salesReportSummary.clearedAmount)}</p></div>
          <div className="rounded-xl bg-[#FBF9F6] p-4"><p className="text-xs font-bold text-muted-foreground">Due amount</p><p className="mt-2 text-lg font-black">{formatINR(salesReportSummary.dueAmount)}</p></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-4 border-b border-black/5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-black">Customer directory</h2>
            <p className="mt-1 text-xs text-muted-foreground">{loading ? "Loading customer records…" : `${total.toLocaleString("en-IN")} ${total === 1 ? "directory entry" : "directory entries"}`}</p>
          </div>
          <div className="flex gap-2">
            <Button className="h-10 shrink-0 rounded-full bg-[#B4232C] px-4 text-xs font-black text-white hover:bg-[#941D25]" onClick={() => setImportOpen(true)}><Upload className="mr-2 size-4" />Import Excel</Button>
            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input aria-label="Search customers" className="h-10 w-full rounded-full border border-black/10 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[#B4232C]/40 focus:ring-4 focus:ring-[#B4232C]/10" onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search name, ID or phone" value={search} />
            </label>
            <Button aria-label="Refresh customers" className="size-10 shrink-0 rounded-full bg-[#F5F2EE] text-[#251B18] hover:bg-[#ECE6E1]" onClick={() => setRefreshKey((key) => key + 1)} size="icon" variant="ghost">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {error ? (
          <div className="m-5 flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center">
            <AlertCircle className="size-5 shrink-0 text-[#B4232C]" />
            <div className="flex-1"><p className="font-bold text-[#7F1D1D]">Customers couldn’t be loaded</p><p className="mt-1 text-sm text-[#7F1D1D]/80">{error}</p></div>
            <Button className="rounded-full" onClick={() => setRefreshKey((key) => key + 1)} variant="outline">Try again</Button>
          </div>
        ) : loading ? (
          <div className="space-y-3 p-6" aria-label="Loading customers" role="status">{[0, 1, 2, 3].map((row) => <div key={row} className="h-12 animate-pulse rounded-xl bg-[#F5F2EE]" />)}</div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-[#F8E7E6] text-[#B4232C]"><Users className="size-6" /></span>
            <h3 className="mt-5 text-lg font-black">{search.trim() ? "No matching customers" : "No customers registered yet"}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{search.trim() ? "Try another name, customer ID or phone number." : "Registered accounts, Firebase logins, and imported phone customers will appear here. Use Import Excel to add new customers without replacing existing records."}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left">
                <thead>
                  <tr className="border-b border-black/5 bg-[#FBF9F6] text-[0.65rem] font-black uppercase tracking-[0.13em] text-muted-foreground">
                    <th className="px-6 py-3">Customer</th><th className="px-4 py-3">Record type</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Customer ID</th><th className="px-4 py-3">Report payment status</th><th className="px-4 py-3">Cleared / due</th><th className="px-6 py-3">Joined / first sale</th><th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <Fragment key={customer.customer_id}>
                      <tr className="border-b border-black/5 last:border-0">
                        <td className="px-6 py-4 text-sm font-bold">
                          <div className="flex items-center gap-2">
                            <span>{customer.name || "Unnamed customer"}</span>
                            {customer.recordType === "sales_report" && (
                              <button type="button" aria-expanded={expandedCustomerId === customer.customer_id} onClick={() => void toggleInvoices(customer)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F7F4F1] px-3 py-1.5 text-[0.65rem] font-black text-[#51443F] hover:bg-[#EEE8E2]">
                                {expandedCustomerId === customer.customer_id ? "Hide invoices" : "Invoices"}
                                <ChevronDown className={`size-3.5 transition-transform ${expandedCustomerId === customer.customer_id ? "rotate-180" : ""}`} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs font-bold"><span className={customer.recordType === "sales_report" ? "rounded-full bg-[#F8E7E6] px-2.5 py-1 text-[#8E2028]" : customer.recordType === "imported" ? "rounded-full bg-[#FFF7E8] px-2.5 py-1 text-[#80520C]" : "rounded-full bg-[#EEF6F0] px-2.5 py-1 text-[#267345]"}>{customer.recordType === "sales_report" ? "Report only" : customer.recordType === "firebase" ? "Firebase login" : customer.recordType === "imported" ? "Phone order · imported" : "Account"}</span></td>
                        <td className="px-4 py-4 text-sm text-muted-foreground">{customer.phoneNo || (customer.recordType === "sales_report" ? "Not in report" : "—")}</td>
                        <td className="px-4 py-4 font-mono text-xs text-muted-foreground">{customer.recordType === "sales_report" ? "No login account" : customer.recordType === "firebase" ? "Firebase account" : customer.customer_id}</td>
                        <td className="px-4 py-4">{customer.recordType === "sales_report" && customer.salesReport ? <div className="flex flex-wrap gap-1.5 text-[0.65rem] font-bold"><span className="rounded-full bg-[#EEF6F0] px-2 py-1 text-[#267345]">Paid {customer.salesReport.paidInvoiceCount}</span><span className="rounded-full bg-[#FFF7E8] px-2 py-1 text-[#8A5B13]">Partial {customer.salesReport.partialInvoiceCount}</span><span className="rounded-full bg-[#F8E7E6] px-2 py-1 text-[#8E2028]">Unpaid {customer.salesReport.unpaidInvoiceCount}</span></div> : "—"}</td>
                        <td className="px-4 py-4 text-xs font-semibold">{customer.recordType === "sales_report" && customer.salesReport ? <div className="space-y-1 whitespace-nowrap"><p className="text-[#267345]">Cleared {formatINR(customer.salesReport.clearedAmount)}</p><p className="text-[#8E2028]">Due {formatINR(customer.salesReport.dueAmount)}</p></div> : "—"}</td>
                        <td className="px-6 py-4 text-xs font-semibold text-muted-foreground">{formatDate(customer.recordType === "sales_report" ? customer.first_sale_date : customer.created_at)}</td>
                        <td className="px-4 py-4">{customer.recordType === "imported" ? <Button aria-label={`Edit ${customer.name}`} className="rounded-full" onClick={() => startEditingCustomer(customer)} size="sm" variant="outline"><Pencil className="mr-1.5 size-3.5" />Edit</Button> : "—"}</td>
                      </tr>
                      {expandedCustomerId === customer.customer_id && customer.recordType === "sales_report" && (
                        <tr className="border-b border-black/5 bg-[#FCFAF7]"><td colSpan={8} className="px-5 py-5 sm:px-6">
                          <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-black">Invoice payment details</h3><p className="mt-1 text-xs text-muted-foreground">Update each sale separately. Cleared amount is calculated as invoice total minus due.</p></div><span className="text-[0.65rem] text-muted-foreground">Report source values can be restored at any time.</span></div>
                          {loadingInvoicesFor === customer.customer_id ? <div className="animate-pulse rounded-xl bg-[#F1ECE7] p-5 text-sm text-muted-foreground">Loading invoices…</div> : invoiceErrors[customer.customer_id] ? <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#7F1D1D]"><span>{invoiceErrors[customer.customer_id]}</span><Button size="sm" variant="outline" onClick={() => { void toggleInvoices(customer, true); }}>Retry</Button></div> : (invoicesByCustomer[customer.customer_id] || []).length === 0 ? <p className="rounded-xl bg-white p-5 text-sm text-muted-foreground">No invoice rows were found for this report-only entry.</p> : <div className="space-y-3">{(invoicesByCustomer[customer.customer_id] || []).map((invoice) => {
                            const key = invoiceDraftKey(customer.customer_id, invoice.invoiceNo);
                            const draft = invoiceDrafts[key] || { paymentStatus: normalizeEditableStatus(invoice.paymentStatus), dueAmount: String(invoice.dueAmount) };
                            const saving = savingInvoiceKey === key;
                            return <article key={invoice.invoiceNo} className="rounded-xl bg-white p-4 ring-1 ring-black/[0.05]">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div><p className="font-mono text-sm font-black">{invoice.invoiceNo}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(invoice.saleDate)}{invoice.orderNo ? ` · Order ${invoice.orderNo}` : ""} · {invoice.lineItemCount} line item{invoice.lineItemCount === 1 ? "" : "s"}</p></div>
                                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${invoice.paymentStatus === "Paid" ? "bg-[#EEF6F0] text-[#267345]" : invoice.paymentStatus === "Partial" ? "bg-[#FFF7E8] text-[#8A5B13]" : invoice.paymentStatus === "Unpaid" ? "bg-[#F8E7E6] text-[#8E2028]" : "bg-[#F1ECE7] text-[#655955]"}`}>{invoice.paymentStatus}</span>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3"><div className="rounded-lg bg-[#FBF9F6] p-3"><p className="text-muted-foreground">Invoice total</p><p className="mt-1 font-black">{formatINR(invoice.totalAmount)}</p></div><div className="rounded-lg bg-[#EEF6F0] p-3"><p className="text-muted-foreground">Cleared</p><p className="mt-1 font-black text-[#267345]">{formatINR(invoice.receivedAmount)}</p></div><div className="rounded-lg bg-[#F8E7E6] p-3"><p className="text-muted-foreground">Due</p><p className="mt-1 font-black text-[#8E2028]">{formatINR(invoice.dueAmount)}</p></div></div>
                              {invoice.isEditable ? <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
                                <label className="text-xs font-bold">Payment status<select value={draft.paymentStatus} onChange={(event) => updateInvoiceDraft(customer.customer_id, invoice, event.target.value as Exclude<PaymentStatus, "Cancelled">)} className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#B4232C]/40"><option value="Paid">Paid</option><option value="Partial">Partial</option><option value="Unpaid">Unpaid</option></select></label>
                                <label className="text-xs font-bold">Remaining due (₹)<input type="number" min="0" max={invoice.totalAmount} step="0.01" value={draft.dueAmount} disabled={draft.paymentStatus !== "Partial"} onChange={(event) => setInvoiceDrafts((current) => ({ ...current, [key]: { ...draft, dueAmount: event.target.value } }))} className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none disabled:bg-[#F5F2EE]" /></label>
                                <Button disabled={saving} onClick={() => void saveInvoicePayment(customer.customer_id, invoice)} className="h-10 rounded-full bg-[#17110F] px-5 text-xs font-black text-white">{saving ? "Saving…" : "Save payment"}</Button>
                                {invoice.isOverridden && <Button disabled={saving} onClick={() => void saveInvoicePayment(customer.customer_id, invoice, true)} variant="outline" className="h-10 rounded-full bg-white px-4 text-xs font-bold">Restore report</Button>}
                              </div> : <p className="mt-3 rounded-lg bg-[#F5F2EE] p-3 text-xs text-muted-foreground">This invoice is not an active sale and cannot be edited.</p>}
                              {invoice.isOverridden && <p className="mt-2 text-[0.65rem] text-muted-foreground">Adjusted by an admin{invoice.paymentUpdatedAt ? ` · ${formatDate(invoice.paymentUpdatedAt)}` : ""}. Original report values are retained.</p>}
                            </article>;
                          })}</div>}
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-black/5 px-5 py-4 sm:px-6">
              <p className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</p>
              <div className="flex gap-2"><Button aria-label="Previous page" className="rounded-full" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} size="sm" variant="outline"><ChevronLeft className="size-4" /> Previous</Button><Button aria-label="Next page" className="rounded-full" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)} size="sm" variant="outline">Next <ChevronRight className="size-4" /></Button></div>
            </div>
          </>
        )}
      </section>
      <Dialog open={importOpen} onOpenChange={(open) => { if (!importingWorkbook) setImportOpen(open); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Import phone-order customers</DialogTitle>
            <DialogDescription>Choose an .xlsx workbook. Only new customers are added; imported rows never replace existing directory records or Firebase accounts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-[#FBF9F6] p-4 text-sm leading-6 text-[#51443F]">
              <p className="font-bold">First worksheet columns</p>
              <p className="mt-1">Required: <strong>Name</strong> and <strong>Mobile</strong> (or Phone). Optional: Address, Locality, Pincode, Notes.</p>
              <p className="mt-2 text-xs text-muted-foreground">Duplicate checks use the normalized 10-digit mobile number across this sheet, previous imports, registered accounts, and Firebase profiles. The workbook is read in this browser and is not stored.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-black/20 bg-white p-4 hover:border-[#B4232C]/50">
              <FileSpreadsheet className="size-5 shrink-0 text-[#B4232C]" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{workbookName || "Select an Excel workbook"}</span><span className="mt-1 block text-xs text-muted-foreground">.xlsx · first worksheet · up to 20 MB</span></span>
              <input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readingWorkbook || importingWorkbook} onChange={(event) => { void readWorkbook(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            </label>
            {readingWorkbook && <p className="text-sm text-muted-foreground" role="status">Reading worksheet locally…</p>}
            {workbookRows.length > 0 && <div className="rounded-xl border border-black/5 p-4">
              <div className="flex items-baseline justify-between gap-3"><p className="text-sm font-black">{workbookRows.length.toLocaleString("en-IN")} rows found</p><p className="text-xs text-muted-foreground">{workbookRows.filter((row) => row.name.trim() && row.phone.replace(/\D/g, "").length >= 10).length} look ready</p></div>
              <div className="mt-3 max-h-40 overflow-auto rounded-lg bg-[#FBF9F6]">
                <table className="w-full text-left text-xs"><thead><tr className="text-muted-foreground"><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Mobile</th></tr></thead><tbody>{workbookRows.slice(0, 8).map((row) => <tr key={row.rowNumber} className="border-t border-black/5"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2 font-semibold">{row.name || "—"}</td><td className="px-3 py-2">{row.phone || "—"}</td></tr>)}</tbody></table>
              </div>
              {workbookRows.length > 8 && <p className="mt-2 text-[0.7rem] text-muted-foreground">Showing first 8 rows. All {workbookRows.length} rows will be processed.</p>}
            </div>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" disabled={importingWorkbook} onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button className="rounded-full bg-[#B4232C] text-white hover:bg-[#941D25]" disabled={!workbookRows.length || readingWorkbook || importingWorkbook} onClick={() => void submitWorkbook()}>{importingWorkbook ? "Importing…" : `Add ${workbookRows.length || "new"} customers`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCustomer)} onOpenChange={(open) => { if (!savingCustomer && !open) setEditingCustomer(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader><DialogTitle>Edit imported customer</DialogTitle><DialogDescription>This updates only the phone-order customer record. Firebase login profiles are kept separately.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["name", "Customer name", true], ["phone", "Mobile number", true], ["address", "Address", false],
              ["locality", "Locality", false], ["pincode", "Pincode", false], ["notes", "Notes", false],
            ] as const).map(([key, label, required]) => <label key={key} className={`text-xs font-bold ${key === "address" || key === "notes" ? "sm:col-span-2" : ""}`}>{label}{required ? " *" : ""}<Input className="mt-1 rounded-lg" value={customerDraft[key]} onChange={(event) => setCustomerDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
          </div>
          <DialogFooter><Button variant="outline" className="rounded-full" disabled={savingCustomer} onClick={() => setEditingCustomer(null)}>Cancel</Button><Button className="rounded-full bg-[#17110F] text-white" disabled={savingCustomer} onClick={() => void saveImportedCustomer()}>{savingCustomer ? "Saving…" : "Save customer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
