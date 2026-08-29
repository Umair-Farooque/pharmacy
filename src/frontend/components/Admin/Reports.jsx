import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ExcelJS from 'exceljs';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function Reports() {
  const [activeTab, setActiveTab] = useState('sales');
  const [filters, setFilters] = useState({
    start_date: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
  }, []);
  const [error, setError] = useState(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = `?start_date=${filters.start_date}&end_date=${filters.end_date}`;
      let res;
      switch (activeTab) {
        case 'sales': res = await api.get(`/reports/sales${params}`); break;
        case 'day': res = await api.get(`/reports/day-summary/${filters.end_date}`); break;
        case 'stock': res = await api.get('/reports/stock-valuation'); break;
        case 'margins': res = await api.get('/reports/profit-margins'); break;
        case 'bills': res = await api.get(`/sales?start_date=${filters.start_date}&end_date=${filters.end_date}&limit=100`); break;
        case 'expiry': res = await api.get('/reports/expiry-alerts?days=90'); break;
        case 'lowstock': res = await api.get('/reports/low-stock'); break;
        default: res = {};
      }
      setData(res);
    } catch (err) {
      console.error('Report error:', err);
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReport(); }, [activeTab, filters.start_date, filters.end_date]);

  const setQuickRange = (range) => {
    const today = new Date();
    let start = new Date();
    switch (range) {
      case 'today': start = today; break;
      case 'week': start.setDate(today.getDate() - 7); break;
      case 'month': start.setMonth(today.getMonth() - 1); break;
      case '6months': start.setMonth(today.getMonth() - 6); break;
      case 'year': start.setFullYear(today.getFullYear() - 1); break;
    }
    setFilters({
      start_date: start.toISOString().slice(0, 10),
      end_date: today.toISOString().slice(0, 10),
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return '';
    const [d, m, y] = dateStr.split('/');
    return `${y}-${m}-${d}`;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Reports & Analytics</h2>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap gap-2 mb-4">
{[
  { key: 'sales', label: 'Sales Report' },
  { key: 'day', label: 'Day Summary' },
  { key: 'bills', label: 'Bills' },
  { key: 'stock', label: 'Stock Valuation' },
  { key: 'margins', label: 'Profit Margins' },
  { key: 'expiry', label: 'Expiry Alerts' },
  { key: 'lowstock', label: 'Low Stock' },
].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(activeTab === 'sales' || activeTab === 'day' || activeTab === 'bills') && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={formatDate(filters.start_date)}
              onChange={e => {
                const parsed = parseDate(e.target.value);
                if (parsed) setFilters(f => ({ ...f, start_date: parsed }));
              }}
              className="px-3 py-2 border rounded-lg text-sm w-32"
            />
            <span className="text-gray-500">to</span>
            <input
              type="text"
              placeholder="DD/MM/YYYY"
              value={formatDate(filters.end_date)}
              onChange={e => {
                const parsed = parseDate(e.target.value);
                if (parsed) setFilters(f => ({ ...f, end_date: parsed }));
              }}
              className="px-3 py-2 border rounded-lg text-sm w-32"
            />
            <div className="flex gap-1 ml-4">
              {['today', 'week', 'month', '6months', 'year'].map(r => (
                <button key={r} onClick={() => setQuickRange(r)} className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded capitalize">{r === '6months' ? '6 Months' : r}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading report...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">
          <p className="font-medium">Error loading report</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : (
        <ErrorBoundary>
          <ReportContent tab={activeTab} data={data} settings={settings} />
        </ErrorBoundary>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error.message };
  }
  componentDidCatch(error, info) {
    console.error('Reports render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-12 text-red-500">
          <p className="font-medium">Something went wrong</p>
          <p className="text-sm mt-1">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function ReportContent({ tab, data, settings }) {
  if (!data) return null;

  if (tab === 'sales') {
    const { summary, daily_trend, top_medicines, payment_breakdown, cashier_breakdown } = data;
    const trendData = (daily_trend || []).map(d => ({
      date: d.date?.slice(5) || '',
      revenue: parseFloat(d.revenue || 0),
      profit: parseFloat(d.profit || 0),
      bills: d.bills || 0,
    }));
    const topData = (top_medicines || []).slice(0, 8).map(m => ({
      name: m.name?.length > 20 ? m.name.slice(0, 20) + '...' : m.name,
      fullName: m.name,
      qty: m.total_qty || 0,
      profit: parseFloat(m.profit || 0),
    }));
    const paymentData = (payment_breakdown || []).map(p => ({
      name: p.payment_method,
      value: parseFloat(p.amount || 0),
      count: p.count || 0,
    }));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <MiniStat label="Revenue" value={`Rs. ${parseFloat(summary.total_revenue || 0).toFixed(0)}`} />
          <MiniStat label="Profit" value={`Rs. ${parseFloat(summary.total_profit || 0).toFixed(0)}`} color="green" />
          <MiniStat label="Bills" value={summary.total_bills || 0} />
          <MiniStat label="Avg Bill" value={`Rs. ${parseFloat(summary.avg_bill_value || 0).toFixed(0)}`} />
          <MiniStat label="Discounts" value={`Rs. ${parseFloat(summary.total_discount || 0).toFixed(0)}`} color="red" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={() => exportToCSV(summary, cashier_breakdown || [], `sales-report-${filters.start_date}-to-${filters.end_date}`)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Export CSV</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {trendData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="font-semibold text-gray-800 mb-3">Revenue & Profit Trend</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={v => `Rs${v}`} />
                  <Tooltip formatter={(val) => `Rs. ${val.toFixed(0)}`} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="#3B82F6" radius={[4,4,0,0]} />
                  <Bar dataKey="profit" name="Profit" fill="#10B981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {paymentData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="font-semibold text-gray-800 mb-3">Payment Methods</h4>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={paymentData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value" nameKey="name" label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}>
                    {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val) => `Rs. ${val.toFixed(0)}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {topData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="font-semibold text-gray-800 mb-3">Top Medicines</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} />
                <YAxis dataKey="name" type="category" fontSize={10} width={120} />
                <Tooltip formatter={(val) => `Rs. ${val.toFixed(0)}`} />
                <Bar dataKey="profit" name="Profit" fill="#10B981" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {(cashier_breakdown || []).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="font-semibold text-gray-800 mb-3">Cashier Performance</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {cashier_breakdown.map((c, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b text-sm">
                  <span className="font-medium">{c.full_name}</span>
                  <span className="text-gray-600">{c.bills} bills</span>
                  <span className="text-green-600 font-medium">Rs. {parseFloat(c.revenue || 0).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === 'day') {
    const { summary, returns, net_sales, cashier_breakdown, payment_breakdown, top_medicines } = data;
    const trendData = (top_medicines || []).map(m => ({
      name: m.name?.length > 15 ? m.name.slice(0, 15) + '...' : m.name,
      qty: m.total_qty || 0,
      profit: parseFloat(m.profit || 0),
    }));
    const paymentData = (payment_breakdown || []).map(p => ({
      name: p.payment_method,
      value: parseFloat(p.amount || 0),
      count: p.count || 0,
    }));

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h4 className="font-semibold text-gray-800 mb-4 text-lg">Day Summary - {data.date}</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MiniStat label="Revenue" value={`Rs. ${parseFloat(summary.total_revenue || 0).toFixed(0)}`} />
            <MiniStat label="Profit" value={`Rs. ${parseFloat(summary.total_profit || 0).toFixed(0)}`} color="green" />
            <MiniStat label="Net Sales" value={`Rs. ${parseFloat(net_sales || 0).toFixed(0)}`} />
            <MiniStat label="Bills" value={summary.bill_count || 0} />
            <MiniStat label="Returns" value={`Rs. ${parseFloat(returns.total_refunds || 0).toFixed(0)}`} color="red" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {trendData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="font-semibold text-gray-800 mb-3">Top Selling Medicines</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis dataKey="name" type="category" fontSize={10} width={100} />
                  <Tooltip />
                  <Bar dataKey="qty" name="Qty Sold" fill="#3B82F6" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {paymentData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="font-semibold text-gray-800 mb-3">Payment Methods</h4>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={paymentData} cx="50%" cy="50%" outerRadius={70} innerRadius={35} dataKey="value" nameKey="name" label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}>
                    {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(val) => `Rs. ${val.toFixed(0)}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {(cashier_breakdown || []).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="font-semibold text-gray-800 mb-3">Cashier Performance</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cashier_breakdown.map((c, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b text-sm">
                  <span className="font-medium">{c.full_name}</span>
                  <span className="text-gray-600">{c.bills} bills</span>
                  <span className="text-green-600 font-medium">Rs. {parseFloat(c.revenue || 0).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === 'bills') {
    const bills = Array.isArray(data) ? data : [];
    const [selectedBill, setSelectedBill] = useState(null);
    const [billDetails, setBillDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const openBillDetails = async (bill) => {
      setSelectedBill(bill);
      setBillDetails(null);
      setLoadingDetails(true);
      try {
        const res = await api.get(`/sales/${bill.id}`);
        setBillDetails(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingDetails(false);
      }
    };

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h4 className="font-semibold text-gray-800">Bills ({bills.length})</h4>
          </div>
          {bills.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No bills found for selected date range</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Bill #</th>
                  <th className="text-left p-3 font-medium text-gray-600">Date & Time</th>
                  <th className="text-left p-3 font-medium text-gray-600">Cashier</th>
                  <th className="text-right p-3 font-medium text-gray-600">Subtotal</th>
                  <th className="text-right p-3 font-medium text-gray-600">Discount</th>
                  <th className="text-right p-3 font-medium text-gray-600">Amount</th>
                  <th className="text-left p-3 font-medium text-gray-600">Payment</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill, i) => (
                  <tr
                    key={i}
                    className="border-t hover:bg-blue-50 cursor-pointer"
                    onClick={() => openBillDetails(bill)}
                  >
                    <td className="p-3 font-medium text-blue-600">{bill.bill_number}</td>
                    <td className="p-3 text-gray-600">{new Date(bill.created_at).toLocaleString('en-GB')}</td>
                    <td className="p-3">{bill.cashier_name || '-'}</td>
                    <td className="p-3 text-right">Rs. {parseFloat(bill.subtotal || 0).toFixed(2)}</td>
                    <td className="p-3 text-right text-red-500">
                      {bill.discount_amount > 0 ? `-Rs. ${parseFloat(bill.discount_amount || 0).toFixed(2)}` : '-'}
                    </td>
                    <td className="p-3 text-right font-medium">Rs. {parseFloat(bill.final_amount || 0).toFixed(2)}</td>
                    <td className="p-3 text-gray-600">{bill.payment_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedBill && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold text-lg">Bill #{selectedBill.bill_number}</h3>
                <button onClick={() => setSelectedBill(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                {loadingDetails ? (
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : billDetails ? (
                  <div className="space-y-4">
                    <div className="text-center border-b pb-3">
                      <h2 className="font-bold text-lg">{settings.shop_name || 'Medical Store'}</h2>
                      <p className="text-sm text-gray-600">{settings.shop_address || ''}</p>
                      <p className="text-sm text-gray-600">{settings.shop_phone || ''}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs">Date & Time</p>
                        <p className="font-medium">{new Date(billDetails.created_at).toLocaleString('en-GB')}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Cashier</p>
                        <p className="font-medium">{billDetails.cashier_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Payment Method</p>
                        <p className="font-medium">{billDetails.payment_method}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Status</p>
                        <p className="font-medium text-green-600">Completed</p>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium text-sm mb-2">Items</h4>
                      <table className="w-full text-sm border">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-2 text-xs">Medicine</th>
                            <th className="text-center p-2 text-xs">Qty</th>
                            <th className="text-right p-2 text-xs">Rate</th>
                            <th className="text-right p-2 text-xs">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(billDetails.items || []).map((item, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="p-2">{item.medicine_name || item.medicine_id}</td>
                              <td className="p-2 text-center">{item.quantity}</td>
                              <td className="p-2 text-right">Rs. {parseFloat(item.selling_rate_per_unit || 0).toFixed(2)}</td>
                              <td className="p-2 text-right">Rs. {parseFloat(item.line_total || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal</span>
                        <span>Rs. {parseFloat(billDetails.subtotal || 0).toFixed(2)}</span>
                      </div>
                      {billDetails.discount_amount > 0 && (
                        <div className="flex justify-between text-sm text-red-500">
                          <span>Discount ({billDetails.discount_type === 'PERCENTAGE' ? `${billDetails.discount_value}%` : 'Fixed'})</span>
                          <span>- Rs. {parseFloat(billDetails.discount_amount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {billDetails.tax_amount > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Tax</span>
                          <span>Rs. {parseFloat(billDetails.tax_amount || 0).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg border-t pt-2">
                        <span>Total</span>
                        <span>Rs. {parseFloat(billDetails.final_amount || 0).toFixed(2)}</span>
                      </div>
                      {billDetails.total_profit !== undefined && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Profit</span>
                          <span>Rs. {parseFloat(billDetails.total_profit || 0).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div className="border-t pt-4 text-center text-sm text-gray-500">
                      <p className="font-medium">BunnySystems</p>
                      <p>03084624629</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === 'stock') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MiniStat label="Total Units" value={data.totals?.total_units?.toLocaleString() || 0} />
          <MiniStat label="Stock Value (Cost)" value={`Rs. ${parseFloat(data.totals?.total_value || 0).toFixed(0)}`} />
          <MiniStat label="Retail Value" value={`Rs. ${parseFloat(data.totals?.total_retail || 0).toFixed(0)}`} color="green" />
        </div>
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Medicine</th>
                <th className="text-left p-3 font-medium text-gray-600">Category</th>
                <th className="text-right p-3 font-medium text-gray-600">Units</th>
                <th className="text-right p-3 font-medium text-gray-600">Stock Value</th>
                <th className="text-right p-3 font-medium text-gray-600">Retail Value</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((item, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="p-3">{item.name}</td>
                  <td className="p-3 text-gray-600">{item.category || '-'}</td>
                  <td className="p-3 text-right">{item.total_units?.toLocaleString()}</td>
                  <td className="p-3 text-right">Rs. {parseFloat(item.stock_value || 0).toFixed(0)}</td>
                  <td className="p-3 text-right text-green-600">Rs. {parseFloat(item.retail_value || 0).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === 'margins') {
    const marginData = (data || []).map(m => ({
      name: m.name?.length > 20 ? m.name.slice(0, 20) + '...' : m.name,
      fullName: m.name,
      margin: parseFloat(m.margin_percent || 0),
      profit: parseFloat(m.profit || 0),
      revenue: parseFloat(m.revenue || 0),
    }));

    return (
      <div className="space-y-6">
        {marginData.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="font-semibold text-gray-800 mb-3">Profit Margin by Medicine</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={marginData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" height={60} />
                <YAxis fontSize={11} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(val) => `${val.toFixed(1)}%`} />
                <Bar dataKey="margin" name="Margin %" fill="#8B5CF6" radius={[4,4,0,0]}>
                  {marginData.map((entry, i) => (
                    <Cell key={i} fill={entry.margin >= 20 ? '#10B981' : entry.margin >= 10 ? '#F59E0B' : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-3 justify-center text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500"></span> High (20%+)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500"></span> Medium (10-20%)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500"></span> Low (&lt;10%)</span>
            </div>
          </div>
        )}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Medicine</th>
                <th className="text-right p-3 font-medium text-gray-600">Units Sold</th>
                <th className="text-right p-3 font-medium text-gray-600">Revenue</th>
                <th className="text-right p-3 font-medium text-gray-600">Profit</th>
                <th className="text-right p-3 font-medium text-gray-600">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((item, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="p-3" title={item.name}>{item.name?.length > 30 ? item.name.slice(0, 30) + '...' : item.name}</td>
                  <td className="p-3 text-right">{item.units_sold?.toLocaleString()}</td>
                  <td className="p-3 text-right">Rs. {parseFloat(item.revenue || 0).toFixed(0)}</td>
                  <td className="p-3 text-right text-green-600">Rs. {parseFloat(item.profit || 0).toFixed(0)}</td>
                  <td className="p-3 text-right font-medium">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      item.margin_percent >= 20 ? 'bg-green-100 text-green-700' :
                      item.margin_percent >= 10 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {item.margin_percent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === 'expiry') {
    const items = data?.items || [];
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h4 className="font-semibold text-gray-800">Expiring Items</h4>
              <p className="text-sm text-gray-500">Items expiring within 90 days</p>
            </div>
            <button
              onClick={() => exportToExcel(items, 'expiry-alerts', ['name', 'category', 'batch_no', 'quantity_in_stock', 'expiry_date', 'days_remaining', 'supplier_name', 'selling_rate_per_unit'])}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
              Export to Excel
            </button>
          </div>
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No items expiring within 90 days</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Medicine</th>
                  <th className="text-left p-3 font-medium text-gray-600">Category</th>
                  <th className="text-left p-3 font-medium text-gray-600">Batch</th>
                  <th className="text-right p-3 font-medium text-gray-600">Qty</th>
                  <th className="text-left p-3 font-medium text-gray-600">Expiry Date</th>
                  <th className="text-center p-3 font-medium text-gray-600">Days Left</th>
                  <th className="text-right p-3 font-medium text-gray-600">Rate</th>
                  <th className="text-left p-3 font-medium text-gray-600">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const days = item.days_remaining;
                  const rowClass = days <= 0 ? 'bg-red-100' : days <= 30 ? 'bg-orange-100' : days <= 60 ? 'bg-yellow-50' : '';
                  return (
                    <tr key={i} className={`border-t hover:bg-gray-50 ${rowClass}`}>
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3 text-gray-600">{item.category || '-'}</td>
                      <td className="p-3 font-mono text-xs">{item.batch_no || '-'}</td>
                      <td className="p-3 text-right">{item.quantity_in_stock}</td>
                      <td className="p-3">{item.expiry_date}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          days <= 0 ? 'bg-red-200 text-red-800' : days <= 30 ? 'bg-orange-200 text-orange-800' : 'bg-yellow-200 text-yellow-800'
                        }`}>
                          {days <= 0 ? 'EXPIRED' : days}
                        </span>
                      </td>
                      <td className="p-3 text-right">Rs. {parseFloat(item.selling_rate_per_unit || 0).toFixed(2)}</td>
                      <td className="p-3 text-gray-600">{item.supplier_name || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (tab === 'lowstock') {
    const items = data?.items || [];
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <div>
              <h4 className="font-semibold text-gray-800">Low Stock Items</h4>
              <p className="text-sm text-gray-500">Items at or below reorder level</p>
            </div>
            <button
              onClick={() => exportToExcel(items, 'low-stock', ['name', 'category', 'reorder_level', 'total_stock', 'purchase_rate_per_unit', 'selling_rate_per_unit', 'stock_value'])}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
              Export to Excel
            </button>
          </div>
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">All items are sufficiently stocked</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">Medicine</th>
                  <th className="text-left p-3 font-medium text-gray-600">Category</th>
                  <th className="text-right p-3 font-medium text-gray-600">Reorder Level</th>
                  <th className="text-right p-3 font-medium text-gray-600">Current Stock</th>
                  <th className="text-right p-3 font-medium text-gray-600">Purchase Rate</th>
                  <th className="text-right p-3 font-medium text-gray-600">Sell Rate</th>
                  <th className="text-right p-3 font-medium text-gray-600">Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className={`border-t hover:bg-gray-50 ${item.total_stock === 0 ? 'bg-red-50' : 'bg-orange-50'}`}>
                    <td className="p-3 font-medium">{item.name}</td>
                    <td className="p-3 text-gray-600">{item.category || '-'}</td>
                    <td className="p-3 text-right">{item.reorder_level}</td>
                    <td className="p-3 text-right">
                      <span className={`font-bold ${item.total_stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                        {item.total_stock}
                      </span>
                    </td>
                    <td className="p-3 text-right">Rs. {parseFloat(item.purchase_rate_per_unit || 0).toFixed(2)}</td>
                    <td className="p-3 text-right">Rs. {parseFloat(item.selling_rate_per_unit || 0).toFixed(2)}</td>
                    <td className="p-3 text-right">Rs. {parseFloat(item.stock_value || 0).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return null;
}

async function exportToExcel(data, filename, columns) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(filename);

    worksheet.addRow(columns.map(col => col.replace(/_/g, ' ').toUpperCase()));

    data.forEach(row => {
      worksheet.addRow(columns.map(col => row[col] !== null && row[col] !== undefined ? row[col] : '-'));
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export error:', err);
    alert('Failed to export: ' + err.message);
  }
}

function exportToCSV(summary, cashierData, filename) {
  try {
    let csv = 'Summary\n';
    csv += `Total Revenue,${summary.total_revenue || 0}\n`;
    csv += `Total Profit,${summary.total_profit || 0}\n`;
    csv += `Total Bills,${summary.total_bills || 0}\n`;
    csv += `Average Bill Value,${summary.avg_bill_value || 0}\n`;
    csv += `Total Discount,${summary.total_discount || 0}\n\n`;
    csv += 'Cashier Performance\n';
    csv += 'Name,Bills,Revenue\n';
    cashierData.forEach(c => {
      csv += `${c.full_name},${c.bills},${c.revenue}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('CSV export error:', err);
    alert('Failed to export CSV: ' + err.message);
  }
}

function MiniStat({ label, value, color = 'gray' }) {
  const colors = { gray: 'text-gray-800', green: 'text-green-700', red: 'text-red-600' };
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${colors[color]}`}>{value}</p>
    </div>
  );
}
