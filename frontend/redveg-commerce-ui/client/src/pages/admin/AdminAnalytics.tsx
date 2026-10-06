import React, { useState, useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { RefreshCw, Loader2, AlertTriangle, Plus, Trash2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

const AdminAnalytics = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"lifetime" | "12m" | "6m" | "30d">(
    "lifetime"
  );
  const [bucket, setBucket] = useState<"day" | "week" | "month">("month");
  const [transactionForm, setTransactionForm] = useState({
    transactionType: "purchase",
    transactionDate: new Date().toISOString().slice(0, 10),
    category: "",
    description: "",
    amount: "",
  });
  const [savingTransaction, setSavingTransaction] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (range) params.append("range", range);
      if (bucket) params.append("bucket", bucket);
      const response = await apiFetch(`stats/revenue?${params.toString()}`, {
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();

      if (!contentType.toLowerCase().includes("application/json")) {
        const preview = text.replace(/\s+/g, " ").slice(0, 160);
        throw new Error(
          `Analytics API returned ${response.status} ${response.statusText} instead of JSON: ${preview}`
        );
      }

      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          `Analytics API returned invalid JSON with status ${response.status}`
        );
      }

      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "message" in result
            ? String((result as { message?: unknown }).message)
            : `Analytics request failed with status ${response.status}`;
        throw new Error(message);
      }

      setData(result.data);
    } catch (err: any) {
      console.error("Error fetching analytics data:", err);
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [range, bucket]);

  const handleRefresh = () => {
    fetchData();
  };

  const saveTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingTransaction(true);
    try {
      const response = await apiFetch("stats/financial-transactions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(transactionForm),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || "Could not save financial transaction"
        );
      setTransactionForm({
        ...transactionForm,
        category: "",
        description: "",
        amount: "",
      });
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Could not save financial transaction");
    } finally {
      setSavingTransaction(false);
    }
  };

  const removeTransaction = async (id: string) => {
    if (!window.confirm("Delete this financial ledger entry?")) return;
    const response = await apiFetch(
      `stats/financial-transactions/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      }
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.message || "Could not delete financial transaction");
      return;
    }
    await fetchData();
  };

  if (loading) {
    return (
      <AdminShell title="Loading..." subtitle="Loading analytics data...">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
        </div>
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell title="Error" subtitle="Failed to load analytics data">
        <div className="p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-[#B4232C] mb-4" />
          <p className="text-red-500">{error}</p>
          <Button
            onClick={handleRefresh}
            className="mt-4 h-10 rounded-full bg-[#B4232C] px-4 font-black text-white"
          >
            Retry
          </Button>
        </div>
      </AdminShell>
    );
  }

  if (!data) {
    return (
      <AdminShell title="No data" subtitle="No analytics data available">
        <div className="p-6 text-center">
          <p className="text-muted-foreground">
            No confirmed orders found for the selected range.
          </p>
        </div>
      </AdminShell>
    );
  }

  const { summary, series, importedSales, financialTransactions = [] } = data;

  const formatINR = (num: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <AdminShell
      title="Reports"
      subtitle="Understand sales, products and campaign sources."
    >
      <div className="grid gap-6 mb-4">
        {/* Lifetime earnings card */}
        <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-bold text-muted-foreground">
              Lifetime online-store earnings
            </p>
          </div>
          <p className="mt-3 text-4xl font-black tracking-[-0.035em]">
            {formatINR(summary.lifetimeRevenue)}
          </p>
          <p className="mt-2 text-xs font-bold text-[#267345]">All time</p>
        </div>

        {/* Selected period revenue card */}
        <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-bold text-muted-foreground">
              {range === "lifetime"
                ? "Lifetime"
                : range === "12m"
                  ? "Last 12 months"
                  : range === "6m"
                    ? "Last 6 months"
                    : "Last 30 days"}{" "}
              online-store revenue
            </p>
          </div>
          <p className="mt-3 text-3xl font-black tracking-[-0.035emil">
            {formatINR(summary.periodRevenue)}
          </p>
          <p className="mt-2 text-xs font-bold text-[#267345]">
            {summary.periodChangePercent >= 0
              ? `+${summary.periodChangePercent.toFixed(1)}%`
              : `${summary.periodChangePercent.toFixed(1)}%`}{" "}
            vs previous period
          </p>
        </div>

        {/* Order count card */}
        <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-bold text-muted-foreground">
              Online-store orders
            </p>
          </div>
          <p className="mt-3 text-4xl font-black tracking-[-0.035emil">
            {summary.orderCount.toLocaleString("en-IN")}
          </p>
          <p className="mt-2 text-xs font-bold text-[#267345]">
            In selected period
          </p>
        </div>

        {/* Average order value card */}
        <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-bold text-muted-foreground">
              Avg. online-store order value
            </p>
          </div>
          <p className="mt-3 text-3xl font-black tracking-[-0.035emil">
            {formatINR(summary.averageOrderValue)}
          </p>
          <p className="mt-2 text-xs font-bold text-[#267345]">Per order</p>
        </div>
      </div>

      <section className="mb-6 rounded-[1.35rem] bg-[#17110F] p-5 text-white shadow-[0_12px_34px_rgba(61,33,27,.12)]">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-black">
              Purchase &amp; expense performance
            </h2>
            <p className="text-xs text-white/55">
              All figures are calculated from recorded orders and the financial
              ledger. No estimates are added.
            </p>
          </div>
          <span className="text-xs font-bold text-white/50">
            {summary.financialTransactionCount || 0} ledger entries
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white/[0.07] p-4">
            <p className="text-xs font-bold text-white/55">Purchases / COGS</p>
            <p className="mt-2 text-2xl font-black">
              {formatINR(summary.purchaseTotal || 0)}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.07] p-4">
            <p className="text-xs font-bold text-white/55">
              Operating expenses
            </p>
            <p className="mt-2 text-2xl font-black">
              {formatINR(summary.expenseTotal || 0)}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.07] p-4">
            <p className="text-xs font-bold text-white/55">Gross margin</p>
            <p className="mt-2 text-2xl font-black">
              {summary.grossMarginPercent === null
                ? "Not available"
                : `${summary.grossMarginPercent.toFixed(1)}%`}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {formatINR(summary.grossProfit || 0)} gross profit
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.07] p-4">
            <p className="text-xs font-bold text-white/55">Net margin</p>
            <p className="mt-2 text-2xl font-black">
              {summary.netMarginPercent === null
                ? "Not available"
                : `${summary.netMarginPercent.toFixed(1)}%`}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {formatINR(summary.netProfit || 0)} net profit
            </p>
          </div>
        </div>
        {!summary.financialTransactionCount && (
          <p className="mt-4 rounded-xl border border-[#C47A24]/30 bg-[#C47A24]/10 px-4 py-3 text-xs font-semibold text-[#F4D3A1]">
            Add actual supplier purchases and business expenses below to unlock
            true gross and net margins. Until then, the dashboard correctly
            reports no margin percentage.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-black">Imported sales report</h2>
            <p className="text-xs text-muted-foreground">
              {importedSales?.reportFrom && importedSales?.reportTo
                ? `Source dates: ${importedSales.reportFrom} to ${importedSales.reportTo}`
                : "No historical sales report has been imported."}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Separate from online checkout orders
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl bg-[#FBF9F6] p-4">
            <p className="text-xs font-bold text-muted-foreground">
              Active invoices
            </p>
            <p className="mt-2 text-xl font-black">
              {Number(importedSales?.invoiceCount || 0).toLocaleString("en-IN")}
            </p>
          </div>
          <div className="rounded-xl bg-[#FBF9F6] p-4">
            <p className="text-xs font-bold text-muted-foreground">Invoiced</p>
            <p className="mt-2 text-xl font-black">
              {formatINR(Number(importedSales?.invoicedAmount || 0))}
            </p>
          </div>
          <div className="rounded-xl bg-[#FBF9F6] p-4">
            <p className="text-xs font-bold text-muted-foreground">Received</p>
            <p className="mt-2 text-xl font-black">
              {formatINR(Number(importedSales?.receivedAmount || 0))}
            </p>
          </div>
          <div className="rounded-xl bg-[#FBF9F6] p-4">
            <p className="text-xs font-bold text-muted-foreground">
              Outstanding
            </p>
            <p className="mt-2 text-xl font-black">
              {formatINR(Number(importedSales?.outstandingAmount || 0))}
            </p>
          </div>
          <div className="rounded-xl bg-[#FBF9F6] p-4">
            <p className="text-xs font-bold text-muted-foreground">
              Cancelled invoices
            </p>
            <p className="mt-2 text-xl font-black">
              {Number(importedSales?.cancelledInvoiceCount || 0).toLocaleString(
                "en-IN"
              )}
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Cancelled invoices are excluded from invoiced, received and
          outstanding amounts. Historical party names are report-only and are
          not customer login accounts.
        </p>
      </section>

      <div className="grid gap-6">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Range:
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setRange("lifetime")}
                className={`px-3 py-1 rounded text-sm font-medium ${range === "lifetime" ? "bg-[#B4232C] text-white" : "bg-[#F7F4F1] text-[#6B7280]"}`}
              >
                Lifetime
              </button>
              <button
                onClick={() => setRange("12m")}
                className={`px-3 py-1 rounded text-sm font-medium ${range === "12m" ? "bg-[#B4232C] text-white" : "bg-[#F7F4F1] text-[#6B7280]"}`}
              >
                Last 12M
              </button>
              <button
                onClick={() => setRange("6m")}
                className={`px-3 py-1 rounded text-sm font-medium ${range === "6m" ? "bg-[#B4232C] text-white" : "bg-[#F7F4F1] text-[#6B7280]"}`}
              >
                Last 6M
              </button>
              <button
                onClick={() => setRange("30d")}
                className={`px-3 py-1 rounded text-sm font-medium ${range === "30d" ? "bg-[#B4232C] text-white" : "bg-[#F7F4F1] text-[#6B7280]"}`}
              >
                Last 30D
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Bucket:
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setBucket("day")}
                className={`px-3 py-1 rounded text-sm font-medium ${bucket === "day" ? "bg-[#B4232C] text-white" : "bg-[#F7F4F1] text-[#6B7280]"}`}
              >
                Day
              </button>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            className="mt-0 sm:mt-0 sm:self-end h-10 rounded-full bg-[#B4232C] px-4 font-black text-white"
          >
            <RefreshCw className="size-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Charts */}
        <div className="col-span-2">
          <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
            <h3 className="mb-4 text-lg font-black">Revenue over time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={label => label} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Online store revenue"
                  stroke="#B4232C"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="importedInvoiced"
                  name="Imported invoices"
                  stroke="#C47A24"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="importedCollected"
                  name="Collected from report"
                  stroke="#267345"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-2 rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-lg font-black">
              Purchases, expenses &amp; margins
            </h3>
            <span className="text-xs font-bold text-muted-foreground">
              Revenue − purchases − expenses
            </span>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Purchases are treated as COGS for gross-margin reporting.
          </p>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatINR(value)} />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#B4232C"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="purchase"
                name="Purchases / COGS"
                stroke="#C47A24"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                name="Expenses"
                stroke="#7C5CFC"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="grossProfit"
                name="Gross profit"
                stroke="#267345"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="netProfit"
                name="Net profit"
                stroke="#0F766E"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-2">
          <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
            <h3 className="mb-4 text-lg font-bold">Order count over time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={label => label} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="orders" fill="#B4232C" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-black">
              Purchase &amp; expense ledger
            </h2>
            <p className="text-xs text-muted-foreground">
              Record supplier purchases and operating expenses here. These
              entries immediately drive the graph and margin calculations.
            </p>
          </div>
          <span className="text-xs font-bold text-muted-foreground">
            Admin only
          </span>
        </div>
        <form onSubmit={saveTransaction} className="grid gap-3 md:grid-cols-6">
          <select
            value={transactionForm.transactionType}
            onChange={event =>
              setTransactionForm({
                ...transactionForm,
                transactionType: event.target.value,
              })
            }
            className="h-10 rounded-xl border border-black/10 bg-[#FBF9F6] px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#B4232C]/20"
          >
            <option value="purchase">Purchase / COGS</option>
            <option value="expense">Operating expense</option>
          </select>
          <input
            type="date"
            required
            value={transactionForm.transactionDate}
            onChange={event =>
              setTransactionForm({
                ...transactionForm,
                transactionDate: event.target.value,
              })
            }
            className="h-10 rounded-xl border border-black/10 bg-[#FBF9F6] px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#B4232C]/20"
          />
          <input
            required
            placeholder="Category"
            value={transactionForm.category}
            onChange={event =>
              setTransactionForm({
                ...transactionForm,
                category: event.target.value,
              })
            }
            className="h-10 rounded-xl border border-black/10 bg-[#FBF9F6] px-3 text-sm outline-none focus:ring-2 focus:ring-[#B4232C]/20"
          />
          <input
            required
            placeholder="Description"
            value={transactionForm.description}
            onChange={event =>
              setTransactionForm({
                ...transactionForm,
                description: event.target.value,
              })
            }
            className="h-10 rounded-xl border border-black/10 bg-[#FBF9F6] px-3 text-sm outline-none focus:ring-2 focus:ring-[#B4232C]/20 md:col-span-2"
          />
          <div className="flex gap-2">
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              placeholder="Amount (₹)"
              value={transactionForm.amount}
              onChange={event =>
                setTransactionForm({
                  ...transactionForm,
                  amount: event.target.value,
                })
              }
              className="h-10 min-w-0 flex-1 rounded-xl border border-black/10 bg-[#FBF9F6] px-3 text-sm outline-none focus:ring-2 focus:ring-[#B4232C]/20"
            />
            <Button
              type="submit"
              disabled={savingTransaction}
              className="h-10 rounded-xl bg-[#B4232C] px-3 font-black text-white"
            >
              <Plus className="mr-1 size-4" />
              Add
            </Button>
          </div>
        </form>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <th className="pb-3">Date</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Category</th>
                <th className="pb-3">Description</th>
                <th className="pb-3 text-right">Amount</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {financialTransactions.map((transaction: any) => (
                <tr key={transaction.id} className="border-b border-black/5">
                  <td className="py-3">{transaction.transaction_date}</td>
                  <td className="py-3 font-bold capitalize">
                    {transaction.transaction_type}
                  </td>
                  <td className="py-3">{transaction.category}</td>
                  <td className="py-3">{transaction.description}</td>
                  <td className="py-3 text-right font-black">
                    {formatINR(Number(transaction.amount) || 0)}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeTransaction(transaction.id)}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-[#B4232C]"
                      aria-label={`Delete ${transaction.description}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {financialTransactions.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No purchase or expense entries have been recorded yet.
            </p>
          )}
        </div>
      </section>

      <div className="mt-6 flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Last updated:{" "}
          {new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          Online-store earnings include approved, delivered and completed
          orders; pending and cancelled orders are excluded. Imported invoices
          are shown separately with collected and outstanding balances;
          cancelled report invoices are excluded.
        </p>
      </div>
    </AdminShell>
  );
};

export default AdminAnalytics;
