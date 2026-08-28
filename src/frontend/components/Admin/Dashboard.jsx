import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await api.get('/reports/dashboard');
      setData(res);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading dashboard...</div>;
  if (!data) return <div className="text-center py-12 text-red-500">Failed to load dashboard</div>;

  const { today, alerts, recent_sales, top_medicines } = data;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Revenue" value={`Rs. ${parseFloat(today.revenue || 0).toFixed(2)}`} color="blue" />
        <StatCard title="Today's Profit" value={`Rs. ${parseFloat(today.profit || 0).toFixed(2)}`} color="green" />
        <StatCard title="Bills Generated" value={today.bill_count || 0} color="purple" />
        <StatCard title="Items Sold" value={today.items_sold || 0} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Alerts</h3>
          <div className="space-y-3">
            {alerts.low_stock > 0 && (
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <span className="text-yellow-800">Low Stock Medicines</span>
                <span className="font-bold text-yellow-900">{alerts.low_stock}</span>
              </div>
            )}
            {alerts.expiring_soon > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <span className="text-red-800">Expiring Soon</span>
                <span className="font-bold text-red-900">{alerts.expiring_soon}</span>
              </div>
            )}
            {alerts.low_stock === 0 && alerts.expiring_soon === 0 && (
              <p className="text-gray-500 text-sm">No alerts at this time.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Top Medicines (30 days)</h3>
          {top_medicines?.length > 0 ? (
            <div className="space-y-2">
              {top_medicines.map((med, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span className="text-gray-700">{med.name}</span>
                  <span className="text-sm font-medium text-gray-500">{med.total_qty} units</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No sales data yet.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Sales</h3>
        {recent_sales?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Bill #</th>
                  <th className="text-left p-3 font-medium text-gray-600">Cashier</th>
                  <th className="text-right p-3 font-medium text-gray-600">Amount</th>
                  <th className="text-right p-3 font-medium text-gray-600">Time</th>
                </tr>
              </thead>
              <tbody>
                {recent_sales.map((sale, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-mono">{sale.bill_number}</td>
                    <td className="p-3">{sale.cashier_name}</td>
                    <td className="p-3 text-right font-medium">Rs. {parseFloat(sale.final_amount).toFixed(2)}</td>
                    <td className="p-3 text-right text-gray-500">{new Date(sale.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No recent sales.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, color }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-80">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
