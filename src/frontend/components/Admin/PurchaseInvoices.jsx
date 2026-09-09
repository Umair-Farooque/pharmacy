import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

export default function PurchaseInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [invoiceDetail, setInvoiceDetail] = useState(null);

  const [form, setForm] = useState({
    invoice_number: '',
    supplier_id: '',
    purchase_date: new Date().toISOString().slice(0, 10),
    discount_amount: '0',
    tax_amount: '0',
    notes: '',
    items: [{ medicine_id: '', batch_no: '', quantity: '', purchase_rate_per_unit: '', selling_rate_per_unit: '', expiry_date: '' }],
  });

  useEffect(() => {
    loadInvoices();
    api.get('/suppliers').then(setSuppliers).catch(() => {});
    api.get('/medicines').then(setMedicines).catch(() => {});
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.get('/purchase/invoices');
      setInvoices(res || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const updateItem = (idx, field, value) => {
    setForm(f => {
      const items = f.items.map((it, i) => i === idx ? { ...it, [field]: value } : it);
      return { ...f, items };
    });
  };

  const addItem = () => {
    setForm(f => ({ ...f, items: [...f.items, { medicine_id: '', batch_no: '', quantity: '', purchase_rate_per_unit: '', selling_rate_per_unit: '', expiry_date: '' }] }));
  };

  const removeItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.invoice_number.trim()) return setError('Invoice number is required');
    if (!form.supplier_id) return setError('Supplier is required');
    if (!form.purchase_date) return setError('Purchase date is required');
    const validItems = form.items.filter(it => it.medicine_id && it.batch_no && it.quantity && it.purchase_rate_per_unit);
    if (validItems.length === 0) return setError('At least one valid item is required');

    setSubmitting(true);
    try {
      const payload = {
        invoice_number: form.invoice_number.trim(),
        supplier_id: parseInt(form.supplier_id),
        purchase_date: form.purchase_date,
        discount_amount: parseFloat(form.discount_amount) || 0,
        tax_amount: parseFloat(form.tax_amount) || 0,
        notes: form.notes || null,
        items: validItems.map(it => ({
          medicine_id: parseInt(it.medicine_id),
          batch_no: it.batch_no.trim(),
          quantity: parseInt(it.quantity),
          purchase_rate_per_unit: parseFloat(it.purchase_rate_per_unit),
          selling_rate_per_unit: it.selling_rate_per_unit ? parseFloat(it.selling_rate_per_unit) : null,
          expiry_date: it.expiry_date || null,
        })),
      };
      await api.post('/purchase/invoices', payload);
      setSuccess('Purchase invoice created successfully');
      setShowModal(false);
      setForm({
        invoice_number: '', supplier_id: '', purchase_date: new Date().toISOString().slice(0, 10),
        discount_amount: '0', tax_amount: '0', notes: '',
        items: [{ medicine_id: '', batch_no: '', quantity: '', purchase_rate_per_unit: '', selling_rate_per_unit: '', expiry_date: '' }],
      });
      loadInvoices();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to create purchase invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (invoice) => {
    try {
      const res = await api.get(`/purchase/invoices/${invoice.id}`);
      setInvoiceDetail(res);
    } catch {
      setInvoiceDetail(invoice);
    }
  };

  const fmt = (n) => (n != null ? parseFloat(n).toFixed(2) : '0.00');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-6">
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}
      {error && !showModal && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Purchase Invoices</h2>
        <button onClick={() => { setError(''); setShowModal(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          + New Purchase
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No purchase invoices found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Invoice #</th>
                <th className="text-left p-3 font-medium text-gray-600">Supplier</th>
                <th className="text-left p-3 font-medium text-gray-600">Date</th>
                <th className="text-right p-3 font-medium text-gray-600">Total</th>
                <th className="text-right p-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{inv.invoice_number}</td>
                  <td className="p-3 text-gray-600">{inv.supplier_name || '—'}</td>
                  <td className="p-3 text-gray-600">{fmtDate(inv.purchase_date)}</td>
                  <td className="p-3 text-right font-medium text-green-700">Rs. {fmt(inv.total_amount)}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => openDetail(inv)} className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">New Purchase Invoice</h3>
              <button onClick={() => { setShowModal(false); setError(''); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Number *</label>
                  <input type="text" value={form.invoice_number} onChange={e => updateField('invoice_number', e.target.value)} placeholder="INV-001" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                  <select value={form.supplier_id} onChange={e => updateField('supplier_id', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Purchase Date *</label>
                  <input type="date" value={form.purchase_date} onChange={e => updateField('purchase_date', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input type="text" value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Optional notes" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm text-gray-700">Items</h4>
                  <button type="button" onClick={addItem} className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">+ Add Item</button>
                </div>
                <div className="space-y-3">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg">
                      <div className="col-span-3">
                        <label className="block text-xs text-gray-500 mb-0.5">Medicine *</label>
                        <select value={item.medicine_id} onChange={e => updateItem(idx, 'medicine_id', e.target.value)} className="w-full px-2 py-1.5 border rounded text-xs outline-none">
                          <option value="">Select...</option>
                          {medicines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Batch *</label>
                        <input type="text" value={item.batch_no} onChange={e => updateItem(idx, 'batch_no', e.target.value)} placeholder="Batch" className="w-full px-2 py-1.5 border rounded text-xs outline-none" required />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-xs text-gray-500 mb-0.5">Qty *</label>
                        <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="0" className="w-full px-2 py-1.5 border rounded text-xs outline-none" required />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Pur. Rate *</label>
                        <input type="number" step="0.01" value={item.purchase_rate_per_unit} onChange={e => updateItem(idx, 'purchase_rate_per_unit', e.target.value)} placeholder="0.00" className="w-full px-2 py-1.5 border rounded text-xs outline-none" required />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Sell Rate</label>
                        <input type="number" step="0.01" value={item.selling_rate_per_unit} onChange={e => updateItem(idx, 'selling_rate_per_unit', e.target.value)} placeholder="0.00" className="w-full px-2 py-1.5 border rounded text-xs outline-none" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-xs text-gray-500 mb-0.5">Expiry</label>
                        <input type="date" value={item.expiry_date} onChange={e => updateItem(idx, 'expiry_date', e.target.value)} className="w-full px-2 py-1.5 border rounded text-xs outline-none" />
                      </div>
                      <div className="col-span-1 flex items-end">
                        <button type="button" onClick={() => removeItem(idx)} className="text-xs px-2 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Discount Amount (Rs.)</label>
                  <input type="number" step="0.01" value={form.discount_amount} onChange={e => updateField('discount_amount', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tax Amount (Rs.)</label>
                  <input type="number" step="0.01" value={form.tax_amount} onChange={e => updateField('tax_amount', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" />
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowModal(false); setError(''); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {invoiceDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Invoice #{invoiceDetail.invoice_number}</h3>
              <button onClick={() => setInvoiceDetail(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div><span className="text-gray-500">Supplier:</span> <span className="font-medium">{invoiceDetail.supplier_name}</span></div>
                <div><span className="text-gray-500">Date:</span> <span className="font-medium">{fmtDate(invoiceDetail.purchase_date)}</span></div>
                <div><span className="text-gray-500">Created By:</span> <span className="font-medium">{invoiceDetail.created_by_name}</span></div>
                <div><span className="text-gray-500">Total:</span> <span className="font-bold text-green-700">Rs. {fmt(invoiceDetail.total_amount)}</span></div>
                {invoiceDetail.notes && <div className="col-span-2"><span className="text-gray-500">Notes:</span> {invoiceDetail.notes}</div>}
              </div>
              <h4 className="font-semibold text-sm text-gray-700 mb-2">Items</h4>
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 text-xs font-medium text-gray-600">Medicine</th>
                    <th className="text-left p-2 text-xs font-medium text-gray-600">Batch</th>
                    <th className="text-right p-2 text-xs font-medium text-gray-600">Qty</th>
                    <th className="text-right p-2 text-xs font-medium text-gray-600">Pur. Rate</th>
                    <th className="text-right p-2 text-xs font-medium text-gray-600">Sell Rate</th>
                    <th className="text-right p-2 text-xs font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoiceDetail.items || []).map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{item.medicine_name}</td>
                      <td className="p-2 font-mono text-xs">{item.batch_no}</td>
                      <td className="p-2 text-right">{item.quantity}</td>
                      <td className="p-2 text-right">Rs. {fmt(item.purchase_rate_per_unit)}</td>
                      <td className="p-2 text-right">Rs. {fmt(item.selling_rate_per_unit)}</td>
                      <td className="p-2 text-right font-medium">Rs. {fmt(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex justify-end">
              <button onClick={() => setInvoiceDetail(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
