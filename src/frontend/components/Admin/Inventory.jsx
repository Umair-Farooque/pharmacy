import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';

export default function Inventory() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [racks, setRacks] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const loadMedicines = useCallback(async () => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/medicines${params}`);
      setMedicines(res);
    } catch (err) {
      console.error('Load medicines error:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { loadMedicines(); }, [loadMedicines]);
  useEffect(() => {
    api.get('/racks').then(setRacks).catch(() => {});
    api.get('/suppliers').then(setSuppliers).catch(() => {});
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Delete this medicine?')) return;
    try {
      await api.delete(`/medicines/${id}`);
      loadMedicines();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Inventory</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          + Add Medicine
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <input
          type="text"
          placeholder="Search by name, generic name, or barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-600">Name</th>
                  <th className="text-left p-4 font-medium text-gray-600">Category</th>
                  <th className="text-left p-4 font-medium text-gray-600">Rack</th>
                  <th className="text-right p-4 font-medium text-gray-600">Stock</th>
                  <th className="text-right p-4 font-medium text-gray-600">Buy Rate</th>
                  <th className="text-right p-4 font-medium text-gray-600">Sell Rate</th>
                  <th className="text-right p-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map(med => (
                  <tr key={med.id} className="border-t hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-medium text-gray-800">{med.name}</div>
                      {med.generic_name && <div className="text-xs text-gray-500">{med.generic_name}</div>}
                    </td>
                    <td className="p-4 text-gray-600">{med.category || '-'}</td>
                    <td className="p-4 text-gray-600">{med.rack_code || '-'}</td>
                    <td className="p-4 text-right">
                      <span className={`font-medium ${med.total_stock <= med.reorder_level ? 'text-red-600' : 'text-gray-800'}`}>
                        {med.total_stock}
                      </span>
                    </td>
                    <td className="p-4 text-right text-gray-600">{med.purchase_rate_per_unit ? `Rs. ${med.purchase_rate_per_unit}` : '-'}</td>
                    <td className="p-4 text-right text-gray-600">{med.selling_rate_per_unit ? `Rs. ${med.selling_rate_per_unit}` : '-'}</td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => { setSelectedMedicine(med); setShowRestockModal(true); }}
                        className="px-3 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100"
                      >
                        Restock
                      </button>
                      <button
                        onClick={() => handleDelete(med.id)}
                        className="px-3 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {medicines.length === 0 && (
            <div className="text-center py-12 text-gray-500">No medicines found.</div>
          )}
        </div>
      )}

      {showAddModal && (
        <AddMedicineModal
          onClose={() => setShowAddModal(false)}
          onSave={() => { setShowAddModal(false); loadMedicines(); }}
          racks={racks}
          suppliers={suppliers}
        />
      )}

      {showRestockModal && selectedMedicine && (
        <RestockModal
          medicine={selectedMedicine}
          suppliers={suppliers}
          onClose={() => { setShowRestockModal(false); setSelectedMedicine(null); }}
          onSave={() => { setShowRestockModal(false); setSelectedMedicine(null); loadMedicines(); }}
        />
      )}
    </div>
  );
}

function AddMedicineModal({ onClose, onSave, racks, suppliers }) {
  const [form, setForm] = useState({
    name: '', generic_name: '', category: '', manufacturer: '',
    rack_id: '', pack_size: '', reorder_level: '10', tax_rate: '0', barcode: '',
    purchase_input_mode: 'unit',
    purchase_rate_per_unit: '', selling_rate_per_unit: '',
    pack_purchase_amount: '', pack_selling_amount: '',
    quantity_received: '', batch_no: '', expiry_date: '', supplier_id: ''
  });
  const [saving, setSaving] = useState(false);

  const updateField = (field, value) => {
    const updated = { ...form, [field]: value };
    if (field === 'purchase_input_mode' && value === 'pack') {
    }
    if ((field === 'pack_purchase_amount' || field === 'pack_size') && form.purchase_input_mode === 'pack' && updated.pack_size && updated.pack_purchase_amount) {
      updated.purchase_rate_per_unit = (parseFloat(updated.pack_purchase_amount) / parseInt(updated.pack_size)).toFixed(2);
    }
    if (field === 'pack_selling_amount' && updated.pack_size && updated.pack_selling_amount) {
      updated.selling_rate_per_unit = (parseFloat(updated.pack_selling_amount) / parseInt(updated.pack_size)).toFixed(2);
    }
    setForm(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.purchase_rate_per_unit || !form.selling_rate_per_unit || !form.quantity_received) {
      alert('Purchase rate, selling rate, and quantity received are required');
      return;
    }
    setSaving(true);
    try {
      const medPayload = {
        name: form.name,
        generic_name: form.generic_name || null,
        category: form.category || null,
        manufacturer: form.manufacturer || null,
        rack_id: form.rack_id || null,
        pack_size: form.pack_size ? parseInt(form.pack_size) : null,
        reorder_level: parseInt(form.reorder_level) || 10,
        tax_rate: parseFloat(form.tax_rate) || 0,
        barcode: form.barcode || null,
      };
      const med = await api.post('/medicines', medPayload);

      const stockPayload = {
        medicine_id: med.id,
        batch_no: form.batch_no || null,
        supplier_id: form.supplier_id || null,
        purchase_rate_per_unit: parseFloat(form.purchase_rate_per_unit),
        selling_rate_per_unit: parseFloat(form.selling_rate_per_unit),
        quantity_received: parseInt(form.quantity_received),
        expiry_date: form.expiry_date || null,
      };
      await api.post('/stock/restock', stockPayload);
      onSave();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Add New Medicine</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Medicine Name *</label>
              <input type="text" required value={form.name} onChange={e => updateField('name', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Paracetamol 500mg" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
              <input type="text" value={form.generic_name} onChange={e => updateField('generic_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={e => updateField('category', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Select...</option>
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Syrup">Syrup</option>
                <option value="Injection">Injection</option>
                <option value="Cream">Cream</option>
                <option value="Drops">Drops</option>
                <option value="Powder">Powder</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
              <input type="text" value={form.manufacturer} onChange={e => updateField('manufacturer', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rack</label>
              <select value={form.rack_id} onChange={e => updateField('rack_id', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Select...</option>
                {racks.map(r => <option key={r.id} value={r.id}>{r.rack_code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pack Size</label>
              <input type="number" value={form.pack_size} onChange={e => updateField('pack_size', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. 30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
              <input type="number" value={form.reorder_level} onChange={e => updateField('reorder_level', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
              <input type="number" step="0.01" value={form.tax_rate} onChange={e => updateField('tax_rate', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
              <input type="text" value={form.barcode} onChange={e => updateField('barcode', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-semibold text-gray-700 mb-3">Initial Stock & Pricing</h4>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Pricing Mode</label>
              <div className="flex space-x-4">
                <label className="flex items-center"><input type="radio" name="priceMode" value="unit" checked={form.purchase_input_mode === 'unit'} onChange={e => updateField('purchase_input_mode', e.target.value)} className="mr-2" /> Per Unit</label>
                <label className="flex items-center"><input type="radio" name="priceMode" value="pack" checked={form.purchase_input_mode === 'pack'} onChange={e => updateField('purchase_input_mode', e.target.value)} className="mr-2" /> Per Pack</label>
              </div>
            </div>

            {form.purchase_input_mode === 'pack' && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pack Size</label>
                  <input type="number" value={form.pack_size} onChange={e => updateField('pack_size', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pack Purchase (Rs.)</label>
                  <input type="number" step="0.01" value={form.pack_purchase_amount} onChange={e => updateField('pack_purchase_amount', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pack Selling (Rs.)</label>
                  <input type="number" step="0.01" value={form.pack_selling_amount} onChange={e => updateField('pack_selling_amount', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="col-span-3 flex space-x-4 text-xs text-gray-500">
                  <span>Buy/unit: Rs. {form.purchase_rate_per_unit || '0'}</span>
                  <span>Sell/unit: Rs. {form.selling_rate_per_unit || '0'}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Rate/Unit *</label>
                <input type="number" step="0.01" required value={form.purchase_rate_per_unit} onChange={e => updateField('purchase_rate_per_unit', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Rate/Unit *</label>
                <input type="number" step="0.01" required value={form.selling_rate_per_unit} onChange={e => updateField('selling_rate_per_unit', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Received *</label>
                <input type="number" required value={form.quantity_received} onChange={e => updateField('quantity_received', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch No</label>
                <input type="text" value={form.batch_no} onChange={e => updateField('batch_no', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input type="date" value={form.expiry_date} onChange={e => updateField('expiry_date', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                <select value={form.supplier_id} onChange={e => updateField('supplier_id', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">Select...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Add Medicine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RestockModal({ medicine, suppliers, onClose, onSave }) {
  const [form, setForm] = useState({
    medicine_id: medicine.id, batch_no: '', supplier_id: '',
    purchase_input_mode: 'unit', pack_size: medicine.pack_size || '',
    pack_purchase_amount: '', purchase_rate_per_unit: '',
    pack_selling_amount: '', selling_rate_per_unit: '',
    quantity_received: '', expiry_date: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        medicine_id: form.medicine_id,
        batch_no: form.batch_no || null,
        supplier_id: form.supplier_id || null,
        purchase_rate_per_unit: parseFloat(form.purchase_rate_per_unit),
        selling_rate_per_unit: parseFloat(form.selling_rate_per_unit),
        quantity_received: parseInt(form.quantity_received),
        expiry_date: form.expiry_date || null,
      };
      await api.post('/stock/restock', payload);
      onSave();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    const updated = { ...form, [field]: value };

    if (field === 'pack_purchase_amount' || field === 'pack_size') {
      if (updated.purchase_input_mode === 'pack' && updated.pack_size && updated.pack_purchase_amount) {
        updated.purchase_rate_per_unit = (parseFloat(updated.pack_purchase_amount) / parseInt(updated.pack_size)).toFixed(2);
      }
    }
    if (field === 'pack_selling_amount' && updated.pack_size && updated.pack_selling_amount) {
      updated.selling_rate_per_unit = (parseFloat(updated.pack_selling_amount) / parseInt(updated.pack_size)).toFixed(2);
    }

    setForm(updated);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Restock: {medicine.name}</h3>
        <p className="text-sm text-gray-500 mb-4">Current stock: {medicine.total_stock} units</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pricing Mode</label>
            <div className="flex space-x-4">
              <label className="flex items-center"><input type="radio" name="mode" value="unit" checked={form.purchase_input_mode === 'unit'} onChange={e => updateField('purchase_input_mode', e.target.value)} className="mr-2" /> Per Unit</label>
              <label className="flex items-center"><input type="radio" name="mode" value="pack" checked={form.purchase_input_mode === 'pack'} onChange={e => updateField('purchase_input_mode', e.target.value)} className="mr-2" /> Per Pack</label>
            </div>
          </div>

          {form.purchase_input_mode === 'pack' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pack Size</label>
                <input type="number" value={form.pack_size} onChange={e => updateField('pack_size', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pack Purchase (Rs.)</label>
                <input type="number" step="0.01" value={form.pack_purchase_amount} onChange={e => updateField('pack_purchase_amount', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pack Selling (Rs.)</label>
                <input type="number" step="0.01" value={form.pack_selling_amount} onChange={e => updateField('pack_selling_amount', e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="flex items-end">
                <p className="text-xs text-gray-500">Buy: Rs.{form.purchase_rate_per_unit || '-'} | Sell: Rs.{form.selling_rate_per_unit || '-'}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Rate/Unit *</label>
              <input type="number" step="0.01" required value={form.purchase_rate_per_unit} onChange={e => updateField('purchase_rate_per_unit', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Rate/Unit *</label>
              <input type="number" step="0.01" required value={form.selling_rate_per_unit} onChange={e => updateField('selling_rate_per_unit', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Received *</label>
              <input type="number" required value={form.quantity_received} onChange={e => updateField('quantity_received', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch No</label>
              <input type="text" value={form.batch_no} onChange={e => updateField('batch_no', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={e => updateField('expiry_date', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select value={form.supplier_id} onChange={e => updateField('supplier_id', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Select...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Restock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
