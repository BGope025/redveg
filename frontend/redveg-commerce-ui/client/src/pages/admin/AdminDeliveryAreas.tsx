import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { MapPinned, Loader2, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { apiFetch } from '@/lib/api';
import { formatISTDateTime } from '@/lib/dateTime';

interface DeliveryLocation {
  pincode: string;
  area: string;
  city: string;
  state: string;
  isServiceable: boolean;
  latitude?: number | null;
  longitude?: number | null;
  updatedAt?: string;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  count: number;
  total: number;
  serviceableCount: number;
  data: DeliveryLocation[];
}

export default function AdminDeliveryAreas() {
  const [location] = useLocation();
  const module = location === '/admin/delivery'
    ? { title: 'Delivery areas', subtitle: 'Manage serviceability, fees and minimum orders by pincode.' }
    : { title: 'Settings', subtitle: 'Select and customize header themes for festivals and occasions.' };

  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'available' | 'unavailable'>('all');

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('admin/delivery-locations');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ApiResponse = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch delivery locations');
      }
      setLocations(data.data);
    } catch (err: any) {
      console.error('Error fetching delivery locations:', err);
      setError('Failed to load delivery locations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAvailability = async (location: DeliveryLocation) => {
    const pincode = location.pincode;
    setUpdating(prev => new Set(prev).add(pincode));
    try {
      const response = await apiFetch(`admin/delivery-locations/${pincode}/availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isServiceable: !location.isServiceable }),
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to update availability');
      }
      // Update the location in the list
      setLocations(prev =>
        prev.map(loc =>
          loc.pincode === pincode
            ? { ...loc, isServiceable: data.data.isServiceable, updatedAt: data.data.updatedAt }
            : loc
        )
      );
    } catch (err: any) {
      console.error('Error toggling availability:', err);
      // Optionally show a toast or error message
      alert('Failed to update availability. Please try again.');
    } finally {
      setUpdating(prev => {
        const newSet = new Set(prev);
        newSet.delete(pincode);
        return newSet;
      });
    }
  };

  const filteredLocations = locations
    .filter(loc =>
      searchTerm
        ? loc.pincode.toLowerCase().includes(searchTerm.toLowerCase()) ||
          loc.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
          loc.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
          loc.state.toLowerCase().includes(searchTerm.toLowerCase())
        : true
    )
    .filter(loc => {
      if (filter === 'available') return loc.isServiceable;
      if (filter === 'unavailable') return !loc.isServiceable;
      return true; // all
    });

  return (
    <AdminShell title={module.title} subtitle={module.subtitle}>
      <div className="rounded-[1.7rem] bg-white p-7 shadow-[0_16px_44px_rgba(61,33,27,.06)] ring-1 ring-black/[0.04] sm:p-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <MapPinned className="size-5 text-[#B4232C]" />
            <h2 className="font-display text-4xl font-black tracking-[-0.04em]">
              Delivery Areas Management
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchLocations}
              className="btn-outline btn-sm hover:btn-primary"
              disabled={loading}
            >
              <Loader2 className="size-4 mr-2" /> Refresh
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <div>
            <label className="block text-[0.68rem] font-bold text-foreground mb-1">
              Search pincode, area, city, state...
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-[0.68rem] font-bold text-foreground mb-1">
              Filter by status
            </label>
            <div className="flex gap-2">
              <button
                className={`btn-sm px-3 py-2 rounded-lg ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilter('all')}
                disabled={loading}
              >
                All
              </button>
              <button
                className={`btn-sm px-3 py-2 rounded-lg ${filter === 'available' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilter('available')}
                disabled={loading}
              >
                Available
              </button>
              <button
                className={`btn-sm px-3 py-2 rounded-lg ${filter === 'unavailable' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFilter('unavailable')}
                disabled={loading}
              >
                Unavailable
              </button>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[0.68rem] font-bold text-foreground">
              Total: {locations.length} | Available: {locations.filter(l => l.isServiceable).length} | Unavailable: {locations.filter(l => !l.isServiceable).length}
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Loading Placeholder */}
        {loading && locations.length === 0 && (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="size-8 text-[#B4232C] mr-4" />
            <p className="text-[0.9rem] text-foreground">Loading delivery areas...</p>
          </div>
        )}

        {/* Locations Table */}
        {!loading && locations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-[#FFFDF9]">
                <tr>
                  <th className="px-4 py-3 text-left text-[0.68rem] font-bold text-foreground">
                    Pincode
                  </th>
                  <th className="px-4 py-3 text-left text-[0.68rem] font-bold text-foreground">
                    Area
                  </th>
                  <th className="px-4 py-3 text-left text-[0.68rem] font-bold text-foreground">
                    City
                  </th>
                  <th className="px-4 py-3 text-left text-[0.68rem] font-bold text-foreground">
                    State
                  </th>
                  <th className="px-4 py-3 text-left text-[0.68rem] font-bold text-foreground">
                    Last Updated
                  </th>
                  <th className="px-4 py-3 text-left text-[0.68rem] font-bold text-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLocations.map((loc, index) => (
                  <tr key={`${loc.pincode}-${index}`} className="hover:bg-[#FFFDF9]">
                    <td className="px-4 py-3 text-[0.68rem] text-foreground">
                      {loc.pincode}
                    </td>
                    <td className="px-4 py-3 text-[0.68rem] text-foreground">
                      {loc.area}
                    </td>
                    <td className="px-4 py-3 text-[0.68rem] text-foreground">
                      {loc.city}
                    </td>
                    <td className="px-4 py-3 text-[0.68rem] text-foreground">
                      {loc.state}
                    </td>
                    <td className="px-4 py-3 text-[0.68rem] text-[0.68rem] text-left text-[0.68rem] font-bold text-foreground">
                      {loc.updatedAt ? formatISTDateTime(loc.updatedAt) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        className="w-full px-3 py-2"
                        disabled={loading || updating.has(loc.pincode)}
                        onClick={() => handleToggleAvailability(loc)}
                      >
                        {updating.has(loc.pincode) ? (
                          <>
                            <Loader2 className="size-4 mr-2" />
                            Updating...
                          </>
                        ) : (
                          loc.isServiceable ? 'Set Unavailable' : 'Set Available'
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!loading && locations.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[0.9rem] text-foreground">
              No delivery areas found.
            </p>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
