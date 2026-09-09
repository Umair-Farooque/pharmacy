import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';

export default function Customers({ onBack }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creditFilter, setCreditFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creditTab, setCreditTab] = useState('bills');
  const [creditInfo, setCreditInfo] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [creditSuccess, setCreditSuccess] = useState('');

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newError, setNewError] = useState('');
  const [newLoading, setNewLoading] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      params.set('limit', '100');
      if (creditFilter === 'credit') params.set('credit', '1');
      else if (creditFilter === 'no-credit') params.set('credit', '0');
      const res = await api.get(`/customers?${params.toString()}`);
      setCustomers(res);
    } catch (err) {
      console.error('Load customers error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, creditFilter]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    const phone = newPhone.trim();
    if (!name) return setNewError('Name is required');
    if (!phone) return setNewError('Phone is required');

    setNewLoading(true);
    setNewError('');
    try {
      await api.post('/customers', { name, phone });
      setNewName('');
      setNewPhone('');
      setShowAddModal(false);
      loadCustomers();
    } catch (err) {
      setNewError(err.message || 'Failed to create customer');
    } finally {
      setNewLoading(false);
    }
  };

  const openEdit = (customer) => {
    setSelectedCustomer(customer);
    setEditName(customer.name);
    setEditPhone(customer.phone);
    setEditError('');
    setShowEditModal(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const name = editName.trim();
    const phone = editPhone.trim();
    if (!name) return setEditError('Name is required');
    if (!phone) return setEditError('Phone is required');

    setEditLoading(true);
    setEditError('');
    try {
      await api.put(`/customers/${selectedCustomer.id}`, { name, phone });
      setShowEditModal(false);
      loadCustomers();
      if (customerDetail && customerDetail.customer?.id === selectedCustomer.id) {
        loadCustomerDetail(selectedCustomer.id);
      }
    } catch (err) {
      setEditError(err.message || 'Failed to update customer');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this customer? Their history will be preserved.')) return;
    try {
      await api.post(`/customers/deactivate/${id}`);
      loadCustomers();
      if (showProfileModal && customerDetail?.customer?.id === id) {
        setShowProfileModal(false);
        setCustomerDetail(null);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const loadCustomerDetail = async (id) => {
    setDetailLoading(true);
    setShowProfileModal(true);
    setCreditTab('bills');
    setCreditInfo(null);
    setCreditSuccess('');
    setSelectedCustomer({ id });
    try {
      const res = await api.get(`/customers/${id}/history`);
      setCustomerDetail(res);
    } catch (err) {
      console.error('Load customer detail error:', err);
      setCustomerDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadCreditInfo = async () => {
    if (!selectedCustomer) return;
    setCreditLoading(true);
    try {
      const [summary, history] = await Promise.all([
        api.get(`/customers/${selectedCustomer.id}/credit-summary`),
        api.get(`/customers/${selectedCustomer.id}/credit-history`),
      ]);
      setCreditInfo({
        current_balance: summary.current_balance || 0,
        total_credit_sales: summary.total_credit_sales || 0,
        total_payments: Math.abs(summary.total_payments || 0),
        last_credit_sale_date: summary.last_credit_sale_date,
        history: history || [],
      });
    } catch {
      setCreditInfo(null);
    } finally {
      setCreditLoading(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) return setPaymentError('Enter a valid amount');
    setPaymentLoading(true);
    setPaymentError('');
    try {
      await api.post(`/customers/${selectedCustomer.id}/payment`, { customer_id: selectedCustomer.id, amount: parseFloat(paymentAmount), notes: paymentNotes || null });
      setCreditSuccess('Payment recorded successfully');
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      loadCreditInfo();
      setTimeout(() => setCreditSuccess(''), 3000);
    } catch (err) {
      setPaymentError(err.message || 'Failed to record payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  const openLastPurchase = async (customerId) => {
    setDetailLoading(true);
    setShowProfileModal(true);
    try {
      const res = await api.get(`/customers/${customerId}/last-purchase`);
      setCustomerDetail(res);
    } catch (err) {
      console.error('Load last purchase error:', err);
      setCustomerDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openSaleDetail = async (saleId) => {
    try {
      const res = await api.get(`/sales/${saleId}`);
      setCustomerDetail(prev => ({ ...prev, currentSale: res }));
    } catch (err) {
      alert('Failed to load bill details');
    }
  };

  const closeProfile = () => {
    setShowProfileModal(false);
    setCustomerDetail(null);
    setCreditInfo(null);
    setCreditTab('bills');
    setShowPaymentModal(false);
    setCreditSuccess('');
  };

  const fmt = (n) => (n != null ? parseFloat(n).toFixed(2) : '0.00');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Customers</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + Add Customer
          </button>
          {onBack && (
            <button onClick={onBack} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium">
              Back
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
          <select
            value={creditFilter}
            onChange={e => setCreditFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="all">All Customers</option>
            <option value="credit">Has Credit</option>
            <option value="no-credit">No Credit</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 font-medium text-gray-600">Name</th>
              <th className="text-left p-3 font-medium text-gray-600">Phone</th>
              <th className="text-left p-3 font-medium text-gray-600">Created</th>
              <th className="text-right p-3 font-medium text-gray-600">Credit Balance</th>
              <th className="text-right p-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="p-8 text-center text-gray-500">Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan="5" className="p-8 text-center text-gray-500">No customers found</td></tr>
            ) : (
              customers.map(c => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-gray-600">{c.phone}</td>
                  <td className="p-3 text-gray-500">{fmtDate(c.created_at)}</td>
                  <td className="p-3 text-right">
                    <span className={parseFloat(c.credit_balance || 0) > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                      Rs. {parseFloat(c.credit_balance || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => loadCustomerDetail(c.id)} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">History</button>
                      <button onClick={() => openEdit(c)} className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">Edit</button>
                      <button onClick={() => handleDeactivate(c.id)} className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">Deactivate</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Add Customer</h3>
              <button onClick={() => { setShowAddModal(false); setNewError(''); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleAdd} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Customer name" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="03001234567" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {newError && <p className="text-red-500 text-sm">{newError}</p>}
              <button type="submit" disabled={newLoading} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {newLoading ? 'Saving...' : 'Save Customer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showEditModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Edit Customer</h3>
              <button onClick={() => { setShowEditModal(false); setEditError(''); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleEdit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {editError && <p className="text-red-500 text-sm">{editError}</p>}
              <button type="submit" disabled={editLoading} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {editLoading ? 'Saving...' : 'Update Customer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Customer Details</h3>
              <button onClick={closeProfile} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-4 border-b bg-gray-50">
              {detailLoading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : customerDetail ? (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-lg">{customerDetail.customer?.name}</h4>
                      <p className="text-sm text-gray-600">{customerDetail.customer?.phone}</p>
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      <p>Total Bills: <span className="font-medium">{customerDetail.stats?.total_bills || 0}</span></p>
                      <p>Total Spent: <span className="font-medium">Rs. {fmt(customerDetail.stats?.total_spent)}</span></p>
                      <p>Last Purchase: <span className="font-medium">{fmtDate(customerDetail.stats?.last_purchase)}</span></p>
                    </div>
                  </div>
                  {customerDetail.sale && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs font-medium text-gray-600 mb-1">Last Purchase</p>
                      <p className="text-sm font-medium">{customerDetail.sale.bill_number} — {fmtDate(customerDetail.sale.created_at)}</p>
                      {customerDetail.sale.return_count > 0 && (
                        <p className="text-xs text-red-600 mt-1">Returned: Rs. {fmt(customerDetail.sale.total_refund_amount)}</p>
                      )}
                      <div className="mt-2 space-y-1">
                        {customerDetail.items?.map((item, i) => (
                          <p key={i} className="text-sm text-gray-700">{item.medicine_name} — {item.quantity} x Rs.{fmt(item.selling_rate_per_unit)}</p>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => openSaleDetail(customerDetail.sale.id)} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">View Full Bill</button>
                        <button onClick={() => loadCustomerDetail(customerDetail.customer.id)} className="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">View All Bills</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No customer data</p>
              )}
            </div>
            <div className="flex border-b">
              <button onClick={() => { setCreditTab('bills'); setCreditInfo(null); }} className={`px-4 py-2 text-sm font-medium ${creditTab === 'bills' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>Bills</button>
              <button onClick={() => { setCreditTab('credit'); loadCreditInfo(); }} className={`px-4 py-2 text-sm font-medium ${creditTab === 'credit' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>Credit</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {creditSuccess && <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{creditSuccess}</div>}
              {creditTab === 'bills' && (
                <>
                  {customerDetail?.currentSale && !customerDetail.sale && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <h4 className="font-medium mb-2">Bill #{customerDetail.currentSale.bill_number}</h4>
                      <div className="space-y-1">
                        {customerDetail.currentSale.items?.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span>{item.medicine_name}</span>
                            <span>{item.quantity} x Rs.{fmt(item.selling_rate_per_unit)} = Rs.{fmt(item.line_total)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-right font-bold mt-2">Total: Rs. {fmt(customerDetail.currentSale.final_amount)}</p>
                    </div>
                  )}
                  {customerDetail?.sales && customerDetail.sales.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2 font-medium text-gray-600">Bill No.</th>
                          <th className="text-left p-2 font-medium text-gray-600">Date</th>
                          <th className="text-right p-2 font-medium text-gray-600">Amount</th>
                          <th className="text-left p-2 font-medium text-gray-600">Payment</th>
                          <th className="text-left p-2 font-medium text-gray-600">Status</th>
                          <th className="text-right p-2 font-medium text-gray-600">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerDetail.sales.map(sale => {
                          const hasReturn = sale.return_count > 0;
                          const returnLabel = hasReturn ? `Returned (Rs. ${fmt(sale.total_refund_amount)})` : 'Completed';
                          const returnColor = hasReturn ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50';
                          return (
                            <tr key={sale.id} className="border-t hover:bg-gray-50">
                              <td className="p-2 font-medium">{sale.bill_number}</td>
                              <td className="p-2 text-gray-600">{fmtDate(sale.created_at)}</td>
                              <td className="p-2 text-right">Rs. {fmt(sale.final_amount)}</td>
                              <td className="p-2 text-gray-600">{sale.payment_method}</td>
                              <td className="p-2 text-left">
                                <span className={`text-xs px-2 py-1 rounded ${returnColor}`}>{returnLabel}</span>
                              </td>
                              <td className="p-2 text-right">
                                <button onClick={() => openSaleDetail(sale.id)} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">View</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    !customerDetail?.currentSale && <p className="text-center text-gray-500 py-8">No bills found for this customer</p>
                  )}
                </>
              )}
              {creditTab === 'credit' && (
                <div className="space-y-4">
                  {creditLoading ? (
                    <div className="text-center py-8 text-gray-500">Loading credit info...</div>
                  ) : creditInfo ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-500">Current Balance</p>
                          <p className="text-lg font-bold text-red-600">Rs. {parseFloat(creditInfo.current_balance || 0).toFixed(2)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-500">Total Credit Sales</p>
                          <p className="text-lg font-bold text-gray-800">Rs. {parseFloat(creditInfo.total_credit_sales || 0).toFixed(2)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-500">Total Payments</p>
                          <p className="text-lg font-bold text-green-600">Rs. {parseFloat(creditInfo.total_payments || 0).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button onClick={() => { setPaymentError(''); setShowPaymentModal(true); }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                          Record Payment
                        </button>
                      </div>
                      <h4 className="font-semibold text-sm text-gray-700 mt-4">Credit History</h4>
                      {(creditInfo.history || []).length === 0 ? (
                        <p className="text-center text-gray-500 py-4 text-sm">No credit transactions</p>
                      ) : (
                        <table className="w-full text-sm border rounded-lg overflow-hidden">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left p-2 text-xs font-medium text-gray-600">Date</th>
                              <th className="text-left p-2 text-xs font-medium text-gray-600">Type</th>
                              <th className="text-right p-2 text-xs font-medium text-gray-600">Amount</th>
                              <th className="text-right p-2 text-xs font-medium text-gray-600">Balance After</th>
                              <th className="text-left p-2 text-xs font-medium text-gray-600">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {creditInfo.history.map((tx, i) => (
                              <tr key={i} className="border-t">
                                <td className="p-2 text-xs">{fmtDate(tx.created_at)}</td>
                                <td className="p-2">
                                  <span className={`text-xs px-2 py-0.5 rounded ${tx.type === 'PAYMENT' ? 'bg-green-100 text-green-700' : tx.type === 'CREDIT_SALE' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                    {tx.type || 'CREDIT'}
                                  </span>
                                </td>
                                <td className={`p-2 text-right font-medium ${tx.type === 'PAYMENT' ? 'text-green-600' : 'text-red-600'}`}>
                                  {tx.type === 'PAYMENT' ? '+' : ''}Rs. {parseFloat(tx.amount || 0).toFixed(2)}
                                </td>
                                <td className="p-2 text-right text-xs">Rs. {parseFloat(tx.balance_after || 0).toFixed(2)}</td>
                                <td className="p-2 text-xs text-gray-600">{tx.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No credit information available</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Record Payment</h3>
              <button onClick={() => { setShowPaymentModal(false); setPaymentError(''); setPaymentAmount(''); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Amount (Rs.) *</label>
                <input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" required min="0.01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Payment notes..." rows="2" className="w-full px-3 py-2 border rounded-lg text-sm outline-none resize-none" />
              </div>
              {paymentError && <p className="text-red-500 text-sm">{paymentError}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowPaymentModal(false); setPaymentError(''); setPaymentAmount(''); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={paymentLoading} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">
                  {paymentLoading ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
