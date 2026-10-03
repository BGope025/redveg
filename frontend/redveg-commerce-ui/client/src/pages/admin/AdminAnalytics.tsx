import React, { useState, useEffect } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
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
} from 'recharts';

const AdminAnalytics = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'lifetime' | '12m' | '6m' | '30d'>('lifetime');
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('month');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (range) params.append('range', range);
      if (bucket) params.append('bucket', bucket);
      const response = await apiFetch(`stats/revenue?${params.toString()}`, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      });

      const contentType = response.headers.get('content-type') ?? '';
      const text = await response.text();

      if (!contentType.toLowerCase().includes('application/json')) {
        const preview = text.replace(/\s+/g, ' ').slice(0, 160);
        throw new Error(
          `Analytics API returned ${response.status} ${response.statusText} instead of JSON: ${preview}`
        );
      }

      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`Analytics API returned invalid JSON with status ${response.status}`);
      }

      if (!response.ok) {
        const message =
          typeof result === 'object' && result !== null && 'message' in result
            ? String((result as { message?: unknown }).message)
            : `Analytics request failed with status ${response.status}`;
        throw new Error(message);
      }

      setData(result.data);
    } catch (err: any) {
      console.error('Error fetching analytics data:', err);
      setError(err.message || 'Failed to load analytics');
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
          <Button onClick={handleRefresh} className="mt-4 h-10 rounded-full bg-[#B4232C] px-4 font-black text-white">
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
          <p className="text-muted-foreground">No confirmed orders found for the selected range.</p>
        </div>
      </AdminShell>
    );
  }

  const { summary, series, importedSales } = data;

  const formatINR = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <AdminShell title="Reports" subtitle="Understand sales, products and campaign sources.">
      <div className="grid gap-6 mb-4">
        {/* Lifetime earnings card */}
        <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-bold text-muted-foreground">Lifetime online-store earnings</p>
          </div>
          <p className="mt-3 text-4xl font-black tracking-[-0.035em]">{formatINR(summary.lifetimeRevenue)}</p>
          <p className="mt-2 text-xs font-bold text-[#267345]">All time</p>
        </div>

        {/* Selected period revenue card */}
        <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-bold text-muted-foreground">{range === 'lifetime' ? 'Lifetime' : range === '12m' ? 'Last 12 months' : range === '6m' ? 'Last 6 months' : 'Last 30 days'} online-store revenue</p>
          </div>
          <p className="mt-3 text-3xl font-black tracking-[-0.035emil">{formatINR(summary.periodRevenue)}</p>
          <p className="mt-2 text-xs font-bold text-[#267345]">{summary.periodChangePercent >= 0 ? `+${summary.periodChangePercent.toFixed(1)}%` : `${summary.periodChangePercent.toFixed(1)}%`} vs previous period</p>
        </div>

        {/* Order count card */}
        <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-bold text-muted-foreground">Online-store orders</p>
          </div>
          <p className="mt-3 text-4xl font-black tracking-[-0.035emil">{summary.orderCount.toLocaleString('en-IN')}</p>
          <p className="mt-2 text-xs font-bold text-[#267345]">In selected period</p>
        </div>

        {/* Average order value card */}
        <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
          <div className="flex items-start justify-between">
            <p className="text-sm font-bold text-muted-foreground">Avg. online-store order value</p>
          </div>
          <p className="mt-3 text-3xl font-black tracking-[-0.035emil">{formatINR(summary.averageOrderValue)}</p>
          <p className="mt-2 text-xs font-bold text-[#267345]">Per order</p>
        </div>
      </div>

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
          <p className="text-xs text-muted-foreground">Separate from online checkout orders</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl bg-[#FBF9F6] p-4"><p className="text-xs font-bold text-muted-foreground">Active invoices</p><p className="mt-2 text-xl font-black">{Number(importedSales?.invoiceCount || 0).toLocaleString("en-IN")}</p></div>
          <div className="rounded-xl bg-[#FBF9F6] p-4"><p className="text-xs font-bold text-muted-foreground">Invoiced</p><p className="mt-2 text-xl font-black">{formatINR(Number(importedSales?.invoicedAmount || 0))}</p></div>
          <div className="rounded-xl bg-[#FBF9F6] p-4"><p className="text-xs font-bold text-muted-foreground">Received</p><p className="mt-2 text-xl font-black">{formatINR(Number(importedSales?.receivedAmount || 0))}</p></div>
          <div className="rounded-xl bg-[#FBF9F6] p-4"><p className="text-xs font-bold text-muted-foreground">Outstanding</p><p className="mt-2 text-xl font-black">{formatINR(Number(importedSales?.outstandingAmount || 0))}</p></div>
          <div className="rounded-xl bg-[#FBF9F6] p-4"><p className="text-xs font-bold text-muted-foreground">Cancelled invoices</p><p className="mt-2 text-xl font-black">{Number(importedSales?.cancelledInvoiceCount || 0).toLocaleString("en-IN")}</p></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Cancelled invoices are excluded from invoiced, received and outstanding amounts. Historical party names are report-only and are not customer login accounts.</p>
      </section>

      <div className="grid gap-6">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Range:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setRange('lifetime')}
                className={`px-3 py-1 rounded text-sm font-medium ${range === 'lifetime' ? 'bg-[#B4232C] text-white' : 'bg-[#F7F4F1] text-[#6B7280]'}`}
              >
                Lifetime
              </button>
              <button
                onClick={() => setRange('12m')}
                className={`px-3 py-1 rounded text-sm font-medium ${range === '12m' ? 'bg-[#B4232C] text-white' : 'bg-[#F7F4F1] text-[#6B7280]'}`}
              >
                Last 12M
              </button>
              <button
                onClick={() => setRange('6m')}
                className={`px-3 py-1 rounded text-sm font-medium ${range === '6m' ? 'bg-[#B4232C] text-white' : 'bg-[#F7F4F1] text-[#6B7280]'}`}
              >
                Last 6M
              </button>
              <button
                onClick={() => setRange('30d')}
                className={`px-3 py-1 rounded text-sm font-medium ${range === '30d' ? 'bg-[#B4232C] text-white' : 'bg-[#F7F4F1] text-[#6B7280]'}`}
              >
                Last 30D
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Bucket:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setBucket('day')}
                className={`px-3 py-1 rounded text-sm font-medium ${bucket === 'day' ? 'bg-[#B4232C] text-white' : 'bg-[#F7F4F1] text-[#6B7280]'}`}
              >
                Day
              </button>
            </div>
          </div>
          <Button onClick={handleRefresh} className="mt-0 sm:mt-0 sm:self-end h-10 rounded-full bg-[#B4232C] px-4 font-black text-white">
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
                <XAxis dataKey="period" tickFormatter={(label) => label} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Online store revenue" stroke="#B4232C" strokeWidth={2} />
                <Line type="monotone" dataKey="importedInvoiced" name="Imported invoices" stroke="#C47A24" strokeWidth={2} />
                <Line type="monotone" dataKey="importedCollected" name="Collected from report" stroke="#267345" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-2">
          <div className="rounded-[1.35rem] bg-white p-5 shadow-[0_12px_34px_rgba(61,33,27,.055)] ring-1 ring-black/[0.04]">
            <h3 className="mb-4 text-lg font-bold">Order count over time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={(label) => label} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="orders" fill="#B4232C" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Last updated: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-xs text-muted-foreground">
          Online-store earnings include approved, delivered and completed orders; pending and cancelled orders are excluded. Imported invoices are shown separately with collected and outstanding balances; cancelled report invoices are excluded.
        </p>
      </div>
    </AdminShell>
  );
};

export default AdminAnalytics;
