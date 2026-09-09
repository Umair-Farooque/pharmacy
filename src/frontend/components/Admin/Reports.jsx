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
  const [medicines, setMedicines] = useState([]);
  const [users, setUsers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [extraFilters, setExtraFilters] = useState({});

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
    api.get('/medicines').then(setMedicines).catch(() => {});
    api.get('/users').then(setUsers).catch(() => {});
    api.get('/reports/batches').then(res => setBatches(res.batches || [])).catch(() => {});
  }, []);
  const [error, setError] = useState(null);
  const [expiryActionLoading, setExpiryActionLoading] = useState(false);
  const [expiryActionMsg, setExpiryActionMsg] = useState('');

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    setExpiryActionMsg('');
    try {
      const params = `?start_date=${filters.start_date}&end_date=${filters.end_date}`;
      let res;
      switch (activeTab) {
        case 'sales': {
          const extra = `&medicine_id=${extraFilters.medicine_id || ''}`;
          res = await api.get(`/reports/sales${params}${extra}`); break;
        }
        case 'day': res = await api.get(`/reports/day-summary/${filters.end_date}`); break;
        case 'stock': res = await api.get('/reports/stock-valuation'); break;
        case 'margins': res = await api.get(`/reports/profit-margins?start_date=${filters.start_date}&end_date=${filters.end_date}`); break;
        case 'bills': res = await api.get(`/sales?start_date=${filters.start_date}&end_date=${filters.end_date}&limit=100`); break;
        case 'expiry': res = await api.get('/reports/expiry-alerts?days=90'); break;
        case 'lowstock': res = await api.get('/reports/low-stock'); break;
        case 'purchases': {
          const extra = `&medicine_id=${extraFilters.medicine_id || ''}&supplier_id=${extraFilters.supplier_id || ''}&batch_id=${extraFilters.batch_id || ''}`;
          res = await api.get(`/reports/purchase-history${params}${extra}`); break;
        }
        case 'movements': {
          const extra = `&medicine_id=${extraFilters.medicine_id || ''}&batch_id=${extraFilters.batch_id || ''}&transaction_type=${extraFilters.transaction_type || ''}&user_id=${extraFilters.user_id || ''}`;
          res = await api.get(`/reports/stock-movements${params}${extra}`); break;
        }
        case 'returns': {
          const extra = `&medicine_id=${extraFilters.medicine_id || ''}&bill_number=${extraFilters.bill_number || ''}&user_id=${extraFilters.user_id || ''}`;
          res = await api.get(`/reports/returns${params}${extra}`); break;
        }
        case 'audit': {
          const extra = `&user_id=${extraFilters.user_id || ''}&action=${extraFilters.action || ''}&entity=${extraFilters.entity || ''}`;
          res = await api.get(`/reports/audit-log${params}${extra}`); break;
        }
        case 'profitloss': res = await api.get(`/reports/profit-loss${params}`); break;
        case 'category': res = await api.get(`/reports/category-sales${params}`); break;
        case 'users': res = await api.get(`/reports/user-activity${params}`); break;
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

  const markBatchExpired = async (batchId, medicineName) => {
    if (!confirm(`Mark all stock for "${medicineName}" batch #${batchId} as expired? This cannot be undone.`)) return;
    setExpiryActionLoading(true);
    setExpiryActionMsg('');
    try {
      await api.post('/stock/mark-expired', { batch_id: batchId, quantity: 999999 });
      setExpiryActionMsg(`Batch marked as expired for ${medicineName}`);
      setTimeout(() => { setExpiryActionMsg(''); }, 3000);
      loadReport();
    } catch (err) {
      setExpiryActionMsg('Error: ' + err.message);
    } finally {
      setExpiryActionLoading(false);
    }
  };

  useEffect(() => { loadReport(); }, [activeTab, filters.start_date, filters.end_date, extraFilters]);

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

  const fmt = (v) => parseFloat(v || 0).toFixed(0);
  const fmtRs = (v) => `Rs. ${fmt(v)}`;

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
  { key: 'purchases', label: 'Purchase History' },
  { key: 'movements', label: 'Stock Movements' },
  { key: 'returns', label: 'Returns' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'profitloss', label: 'Profit & Loss' },
  { key: 'category', label: 'Category Sales' },
  { key: 'users', label: 'User Activity' },
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

        {(activeTab === 'sales' || activeTab === 'day' || activeTab === 'bills' || activeTab === 'profitloss' || activeTab === 'category' || activeTab === 'users' || activeTab === 'margins') && (
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

        {activeTab === 'sales' && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={extraFilters.medicine_id || ''}
              onChange={e => setExtraFilters(f => ({ ...f, medicine_id: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">All Medicines</option>
              {(medicines || []).map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.generic_name ? ` — ${m.generic_name}` : ''}</option>
              ))}
            </select>
            {extraFilters.medicine_id && (
              <button
                onClick={() => setExtraFilters(f => ({ ...f, medicine_id: '' }))}
                className="px-3 py-2 text-xs text-blue-600 hover:text-blue-800"
              >
                Clear Medicine Filter
              </button>
            )}
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
          <ReportContent tab={activeTab} data={data} settings={settings} medicines={medicines} users={users} batches={batches} extraFilters={extraFilters} setExtraFilters={setExtraFilters} filters={filters} markBatchExpired={markBatchExpired} expiryActionLoading={expiryActionLoading} expiryActionMsg={expiryActionMsg} />
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

function ReportContent({ tab, data, settings, medicines, users, batches, extraFilters, setExtraFilters, filters, markBatchExpired, expiryActionLoading, expiryActionMsg }) {
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
          <button onClick={() => {
            const medFilter = extraFilters.medicine_id ? (medicines.find(m => m.id == extraFilters.medicine_id)?.name || '') : '';
            exportToCSV(summary, cashier_breakdown || [], `sales-report-${filters.start_date}-to-${filters.end_date}`, medFilter);
          }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Export CSV</button>
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
    const { summary, items, period } = data || { summary: {}, items: [], period: {} };
    const s = summary || {};
    const startDate = period?.start_date;
    const endDate = period?.end_date;

    const marginData = (items || []).map(m => ({
      name: m.name?.length > 20 ? m.name.slice(0, 20) + '...' : m.name,
      fullName: m.name,
      margin: parseFloat(m.margin_percent || 0),
      profit: parseFloat(m.profit || 0),
      revenue: parseFloat(m.revenue || 0),
    }));

    return (
      <div className="space-y-6">
        {startDate && endDate && (
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <p className="text-sm text-gray-600">Showing margins for: <span className="font-medium">{startDate}</span> to <span className="font-medium">{endDate}</span></p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MiniStat label="Medicines" value={s.total_medicines || 0} />
          <MiniStat label="Units Sold" value={s.total_units?.toLocaleString() || 0} />
          <MiniStat label="Revenue" value={`Rs. ${parseFloat(s.total_revenue || 0).toFixed(0)}`} />
          <MiniStat label="Profit" value={`Rs. ${parseFloat(s.total_profit || 0).toFixed(0)}`} color="green" />
          <MiniStat label="Avg Margin" value={`${s.avg_margin || 0}%`} color={s.avg_margin >= 20 ? 'green' : 'gray'} />
        </div>

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
                <th className="text-left p-3 font-medium text-gray-600">Category</th>
                <th className="text-right p-3 font-medium text-gray-600">Units Sold</th>
                <th className="text-right p-3 font-medium text-gray-600">Revenue</th>
                <th className="text-right p-3 font-medium text-gray-600">Cost</th>
                <th className="text-right p-3 font-medium text-gray-600">Profit</th>
                <th className="text-right p-3 font-medium text-gray-600">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {(items || []).map((item, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="p-3" title={item.name}>{item.name?.length > 30 ? item.name.slice(0, 30) + '...' : item.name}</td>
                  <td className="p-3 text-gray-600">{item.category || '-'}</td>
                  <td className="p-3 text-right">{parseInt(item.units_sold || 0).toLocaleString()}</td>
                  <td className="p-3 text-right">Rs. {parseFloat(item.revenue || 0).toFixed(0)}</td>
                  <td className="p-3 text-right text-orange-600">Rs. {parseFloat(item.cost || 0).toFixed(0)}</td>
                  <td className="p-3 text-right text-green-600">Rs. {parseFloat(item.profit || 0).toFixed(0)}</td>
                  <td className="p-3 text-right font-medium">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      item.margin_percent >= 20 ? 'bg-green-100 text-green-700' :
                      item.margin_percent >= 10 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {parseFloat(item.margin_percent || 0).toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {items && items.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="p-3" colSpan={2}>Total</td>
                  <td className="p-3 text-right">{parseInt(s.total_units || 0).toLocaleString()}</td>
                  <td className="p-3 text-right">Rs. {parseFloat(s.total_revenue || 0).toFixed(0)}</td>
                  <td className="p-3 text-right text-orange-600">Rs. {parseFloat(s.total_cost || 0).toFixed(0)}</td>
                  <td className="p-3 text-right text-green-700">Rs. {parseFloat(s.total_profit || 0).toFixed(0)}</td>
                  <td className="p-3 text-right">{s.avg_margin || 0}%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  }

  if (tab === 'expiry') {
    const items = data?.items || [];
    return (
      <div className="space-y-6">
        {expiryActionMsg && (
          <div className={`px-4 py-3 rounded-lg text-sm ${expiryActionMsg.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
            {expiryActionMsg}
          </div>
        )}
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
                  <th className="text-right p-3 font-medium text-gray-600">Action</th>
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
                      <td className="p-3 text-right">
                        {days <= 0 && (
                          <button onClick={() => markBatchExpired && markBatchExpired(item.id, item.name)} disabled={expiryActionLoading} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                            {expiryActionLoading ? 'Processing...' : 'Mark Expired'}
                          </button>
                        )}
                      </td>
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

  if (tab === 'purchases') {
    const { items, totals, supplierSummary, pagination } = data || { items: [], totals: {}, supplierSummary: [], pagination: {} };
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-semibold text-gray-800">Purchase History</h4>
              <p className="text-sm text-gray-500">Stock purchases and restocking by batch</p>
            </div>
            <button
              onClick={() => exportToExcel(items, 'purchase-history', ['purchase_date', 'medicine_name', 'generic_name', 'batch_no', 'supplier_name', 'quantity_received', 'quantity_in_stock', 'purchase_rate_per_unit', 'total_purchase_value', 'expiry_date', 'created_by_name'])}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
              Export to Excel
            </button>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <select value={extraFilters.medicine_id || ''} onChange={e => { setExtraFilters(f => ({ ...f, medicine_id: e.target.value, batch_id: '' })); }} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Medicines</option>
              {(medicines || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={extraFilters.batch_id || ''} onChange={e => setExtraFilters(f => ({ ...f, batch_id: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Batches</option>
              {(batches || []).filter(b => !extraFilters.medicine_id || b.medicine_id == extraFilters.medicine_id).map(b => <option key={b.id} value={b.id}>{b.batch_no} - {b.medicine_name}</option>)}
            </select>
            <select value={extraFilters.supplier_id || ''} onChange={e => setExtraFilters(f => ({ ...f, supplier_id: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Suppliers</option>
              {(supplierSummary || []).map(s => <option key={s.supplier_id || 'null'} value={s.supplier_id || ''}>{s.supplier_name || 'Unknown'}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Batches</p>
              <p className="text-2xl font-bold text-blue-700">{totals.total_batches || 0}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Units Purchased</p>
              <p className="text-2xl font-bold text-green-700">{totals.total_units || 0}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Purchase Value</p>
              <p className="text-2xl font-bold text-purple-700">Rs. {parseFloat(totals.total_value || 0).toFixed(0)}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Suppliers Used</p>
              <p className="text-2xl font-bold text-orange-700">{(supplierSummary || []).filter(s => s.supplier_id).length}</p>
            </div>
          </div>

          {supplierSummary && supplierSummary.length > 0 && (
            <div className="mb-6">
              <h5 className="font-semibold text-gray-700 mb-2">Supplier Summary</h5>
              <div className="overflow-x-auto">
                <table className="w-full text-sm mb-4">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 font-medium text-gray-600">Supplier</th>
                      <th className="text-right p-2 font-medium text-gray-600">Batches</th>
                      <th className="text-right p-2 font-medium text-gray-600">Units</th>
                      <th className="text-right p-2 font-medium text-gray-600">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierSummary.filter(s => s.supplier_id).map((s, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-medium">{s.supplier_name || 'Unknown'}</td>
                        <td className="p-2 text-right">{s.total_batches}</td>
                        <td className="p-2 text-right">{s.total_units}</td>
                        <td className="p-2 text-right text-green-700 font-medium">Rs. {parseFloat(s.total_value || 0).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pagination.total > 0 && (
            <div className="text-sm text-gray-500 mb-2">
              Showing {items.length} of {pagination.total} purchase batches (Page {pagination.page} of {pagination.pages})
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No purchase records found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Medicine</th>
                    <th className="text-left p-3 font-medium text-gray-600">Batch</th>
                    <th className="text-left p-3 font-medium text-gray-600">Supplier</th>
                    <th className="text-right p-3 font-medium text-gray-600">Purchased</th>
                    <th className="text-right p-3 font-medium text-gray-600">In Stock</th>
                    <th className="text-right p-3 font-medium text-gray-600">Rate</th>
                    <th className="text-right p-3 font-medium text-gray-600">Total</th>
                    <th className="text-left p-3 font-medium text-gray-600">Expiry</th>
                    <th className="text-left p-3 font-medium text-gray-600">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium">{item.medicine_name}</div>
                        {item.generic_name && <div className="text-xs text-gray-500">{item.generic_name}</div>}
                      </td>
                      <td className="p-3 font-mono text-gray-700">{item.batch_no || 'N/A'}</td>
                      <td className="p-3 text-gray-600">{item.supplier_name || 'Unknown'}</td>
                      <td className="p-3 text-right font-medium">{item.quantity_received}</td>
                      <td className="p-3 text-right">
                        <span className={item.quantity_in_stock === 0 ? 'text-red-600' : item.quantity_in_stock < 10 ? 'text-orange-600' : 'text-gray-700'}>
                          {item.quantity_in_stock}
                        </span>
                      </td>
                      <td className="p-3 text-right">Rs. {parseFloat(item.purchase_rate_per_unit || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-medium text-green-700">Rs. {parseFloat(item.total_purchase_value || 0).toFixed(2)}</td>
                      <td className="p-3 text-gray-600">{item.expiry_date || 'N/A'}</td>
                      <td className="p-3 text-gray-600">{item.purchase_date || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tab === 'movements') {
    const { items, pagination, summary } = data || { items: [], pagination: {}, summary: [] };
    const transactionTypes = ['PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN', 'EXPIRED'];

    const getTypeColor = (type) => {
      const colors = { PURCHASE: 'bg-green-100 text-green-800', SALE: 'bg-red-100 text-red-800', ADJUSTMENT: 'bg-yellow-100 text-yellow-800', RETURN: 'bg-blue-100 text-blue-800', EXPIRED: 'bg-gray-100 text-gray-800' };
      return colors[type] || 'bg-gray-100 text-gray-800';
    };

    const getTypeSign = (type, qty) => {
      if (type === 'PURCHASE' || type === 'RETURN') return `+${qty}`;
      if (type === 'SALE' || type === 'ADJUSTMENT' || type === 'EXPIRED') return `-${Math.abs(qty)}`;
      return qty;
    };

    const summaryMap = {};
    (summary || []).forEach(s => { summaryMap[s.transaction_type] = s; });

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-semibold text-gray-800">Stock Movements</h4>
              <p className="text-sm text-gray-500">Complete inventory transaction history</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportToExcel(items, 'stock-movements', ['created_at', 'medicine_name', 'batch_no', 'transaction_type', 'quantity_change', 'quantity_before', 'quantity_after', 'user_name', 'notes'])} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Export</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <select value={extraFilters.medicine_id || ''} onChange={e => { setExtraFilters(f => ({ ...f, medicine_id: e.target.value, batch_id: '' })); }} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Medicines</option>
              {(medicines || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={extraFilters.transaction_type || ''} onChange={e => setExtraFilters(f => ({ ...f, transaction_type: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Types</option>
              {transactionTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={extraFilters.batch_id || ''} onChange={e => setExtraFilters(f => ({ ...f, batch_id: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Batches</option>
              {(batches || []).filter(b => !extraFilters.medicine_id || b.medicine_id == extraFilters.medicine_id).map(b => <option key={b.id} value={b.id}>{b.batch_no} - {b.medicine_name} ({b.quantity_in_stock})</option>)}
            </select>
            <select value={extraFilters.user_id || ''} onChange={e => setExtraFilters(f => ({ ...f, user_id: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Users</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {transactionTypes.map(type => {
              const stats = summaryMap[type];
              if (!stats) return null;
              return (
                <div key={type} className={`rounded-lg p-3 ${getTypeColor(type)}`}>
                  <p className="text-xs font-medium">{type}</p>
                  <p className="text-lg font-bold">{stats.count} txns</p>
                  <p className="text-xs">Total: {getTypeSign(type, stats.total_qty)}</p>
                </div>
              );
            })}
          </div>

          {pagination.total > 0 && (
            <div className="text-sm text-gray-500 mb-2">
              Showing {items.length} of {pagination.total} transactions (Page {pagination.page} of {pagination.pages})
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No stock movements found for the selected filters</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Date/Time</th>
                    <th className="text-left p-3 font-medium text-gray-600">Medicine</th>
                    <th className="text-left p-3 font-medium text-gray-600">Batch</th>
                    <th className="text-left p-3 font-medium text-gray-600">Type</th>
                    <th className="text-right p-3 font-medium text-gray-600">Qty Change</th>
                    <th className="text-right p-3 font-medium text-gray-600">Before</th>
                    <th className="text-right p-3 font-medium text-gray-600">After</th>
                    <th className="text-left p-3 font-medium text-gray-600">User</th>
                    <th className="text-left p-3 font-medium text-gray-600">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{item.created_at ? new Date(item.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="p-3 font-medium">{item.medicine_name}</td>
                      <td className="p-3 font-mono text-gray-700">{item.batch_no || 'N/A'}</td>
                      <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(item.transaction_type)}`}>{item.transaction_type}</span></td>
                      <td className={`p-3 text-right font-bold ${item.transaction_type === 'PURCHASE' || item.transaction_type === 'RETURN' ? 'text-green-600' : 'text-red-600'}`}>{getTypeSign(item.transaction_type, item.quantity_change)}</td>
                      <td className="p-3 text-right">{item.quantity_before}</td>
                      <td className="p-3 text-right">{item.quantity_after}</td>
                      <td className="p-3 text-gray-600">{item.user_name || '-'}</td>
                      <td className="p-3 text-gray-600 text-xs">{item.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tab === 'returns') {
    const { items, pagination, summary } = data || { items: [], pagination: {}, summary: {} };

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-semibold text-gray-800">Returns Report</h4>
              <p className="text-sm text-gray-500">Product returns and refunds</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportToExcel(items, 'returns-report', ['return_reference', 'created_at', 'bill_number', 'medicine_name', 'batch_no', 'quantity_returned', 'selling_rate_per_unit', 'purchase_rate_per_unit', 'refund_amount', 'cogs_reversed', 'cost_returned', 'profit_reversed', 'processed_by_name', 'reason'])} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Export</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Bill #"
              value={extraFilters.bill_number || ''}
              onChange={e => setExtraFilters(f => ({ ...f, bill_number: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm w-32"
            />
            <select value={extraFilters.medicine_id || ''} onChange={e => setExtraFilters(f => ({ ...f, medicine_id: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Medicines</option>
              {(medicines || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={extraFilters.user_id || ''} onChange={e => setExtraFilters(f => ({ ...f, user_id: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Users</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Returns</p>
              <p className="text-2xl font-bold text-blue-700">{summary.total_returns || 0}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Items Returned</p>
              <p className="text-2xl font-bold text-orange-700">{summary.total_items || 0}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Total Refunds</p>
              <p className="text-2xl font-bold text-red-700">Rs. {parseFloat(summary.total_refund || 0).toFixed(0)}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">COGS Reversed</p>
              <p className="text-2xl font-bold text-purple-700">Rs. {parseFloat(summary.total_cogs_reversed || 0).toFixed(0)}</p>
            </div>
          </div>

          {pagination.total > 0 && (
            <div className="text-sm text-gray-500 mb-2">
              Showing {items.length} of {pagination.total} returns (Page {pagination.page} of {pagination.pages})
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No returns found for the selected filters</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Date</th>
                    <th className="text-left p-3 font-medium text-gray-600">Return Ref #</th>
                    <th className="text-left p-3 font-medium text-gray-600">Bill #</th>
                    <th className="text-left p-3 font-medium text-gray-600">Medicine</th>
                    <th className="text-left p-3 font-medium text-gray-600">Batch</th>
                    <th className="text-right p-3 font-medium text-gray-600">Qty</th>
                    <th className="text-right p-3 font-medium text-gray-600">Sell Price</th>
                    <th className="text-right p-3 font-medium text-gray-600">Cost</th>
                    <th className="text-right p-3 font-medium text-gray-600">COGS Rev.</th>
                    <th className="text-right p-3 font-medium text-gray-600">Refund</th>
                    <th className="text-right p-3 font-medium text-gray-600">Profit Rev.</th>
                    <th className="text-left p-3 font-medium text-gray-600">User</th>
                    <th className="text-left p-3 font-medium text-gray-600">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{item.created_at ? new Date(item.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="p-3 font-mono font-medium">{item.return_reference || '-'}</td>
                      <td className="p-3 font-mono font-medium">{item.bill_number}</td>
                      <td className="p-3 font-medium">{item.medicine_name}</td>
                      <td className="p-3 font-mono text-gray-700">{item.batch_no || 'N/A'}</td>
                      <td className="p-3 text-right font-bold text-red-600">-{item.quantity_returned}</td>
                      <td className="p-3 text-right">Rs. {parseFloat(item.selling_rate_per_unit || 0).toFixed(2)}</td>
                      <td className="p-3 text-right">Rs. {parseFloat(item.purchase_rate_per_unit || 0).toFixed(2)}</td>
                      <td className="p-3 text-right text-blue-600">Rs. {parseFloat(item.cogs_reversed || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-red-600">Rs. {parseFloat(item.refund_amount || 0).toFixed(2)}</td>
                      <td className="p-3 text-right text-purple-600">Rs. {parseFloat(item.profit_reversed || 0).toFixed(2)}</td>
                      <td className="p-3 text-gray-600">{item.processed_by_name || '-'}</td>
                      <td className="p-3 text-gray-600 text-xs">{item.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tab === 'profitloss') {
    const { summary, daily_trend, period } = data || { summary: {}, daily_trend: [], period: {} };
    const s = summary || {};
    const startDate = period?.start_date || s.start_date;
    const endDate = period?.end_date || s.end_date;

    const netSalesForMargin = parseFloat(s.net_sales) || 0;
    const grossProfitForMargin = parseFloat(s.gross_profit) || 0;
    const marginColor = grossProfitForMargin >= 0 ? 'text-green-700' : 'text-red-600';

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-800 text-lg">Profit & Loss Statement</h4>
            <span className="text-sm text-gray-500">{startDate} to {endDate}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MiniStat label="Gross Sales" value={fmtRs(s.gross_sales)} />
            <MiniStat label="Discounts" value={`Rs. ${fmt(s.total_discounts)}`} color="red" />
            <MiniStat label="Tax Collected" value={fmtRs(s.tax_collected)} />
            <MiniStat label="Total Bills" value={s.total_bills || 0} />
          </div>

          <div className="border-t pt-4">
            <h5 className="font-medium text-gray-700 mb-3">P&L Summary</h5>
            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">Gross Sales</span>
                <span className="font-medium">{fmtRs(s.gross_sales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">Less: Discounts</span>
                <span className="font-medium text-red-500">({fmtRs(s.total_discounts)})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">Less: Returns / Refunds</span>
                <span className="font-medium text-red-500">({fmtRs(s.total_refunds)})</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 bg-gray-50 px-3 rounded">
                <span className="font-semibold text-gray-800">Net Sales</span>
                <span className="font-bold text-gray-900">{fmtRs(s.net_sales)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">Less: Original COGS</span>
                <span className="font-medium text-orange-600">({fmtRs(s.original_cogs)})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">Less: Returned COGS</span>
                <span className="font-medium text-green-600">({fmtRs(s.return_cogs)})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">Net COGS</span>
                <span className="font-medium text-orange-600">({fmtRs(s.net_cogs)})</span>
              </div>
              <div className="flex justify-between py-2 border-b-2 border-gray-200 bg-blue-50 px-3 rounded">
                <span className="font-bold text-gray-800">Gross Profit</span>
                <span className={`font-bold ${marginColor}`}>{fmtRs(s.gross_profit)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">Gross Margin</span>
                <span className={`font-bold ${marginColor}`}>{s.gross_margin_percent || 0}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-600">Operating Expenses</span>
                <span className="text-gray-400 italic">Not Tracked</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Net Profit</span>
                <span className="text-gray-400 italic">Not Available</span>
              </div>
            </div>
          </div>

          {(s.total_refunds > 0 || s.return_count > 0) && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg">
              <h5 className="font-medium text-red-800 mb-2">Returns Summary</h5>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-red-600">Return Count:</span> {s.return_count || 0}</div>
                <div><span className="text-red-600">Items Returned:</span> {s.items_returned || 0}</div>
                <div><span className="text-red-600">Refund Amount:</span> {fmtRs(s.total_refunds)}</div>
              </div>
            </div>
          )}

          {s.total_discounts > 0 && (
            <div className="mt-4 p-4 bg-orange-50 rounded-lg">
              <h5 className="font-medium text-orange-800 mb-2">Discount Breakdown</h5>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-orange-600">Percentage Discounts:</span> {fmtRs(s.percentage_discounts)}</div>
                <div><span className="text-orange-600">Fixed Discounts:</span> {fmtRs(s.fixed_discounts)}</div>
              </div>
            </div>
          )}
        </div>

        {daily_trend && daily_trend.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="font-semibold text-gray-800 mb-4">Daily Breakdown</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Gross Sales</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Discounts</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Net Sales</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">COGS</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Gross Profit</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {daily_trend.map((d, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{d.date}</td>
                      <td className="text-right px-3 py-2">{fmtRs(d.gross_sales)}</td>
                      <td className="text-right px-3 py-2 text-red-500">({fmtRs(d.discounts)})</td>
                      <td className="text-right px-3 py-2 font-medium">{fmtRs(d.net_sales)}</td>
                      <td className="text-right px-3 py-2 text-orange-500">({fmtRs(d.cogs)})</td>
                      <td className={`text-right px-3 py-2 font-medium ${d.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtRs(d.gross_profit)}</td>
                      <td className={`text-right px-3 py-2 font-medium ${d.gross_margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.gross_margin}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {daily_trend && daily_trend.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h4 className="font-semibold text-gray-800 mb-3">Profit Trend</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={daily_trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `Rs${v}`} />
                <Tooltip formatter={(val) => `Rs. ${parseFloat(val || 0).toFixed(0)}`} />
                <Legend />
                <Bar dataKey="net_sales" name="Net Sales" fill="#3B82F6" radius={[4,4,0,0]} />
                <Bar dataKey="cogs" name="COGS" fill="#F97316" radius={[4,4,0,0]} />
                <Bar dataKey="gross_profit" name="Gross Profit" fill="#10B981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => exportPLCSV(data)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
          >
            Export CSV
          </button>
        </div>
      </div>
    );
  }

  if (tab === 'category') {
    const { summary, categories } = data || { summary: {}, categories: [] };
    const s = summary || {};
    const topCategory = categories?.[0];

    const [sortField, setSortField] = useState('revenue');
    const sortedCategories = [...(categories || [])].sort((a, b) => {
      if (sortField === 'category') return (a.category || '').localeCompare(b.category || '');
      return (parseFloat(b[sortField]) || 0) - (parseFloat(a[sortField]) || 0);
    });

    const chartData = sortedCategories.slice(0, 10).map(c => ({
      name: (c.category || 'Uncategorized').length > 15 ? (c.category || 'Uncategorized').slice(0, 15) + '...' : (c.category || 'Uncategorized'),
      fullName: c.category || 'Uncategorized',
      revenue: parseFloat(c.revenue || 0),
      profit: parseFloat(c.profit || 0),
    }));

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-800 text-lg">Category Sales Analysis</h4>
            <div className="flex gap-2">
              <button
                onClick={() => exportCatCSV(data)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <MiniStat label="Categories" value={s.total_categories || 0} />
            <MiniStat label="Units Sold" value={s.total_units || 0} />
            <MiniStat label="Revenue" value={fmtRs(s.total_revenue)} />
            <MiniStat label="Profit" value={fmtRs(s.total_profit)} color="green" />
            <MiniStat label="Avg Margin" value={`${s.avg_margin || 0}%`} color={s.avg_margin >= 20 ? 'green' : 'gray'} />
          </div>

          {topCategory && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600 font-medium uppercase">Top Category</p>
              <p className="text-lg font-bold text-gray-800">{topCategory.category}</p>
              <div className="flex gap-6 mt-2 text-sm">
                <span className="text-gray-600">Revenue: <span className="font-medium">{fmtRs(topCategory.revenue)}</span></span>
                <span className="text-gray-600">Profit: <span className="font-medium text-green-700">{fmtRs(topCategory.profit)}</span></span>
                <span className="text-gray-600">Margin: <span className="font-medium">{topCategory.margin_percent}%</span></span>
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h4 className="font-semibold text-gray-800 mb-3">Revenue by Category</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" fontSize={11} tickFormatter={v => `Rs${v}`} />
                    <YAxis dataKey="name" type="category" fontSize={10} width={100} />
                    <Tooltip formatter={(val) => `Rs. ${parseFloat(val || 0).toFixed(0)}`} />
                    <Bar dataKey="revenue" name="Revenue" fill="#3B82F6" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h4 className="font-semibold text-gray-800 mb-3">Profit by Category</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" fontSize={11} tickFormatter={v => `Rs${v}`} />
                    <YAxis dataKey="name" type="category" fontSize={10} width={100} />
                    <Tooltip formatter={(val) => `Rs. ${parseFloat(val || 0).toFixed(0)}`} />
                    <Bar dataKey="profit" name="Profit" fill="#10B981" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-800">Category Breakdown</h4>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="revenue">Sort by Revenue</option>
              <option value="profit">Sort by Profit</option>
              <option value="units_sold">Sort by Units</option>
              <option value="margin_percent">Sort by Margin %</option>
              <option value="category">Sort by Category</option>
            </select>
          </div>

          {sortedCategories.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No category data for the selected period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Category</th>
                    <th className="text-right p-3 font-medium text-gray-600">Units Sold</th>
                    <th className="text-right p-3 font-medium text-gray-600">Revenue</th>
                    <th className="text-right p-3 font-medium text-gray-600">Cost</th>
                    <th className="text-right p-3 font-medium text-gray-600">Profit</th>
                    <th className="text-right p-3 font-medium text-gray-600">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCategories.map((cat, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-800">{cat.category}</td>
                      <td className="text-right p-3">{parseInt(cat.units_sold || 0).toLocaleString()}</td>
                      <td className="text-right p-3">{fmtRs(cat.revenue)}</td>
                      <td className="text-right p-3 text-orange-600">{fmtRs(cat.cost)}</td>
                      <td className={`text-right p-3 font-medium ${parseFloat(cat.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtRs(cat.profit)}</td>
                      <td className={`text-right p-3 font-medium ${parseFloat(cat.margin_percent) >= 20 ? 'text-green-600' : parseFloat(cat.margin_percent) >= 10 ? 'text-orange-600' : 'text-red-600'}`}>{parseFloat(cat.margin_percent || 0).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="p-3">Total</td>
                    <td className="text-right p-3">{parseInt(s.total_units || 0).toLocaleString()}</td>
                    <td className="text-right p-3">{fmtRs(s.total_revenue)}</td>
                    <td className="text-right p-3 text-orange-600">{fmtRs(s.total_cost)}</td>
                    <td className="text-right p-3 text-green-700">{fmtRs(s.total_profit)}</td>
                    <td className="text-right p-3">{s.avg_margin || 0}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tab === 'users') {
    const { summary, users } = data || { summary: {}, users: [] };
    const s = summary || {};

    const [sortField, setSortField] = useState('revenue');
    const [selectedUser, setSelectedUser] = useState(null);
    const sortedUsers = [...(users || [])].sort((a, b) => {
      if (sortField === 'name') return (a.full_name || '').localeCompare(b.full_name || '');
      return (parseFloat(b[sortField]) || 0) - (parseFloat(a[sortField]) || 0);
    });

    const roleColors = { ADMIN: 'bg-purple-100 text-purple-800', CASHIER: 'bg-blue-100 text-blue-800' };
    const txnColors = { PURCHASE: 'bg-green-100 text-green-800', SALE: 'bg-red-100 text-red-800', ADJUSTMENT: 'bg-yellow-100 text-yellow-800', RETURN: 'bg-blue-100 text-blue-800', EXPIRED: 'bg-gray-100 text-gray-800' };

    const selectedUserData = selectedUser ? users.find(u => u.user_id === selectedUser) : null;
    const invActivity = selectedUserData?.inventory_activity || {};
    const hasInvActivity = Object.keys(invActivity).length > 0;

    const selectedSaleData = null;
    const [saleDetails, setSaleDetails] = useState(null);
    const [loadingSale, setLoadingSale] = useState(false);

    const loadSaleDetails = async (userId) => {
      setLoadingSale(true);
      try {
        const params = `?start_date=${filters.start_date}&end_date=${filters.end_date}&cashier_id=${userId}&limit=20`;
        const res = await api.get(`/sales${params}`);
        setSaleDetails(Array.isArray(res) ? res.slice(0, 10) : []);
      } catch {
        setSaleDetails([]);
      } finally {
        setLoadingSale(false);
      }
    };

    const handleUserClick = (userId) => {
      if (selectedUser === userId) {
        setSelectedUser(null);
        setSaleDetails(null);
      } else {
        setSelectedUser(userId);
        loadSaleDetails(userId);
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-800 text-lg">User & Cashier Activity</h4>
            <button
              onClick={() => exportUserCSV(data)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
            >
              Export CSV
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <MiniStat label="Active Users" value={s.total_users || 0} />
            <MiniStat label="Total Bills" value={s.total_bills || 0} />
            <MiniStat label="Items Sold" value={s.total_items || 0} />
            <MiniStat label="Revenue" value={fmtRs(s.total_revenue)} />
            <MiniStat label="Profit" value={fmtRs(s.total_profit)} color="green" />
          </div>

          {s.total_bills > 0 && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg text-sm space-y-1">
              <div className="flex gap-6">
                <span>Total Discount: <span className="font-medium">{fmtRs(s.total_discount)}</span></span>
                <span>Avg Margin: <span className="font-medium">{s.avg_margin || 0}%</span></span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-800">User Performance</h4>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="revenue">Sort by Revenue</option>
              <option value="profit">Sort by Profit</option>
              <option value="bills">Sort by Bills</option>
              <option value="items_sold">Sort by Items</option>
              <option value="average_bill">Sort by Avg Bill</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>

          {sortedUsers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No user activity for the selected period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">User</th>
                    <th className="text-left p-3 font-medium text-gray-600">Role</th>
                    <th className="text-right p-3 font-medium text-gray-600">Bills</th>
                    <th className="text-right p-3 font-medium text-gray-600">Items</th>
                    <th className="text-right p-3 font-medium text-gray-600">Revenue</th>
                    <th className="text-right p-3 font-medium text-gray-600">Discount</th>
                    <th className="text-right p-3 font-medium text-gray-600">Profit</th>
                    <th className="text-right p-3 font-medium text-gray-600">Avg Bill</th>
                    <th className="text-center p-3 font-medium text-gray-600">Inventory Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((u, i) => {
                    const inv = u.inventory_activity || {};
                    const invKeys = Object.keys(inv);
                    const hasInv = invKeys.length > 0;
                    const isSelected = selectedUser === u.user_id;
                    return (
                      <>
                        <tr
                          key={i}
                          className={`border-t hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                          onClick={() => handleUserClick(u.user_id)}
                        >
                          <td className="p-3 font-medium text-gray-800">{u.full_name}</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${roleColors[u.role] || 'bg-gray-100 text-gray-800'}`}>{u.role}</span>
                          </td>
                          <td className="text-right p-3">{u.bills}</td>
                          <td className="text-right p-3">{u.items_sold}</td>
                          <td className="text-right p-3 font-medium">{fmtRs(u.revenue)}</td>
                          <td className="text-right p-3 text-red-500">{u.discount > 0 ? `(${fmtRs(u.discount)})` : '-'}</td>
                          <td className={`text-right p-3 font-medium ${u.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtRs(u.profit)}</td>
                          <td className="text-right p-3">{u.bills > 0 ? fmtRs(u.average_bill) : '-'}</td>
                          <td className="text-center p-3">
                            {hasInv ? (
                              <div className="flex flex-wrap gap-1 justify-center">
                                {invKeys.map(type => (
                                  <span key={type} className={`px-1.5 py-0.5 rounded text-xs font-medium ${txnColors[type] || 'bg-gray-100 text-gray-800'}`} title={`${inv[type].count} txns, ${inv[type].qty} units`}>
                                    {type} ({inv[type].count})
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                        {isSelected && (
                          <tr key={`${i}-detail`} className="bg-blue-50">
                            <td colSpan={9} className="p-4">
                              <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <h5 className="font-semibold text-gray-700">Inventory Activity for {u.full_name}</h5>
                                  <span className="text-sm text-gray-500">Click row to collapse</span>
                                </div>
                                {hasInv ? (
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {invKeys.map(type => (
                                      <div key={type} className={`rounded-lg p-3 ${txnColors[type] || 'bg-gray-100'}`}>
                                        <p className="text-xs font-medium">{type}</p>
                                        <p className="text-lg font-bold">{inv[type].count} txns</p>
                                        <p className="text-xs">Units: {inv[type].qty}</p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500">No inventory transactions recorded for this user in the selected period.</p>
                                )}
                                {u.bills > 0 && (
                                  <div>
                                    <h5 className="font-medium text-gray-700 mb-2">Recent Bills</h5>
                                    {loadingSale ? (
                                      <p className="text-sm text-gray-500">Loading...</p>
                                    ) : saleDetails && saleDetails.length > 0 ? (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead className="bg-white">
                                            <tr>
                                              <th className="text-left p-2">Bill #</th>
                                              <th className="text-left p-2">Date</th>
                                              <th className="text-right p-2">Items</th>
                                              <th className="text-right p-2">Amount</th>
                                              <th className="text-right p-2">Discount</th>
                                              <th className="text-left p-2">Payment</th>
                                            </tr>
                                          </thead>
                                          <tbody className="bg-white">
                                            {saleDetails.map((sale, si) => (
                                              <tr key={si} className="border-t">
                                                <td className="p-2 font-mono">{sale.bill_number}</td>
                                                <td className="p-2">{sale.created_at ? new Date(sale.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                                <td className="text-right p-2">-</td>
                                                <td className="text-right p-2 font-medium">{fmtRs(sale.final_amount)}</td>
                                                <td className="text-right p-2 text-red-500">{sale.discount_amount > 0 ? `(${fmtRs(sale.discount_amount)})` : '-'}</td>
                                                <td className="p-2">{sale.payment_method || '-'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-gray-500">No bills found.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="p-3" colSpan={2}>Total</td>
                    <td className="text-right p-3">{s.total_bills}</td>
                    <td className="text-right p-3">{s.total_items}</td>
                    <td className="text-right p-3">{fmtRs(s.total_revenue)}</td>
                    <td className="text-right p-3 text-red-500">{s.total_discount > 0 ? `(${fmtRs(s.total_discount)})` : '-'}</td>
                    <td className="text-right p-3 text-green-700">{fmtRs(s.total_profit)}</td>
                    <td className="text-right p-3">-</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tab === 'audit') {
    const { items, pagination, actionSummary } = data || { items: [], pagination: {}, actionSummary: [] };

    const actionColors = {
      LOGIN: 'bg-blue-100 text-blue-800',
      LOGOUT: 'bg-gray-100 text-gray-800',
      USER_CREATED: 'bg-green-100 text-green-800',
      USER_UPDATED: 'bg-yellow-100 text-yellow-800',
      USER_DEACTIVATED: 'bg-red-100 text-red-800',
      PASSWORD_CHANGED: 'bg-orange-100 text-orange-800',
      PASSWORD_RESET: 'bg-orange-100 text-orange-800',
      MEDICINE_CREATED: 'bg-green-100 text-green-800',
      MEDICINE_UPDATED: 'bg-yellow-100 text-yellow-800',
      MEDICINE_DELETED: 'bg-red-100 text-red-800',
      MEDICINE_PRICE_UPDATED: 'bg-blue-100 text-blue-800',
      STOCK_RESTOCK: 'bg-green-100 text-green-800',
      STOCK_ADJUSTED: 'bg-yellow-100 text-yellow-800',
      SALE_CREATED: 'bg-green-100 text-green-800',
      RETURN_PROCESSED: 'bg-blue-100 text-blue-800',
    };

    const parseDetails = (details) => {
      if (!details) return null;
      try { return JSON.parse(details); } catch { return details; }
    };

    const [selectedAudit, setSelectedAudit] = useState(null);

    const getActionColor = (action) => actionColors[action] || 'bg-gray-100 text-gray-800';

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-semibold text-gray-800">Audit Log</h4>
              <p className="text-sm text-gray-500">Administrative activity history</p>
            </div>
            <button
              onClick={() => exportToExcel(items.map(i => ({ ...i, details: typeof i.details === 'string' ? i.details : JSON.stringify(i.details) })), 'audit-log', ['created_at', 'user_name', 'action', 'table_affected', 'record_id', 'details'])}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
            >
              Export
            </button>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <select value={extraFilters.user_id || ''} onChange={e => setExtraFilters(f => ({ ...f, user_id: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Users</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <select value={extraFilters.action || ''} onChange={e => setExtraFilters(f => ({ ...f, action: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Actions</option>
              {actionSummary.map(a => <option key={a.action} value={a.action}>{a.action} ({a.count})</option>)}
            </select>
            <select value={extraFilters.entity || ''} onChange={e => setExtraFilters(f => ({ ...f, entity: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All Entities</option>
              {[...new Set(items.map(i => i.table_affected).filter(Boolean))].map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {actionSummary.map(a => (
              <div key={a.action} className={`px-3 py-1 rounded text-xs font-medium ${getActionColor(a.action)}`}>
                {a.action}: {a.count}
              </div>
            ))}
          </div>

          {pagination.total > 0 && (
            <div className="text-sm text-gray-500 mb-2">
              Showing {items.length} of {pagination.total} entries (Page {pagination.page} of {pagination.pages})
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No audit entries found for the selected filters</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Date/Time</th>
                    <th className="text-left p-3 font-medium text-gray-600">User</th>
                    <th className="text-left p-3 font-medium text-gray-600">Action</th>
                    <th className="text-left p-3 font-medium text-gray-600">Entity</th>
                    <th className="text-left p-3 font-medium text-gray-600">Record ID</th>
                    <th className="text-left p-3 font-medium text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{item.created_at ? new Date(item.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                      <td className="p-3 font-medium">{item.user_name || item.username || '-'}</td>
                      <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(item.action)}`}>{item.action}</span></td>
                      <td className="p-3 text-gray-600">{item.table_affected || '-'}</td>
                      <td className="p-3 text-gray-600">{item.record_id || '-'}</td>
                      <td className="p-3">
                        <button onClick={() => setSelectedAudit(item)} className="text-blue-600 hover:text-blue-800 text-xs underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedAudit && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedAudit(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-4">Audit Entry Details</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-sm text-gray-500">User:</div>
                  <div className="text-sm font-medium">{selectedAudit.user_name || selectedAudit.username || '-'}</div>
                  <div className="text-sm text-gray-500">Action:</div>
                  <div className="text-sm"><span className={`px-2 py-0.5 rounded text-xs font-medium ${getActionColor(selectedAudit.action)}`}>{selectedAudit.action}</span></div>
                  <div className="text-sm text-gray-500">Entity:</div>
                  <div className="text-sm">{selectedAudit.table_affected || '-'}</div>
                  <div className="text-sm text-gray-500">Record ID:</div>
                  <div className="text-sm">{selectedAudit.record_id || '-'}</div>
                  <div className="text-sm text-gray-500">Date/Time:</div>
                  <div className="text-sm">{selectedAudit.created_at ? new Date(selectedAudit.created_at).toLocaleString('en-GB') : '-'}</div>
                </div>
                {selectedAudit.details && (
                  <div>
                    <div className="text-sm text-gray-500 mb-1">Details:</div>
                    <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">{typeof selectedAudit.details === 'string' ? selectedAudit.details : JSON.stringify(parseDetails(selectedAudit.details), null, 2)}</pre>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setSelectedAudit(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Close</button>
              </div>
            </div>
          </div>
        )}
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

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToCSV(summary, cashierData, filename, medicineFilter) {
  try {
    let csv = 'Summary\n';
    csv += `Total Revenue,${summary.total_revenue || 0}\n`;
    csv += `Total Profit,${summary.total_profit || 0}\n`;
    csv += `Total Bills,${summary.total_bills || 0}\n`;
    csv += `Total Items,${summary.total_items || 0}\n`;
    csv += `Average Bill Value,${summary.avg_bill_value || 0}\n`;
    csv += `Total Discount,${summary.total_discount || 0}\n`;
    if (medicineFilter) {
      csv += `Medicine Filter,${medicineFilter}\n`;
    }
    csv += `\nCashier Performance\n`;
    csv += 'Name,Bills,Revenue\n';
    cashierData.forEach(c => {
      csv += `${c.full_name},${c.bills},${c.revenue}\n`;
    });

    downloadCSV(csv, `${filename}.csv`);
  } catch (err) {
    console.error('CSV export error:', err);
    alert('Failed to export CSV: ' + err.message);
  }
}

function exportPLCSV(data) {
  try {
    if (!data || !data.summary) return;
    const { summary, daily_trend, period } = data;
    const startDate = period?.start_date || summary.start_date;
    const endDate = period?.end_date || summary.end_date;
    let csv = `PROFIT & LOSS REPORT\n`;
    csv += `Period,${startDate} to ${endDate}\n\n`;
    csv += `SUMMARY\n`;
    csv += `Gross Sales,${summary.gross_sales || 0}\n`;
    csv += `Total Discounts,${summary.total_discounts || 0}\n`;
    csv += `Returns / Refunds,${summary.total_refunds || 0}\n`;
    csv += `Net Sales,${summary.net_sales || 0}\n`;
    csv += `Original COGS,${summary.original_cogs || 0}\n`;
    csv += `Returned COGS,${summary.return_cogs || 0}\n`;
    csv += `Net COGS,${summary.net_cogs || 0}\n`;
    csv += `Gross Profit,${summary.gross_profit || 0}\n`;
    csv += `Gross Margin %,${summary.gross_margin_percent || 0}\n`;
    csv += `Tax Collected,${summary.tax_collected || 0}\n`;
    csv += `Total Bills,${summary.total_bills || 0}\n`;
    csv += `Operating Expenses,Not Tracked\n`;
    csv += `Net Profit,Not Available\n\n`;

    if (daily_trend && daily_trend.length > 0) {
      csv += `DAILY BREAKDOWN\n`;
      csv += `Date,Gross Sales,Discounts,Net Sales,COGS,Gross Profit,Gross Margin %\n`;
      daily_trend.forEach(d => {
        csv += `${d.fullDate || d.date},${d.gross_sales || 0},${d.discounts || 0},${d.net_sales || 0},${d.cogs || 0},${d.gross_profit || 0},${d.gross_margin || 0}\n`;
      });
    }

    downloadCSV(csv, `profit-loss-${startDate}-to-${endDate}.csv`);
  } catch (err) {
    console.error('P&L CSV export error:', err);
    alert('Failed to export P&L CSV: ' + err.message);
  }
}

function exportCatCSV(data) {
  try {
    if (!data || !data.categories) return;
    const { categories, summary } = data;
    let csv = `CATEGORY SALES REPORT\n\n`;
    csv += `Category,Units Sold,Revenue,Cost,Profit,Margin %\n`;
    categories.forEach(c => {
      csv += `${c.category || 'Uncategorized'},${c.units_sold || 0},${c.revenue || 0},${c.cost || 0},${c.profit || 0},${c.margin_percent || 0}\n`;
    });
    csv += `\nTotal,${summary?.total_units || 0},${summary?.total_revenue || 0},${summary?.total_cost || 0},${summary?.total_profit || 0},${summary?.avg_margin || 0}\n`;

    downloadCSV(csv, 'category-sales.csv');
  } catch (err) {
    console.error('Category CSV export error:', err);
    alert('Failed to export Category CSV: ' + err.message);
  }
}

function exportUserCSV(data) {
  try {
    if (!data || !data.users) return;
    const { users, summary } = data;
    let csv = `USER ACTIVITY REPORT\n\n`;
    csv += `User,Role,Bills,Items Sold,Revenue,Discount,Profit,Avg Bill,Margin %,Inventory Activity\n`;
    users.forEach(u => {
      const inv = u.inventory_activity || {};
      const invStr = Object.keys(inv).map(k => `${k}:${inv[k].count}txns/${inv[k].qty}units`).join('; ') || 'None';
      csv += `${u.full_name || 'Unknown'},${u.role || 'Unknown'},${u.bills || 0},${u.items_sold || 0},${u.revenue || 0},${u.discount || 0},${u.profit || 0},${u.average_bill || 0},${u.margin_percent || 0},"${invStr}"\n`;
    });
    csv += `\nTotal,All,${summary?.total_bills || 0},${summary?.total_items || 0},${summary?.total_revenue || 0},${summary?.total_discount || 0},${summary?.total_profit || 0},-,-${summary?.avg_margin || 0},\n`;

    downloadCSV(csv, 'user-activity.csv');
  } catch (err) {
    console.error('User CSV export error:', err);
    alert('Failed to export User CSV: ' + err.message);
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
