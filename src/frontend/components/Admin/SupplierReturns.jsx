import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

export default function SupplierReturns() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [batches, setBatches] = useState([]);

  const [form, setForm] = useState({
    supplier_id: '',
    batch_id: '',
    medicine_id: '',
    quantity_returned: '',
    reason: '',
  });

  useEffect(() => {
    loadReturns();
    api.get('/suppliers').then(setSuppliers).catch(() => {});
    api.get('/medicines').then(() => {
      api.get('/reports/batches').then(res => setBatches(res.batches || [])).catch(() => {});
    }).catch(() => {});
  }, []);

  const loadReturns = async () => {
    setLoading(true);
    try {
      const res = await api.get('/supplier-returns');
      setReturns(res || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    if (field === 'supplier_id') {
      setForm(f => ({ ...f, supplier_id: value, batch_id: '', medicine_id: '' }));
    } else if (field === 'batch_id') {
      const batch = batches.find(b => b.id == value);
      setForm(f => ({ ...f, batch_id: value, medicine_id: batch ? batch.medicine_id : '' }));
    } else {
      setForm(f => ({ ...f, [field]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.supplier_id) return setError('Supplier is required');
    if (!form.batch_id) return setError('Batch is required');
    if (!form.quantity_returned || parseInt(form.quantity_returned) <= 0) return setError('Valid quantity is required');

    setSubmitting(true);
    try {
      await api.post('/supplier-returns', {
        supplier_id: parseInt(form.supplier_id),
        batch_id: parseInt(form.batch_id),
        medicine_id: parseInt(form.medicine_id),
        quantity_returned: parseInt(form.quantity_returned),
        reason: form.reason || null,
      });
      setSuccess('Supplier return processed successfully');
      setShowModal(false);
      setForm({ supplier_id: '', batch_id: '', medicine_id: '', quantity_returned: '', reason: '' });
      loadReturns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to process return');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBatches = batches.filter(b => !form.supplier_id || String(b.supplier_id) === form.supplier_id);

  const fmt = (n) => (n != null ? parseFloat(n).toFixed(2) : '0.00');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-6">
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}
      {error && !showModal && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Supplier Returns</h2>
        <button onClick={() => { setError(''); setShowModal(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          + New Return
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : returns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No supplier returns found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Reference</th>
                <th className="text-left p-3 font-medium text-gray-600">Supplier</th>
                <th className="text-left p-3 font-medium text-gray-600">Medicine</th>
                <th className="text-left p-3 font-medium text-gray-600">Batch</th>
                <th className="text-right p-3 font-medium text-gray-600">Qty Returned</th>
                <th className="text-right p-3 font-medium text-gray-600">Rate</th>
                <th className="text-left p-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium font-mono text-xs">{r.return_reference}</td>
                  <td className="p-3 text-gray-600">{r.supplier_name || '—'}</td>
                  <td className="p-3 text-gray-600">{r.medicine_name || '—'}</td>
                  <td className="p-3 font-mono text-xs">{r.batch_no || '—'}</td>
                  <td className="p-3 text-right font-medium text-red-600">{r.quantity_returned}</td>
                  <td className="p-3 text-right">Rs. {fmt(r.purchase_rate_per_unit)}</td>
                  <td className="p-3 text-gray-600">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">New Supplier Return</h3>
              <button onClick={() => { setShowModal(false); setError(''); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                <select value={form.supplier_id} onChange={e => updateField('supplier_id', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" required>
                  <option value="">Select supplier...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Batch *</label>
                <select value={form.batch_id} onChange={e => updateField('batch_id', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" required disabled={!form.supplier_id}>
                  <option value="">{form.supplier_id ? 'Select batch...' : 'Select supplier first'}</option>
                  {filteredBatches.map(b => <option key={b.id} value={b.id}>{b.batch_no} - {b.name} (Avail: {b.quantity_in_stock})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity Returned *</label>
                <input type="number" value={form.quantity_returned} onChange={e => updateField('quantity_returned', e.target.value)} placeholder="0" className="w-full px-3 py-2 border rounded-lg text-sm outline-none" required min="1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                <textarea value={form.reason} onChange={e => updateField('reason', e.target.value)} placeholder="Reason for return..." rows="2" className="w-full px-3 py-2 border rounded-lg text-sm outline-none resize-none" />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setShowModal(false); setError(''); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                  {submitting ? 'Processing...' : 'Process Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
