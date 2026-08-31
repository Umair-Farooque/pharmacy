import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';

export default function Inventory() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [medicineDetail, setMedicineDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
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

  const loadMedicineDetail = async (medicine) => {
    setSelectedMedicine(medicine);
    setDetailLoading(true);
    setShowDetailModal(true);
    try {
      const res = await api.get(`/medicines/${medicine.id}`);
      setMedicineDetail(res);
    } catch (err) {
      alert(err.message);
      setShowDetailModal(false);
    } finally {
      setDetailLoading(false);
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
                  <th className="text-right p-4 font-medium text-gray-600">Avg. Cost</th>
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
                        onClick={() => loadMedicineDetail(med)}
                        className="px-3 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100"
                      >
                        View
                      </button>
                      <button
                        onClick={() => { setSelectedMedicine(med); setShowEditModal(true); }}
                        className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                      >
                        Edit
                      </button>
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
          onRackCreated={() => { api.get('/racks').then(setRacks).catch(() => {}); }}
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

      {showEditModal && selectedMedicine && (
        <EditMedicineModal
          medicine={selectedMedicine}
          racks={racks}
          onClose={() => { setShowEditModal(false); setSelectedMedicine(null); }}
          onSave={() => { setShowEditModal(false); setSelectedMedicine(null); loadMedicines(); }}
        />
      )}

      {showDetailModal && selectedMedicine && (
        <MedicineDetailModal
          medicine={selectedMedicine}
          detail={medicineDetail}
          loading={detailLoading}
          onClose={() => { setShowDetailModal(false); setSelectedMedicine(null); setMedicineDetail(null); }}
          onRestock={() => { setShowDetailModal(false); setShowRestockModal(true); }}
        />
      )}
    </div>
  );
}

function AddMedicineModal({ onClose, onSave, racks, suppliers, onRackCreated }) {
  const [form, setForm] = useState({
    name: '', generic_name: '', category: '', newCategory: '', manufacturer: '',
    rack_id: '', newRack: '', pack_size: '', reorder_level: '10', tax_rate: '0', barcode: '',
    purchase_input_mode: 'unit',
    purchase_rate_per_unit: '', selling_rate_per_unit: '',
    pack_purchase_amount: '', pack_selling_amount: '',
    quantity_received: '', batch_no: '', expiry_date: '', supplier_id: ''
  });
  const [saving, setSaving] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewRack, setShowNewRack] = useState(false);
  const [currentRacks, setCurrentRacks] = useState(racks);

  useEffect(() => { setCurrentRacks(racks); }, [racks]);

  const defaultCategories = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Powder', 'Drip Bottle', 'Other'];

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
    if (!form.batch_no || String(form.batch_no).trim() === '') {
      alert('Batch number is required');
      return;
    }
    if (!form.expiry_date) {
      alert('Expiry date is required');
      return;
    }
    setSaving(true);
    try {
      let categoryValue = form.category;
      if (showNewCategory && form.newCategory.trim()) {
        categoryValue = form.newCategory.trim();
      }

      let rackIdValue = form.rack_id;
      if (showNewRack && form.newRack.trim()) {
        const rackRes = await api.post('/racks', { rack_code: form.newRack.trim(), description: '' });
        rackIdValue = rackRes.id;
        if (onRackCreated) onRackCreated();
      }

      const medPayload = {
        name: form.name,
        generic_name: form.generic_name || null,
        category: categoryValue || null,
        manufacturer: form.manufacturer || null,
        rack_id: rackIdValue || null,
        pack_size: form.pack_size ? parseInt(form.pack_size) : null,
        reorder_level: parseInt(form.reorder_level) || 10,
        tax_rate: parseFloat(form.tax_rate) || 0,
        barcode: form.barcode || null,
      };
      const med = await api.post('/medicines', medPayload);

      const stockPayload = {
        medicine_id: med.id,
        batch_no: String(form.batch_no).trim(),
        supplier_id: form.supplier_id || null,
        purchase_rate_per_unit: parseFloat(form.purchase_rate_per_unit),
        selling_rate_per_unit: parseFloat(form.selling_rate_per_unit),
        quantity_received: parseInt(form.quantity_received),
        expiry_date: form.expiry_date,
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
              {!showNewCategory ? (
                <div className="flex gap-2">
                  <select value={form.category} onChange={e => updateField('category', e.target.value)} className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Select...</option>
                    {defaultCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" onClick={() => { setShowNewCategory(true); updateField('newCategory', ''); }} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">+ New</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input type="text" value={form.newCategory} onChange={e => updateField('newCategory', e.target.value)} placeholder="New category name" className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                  <button type="button" onClick={() => { setShowNewCategory(false); updateField('category', ''); updateField('newCategory', ''); }} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
              <input type="text" value={form.manufacturer} onChange={e => updateField('manufacturer', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rack</label>
              {!showNewRack ? (
                <div className="flex gap-2">
                  <select value={form.rack_id} onChange={e => updateField('rack_id', e.target.value)} className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Select...</option>
                    {currentRacks.map(r => <option key={r.id} value={r.id}>{r.rack_code}</option>)}
                  </select>
                  <button type="button" onClick={() => { setShowNewRack(true); updateField('newRack', ''); }} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">+ New</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input type="text" value={form.newRack} onChange={e => updateField('newRack', e.target.value)} placeholder="e.g. A1, B2" className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                  <button type="button" onClick={() => { setShowNewRack(false); updateField('rack_id', ''); updateField('newRack', ''); }} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancel</button>
                </div>
              )}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch No *</label>
                <input type="text" required value={form.batch_no} onChange={e => updateField('batch_no', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date *</label>
                <input type="date" required value={form.expiry_date} onChange={e => updateField('expiry_date', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
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
    if (!form.purchase_rate_per_unit) {
      alert('Purchase rate is required');
      setSaving(false);
      return;
    }
    if (!form.quantity_received) {
      alert('Quantity received is required');
      setSaving(false);
      return;
    }
    if (!form.batch_no || String(form.batch_no).trim() === '') {
      alert('Batch number is required');
      setSaving(false);
      return;
    }
    if (!form.expiry_date) {
      alert('Expiry date is required');
      setSaving(false);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        medicine_id: form.medicine_id,
        batch_no: String(form.batch_no).trim(),
        supplier_id: form.supplier_id || null,
        purchase_rate_per_unit: parseFloat(form.purchase_rate_per_unit),
        selling_rate_per_unit: form.selling_rate_per_unit ? parseFloat(form.selling_rate_per_unit) : null,
        quantity_received: parseInt(form.quantity_received),
        expiry_date: form.expiry_date,
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
        <p className="text-sm text-gray-500 mb-4">Current stock: {medicine.total_stock} units | Current sell rate: Rs.{medicine.selling_rate_per_unit}</p>

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
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Rate/Unit (optional)</label>
              <input type="number" step="0.01" value={form.selling_rate_per_unit} onChange={e => updateField('selling_rate_per_unit', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Leave blank to keep current" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Received *</label>
              <input type="number" required value={form.quantity_received} onChange={e => updateField('quantity_received', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch No *</label>
              <input type="text" required value={form.batch_no} onChange={e => updateField('batch_no', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date *</label>
              <input type="date" required value={form.expiry_date} onChange={e => updateField('expiry_date', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
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

function EditMedicineModal({ medicine, racks, onClose, onSave }) {
  const [form, setForm] = useState({
    name: medicine.name || '',
    generic_name: medicine.generic_name || '',
    category: medicine.category || '',
    manufacturer: medicine.manufacturer || '',
    rack_id: medicine.rack_id || '',
    selling_rate_per_unit: medicine.selling_rate_per_unit || '',
  });
  const [saving, setSaving] = useState(false);
  const defaultCategories = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Powder', 'Drip Bottle', 'Other'];

  useEffect(() => {
    api.get(`/medicines/${medicine.id}`).then(data => {
      setForm({
        name: data.name || '',
        generic_name: data.generic_name || '',
        category: data.category || '',
        manufacturer: data.manufacturer || '',
        rack_id: data.rack_id || '',
        selling_rate_per_unit: data.current_selling_price || '',
      });
    }).catch(err => console.error('Failed to load medicine:', err));
  }, [medicine.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.selling_rate_per_unit) {
      alert('Name and selling rate are required');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/medicines/${medicine.id}`, {
        name: form.name,
        generic_name: form.generic_name || null,
        category: form.category || null,
        manufacturer: form.manufacturer || null,
        rack_id: form.rack_id || null,
      });
      await api.put(`/medicines/${medicine.id}/price`, {
        selling_rate_per_unit: parseFloat(form.selling_rate_per_unit),
      });
      onSave();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Edit: {medicine.name}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
            <input
              type="text"
              value={form.generic_name}
              onChange={e => setForm({ ...form, generic_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select...</option>
                {defaultCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rack</label>
              <select
                value={form.rack_id}
                onChange={e => setForm({ ...form, rack_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select...</option>
                {racks.map(r => <option key={r.id} value={r.id}>{r.rack_code} - {r.description}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
            <input
              type="text"
              value={form.manufacturer}
              onChange={e => setForm({ ...form, manufacturer: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Selling Rate (Rs.) *</label>
            <input
              type="number"
              step="0.01"
              value={form.selling_rate_per_unit}
              onChange={e => setForm({ ...form, selling_rate_per_unit: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MedicineDetailModal({ medicine, detail, loading, onClose, onRestock }) {
  const totalStock = detail?.batches?.reduce((sum, b) => sum + b.quantity_in_stock, 0) || 0;
  const totalValue = detail?.batches?.reduce((sum, b) => sum + (b.quantity_in_stock * b.purchase_rate_per_unit), 0) || 0;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getDaysUntilExpiry = (dateStr) => {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    const today = new Date();
    const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getExpiryClass = (dateStr) => {
    const days = getDaysUntilExpiry(dateStr);
    if (days === null) return 'text-gray-400';
    if (days <= 30) return 'text-red-600 font-medium';
    if (days <= 90) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{medicine.name}</h3>
            {medicine.generic_name && <p className="text-sm text-gray-500">{medicine.generic_name}</p>}
            {medicine.category && <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">{medicine.category}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : detail ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">Total Stock</p>
                <p className="text-xl font-bold text-gray-800">{totalStock}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Inventory Value</p>
                <p className="text-xl font-bold text-gray-800">Rs. {totalValue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Current Selling Price</p>
                <p className="text-xl font-bold text-green-600">Rs. {detail.current_selling_price || '0'}</p>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="font-semibold text-gray-700 mb-2">Batches ({detail.batches?.length || 0})</h4>
              {detail.batches && detail.batches.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-3 font-medium text-gray-600">Batch No</th>
                        <th className="text-right p-3 font-medium text-gray-600">Qty</th>
                        <th className="text-right p-3 font-medium text-gray-600">Pur. Rate</th>
                        <th className="text-right p-3 font-medium text-gray-600">Expiry</th>
                        <th className="text-right p-3 font-medium text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.batches.map((batch) => {
                        const days = getDaysUntilExpiry(batch.expiry_date);
                        return (
                          <tr key={batch.id} className="border-t">
                            <td className="p-3 font-mono text-sm">{batch.batch_no}</td>
                            <td className="p-3 text-right font-medium">{batch.quantity_in_stock}</td>
                            <td className="p-3 text-right">Rs. {batch.purchase_rate_per_unit}</td>
                            <td className="p-3 text-right">{formatDate(batch.expiry_date)}</td>
                            <td className="p-3 text-right">
                              {batch.quantity_in_stock === 0 ? (
                                <span className="text-xs text-gray-400">Empty</span>
                              ) : days === null ? (
                                <span className="text-xs text-gray-400">No expiry</span>
                              ) : days <= 0 ? (
                                <span className="text-xs text-red-600">Expired</span>
                              ) : days <= 30 ? (
                                <span className="text-xs text-red-600">{days}d left</span>
                              ) : days <= 90 ? (
                                <span className="text-xs text-yellow-600">{days}d left</span>
                              ) : (
                                <span className="text-xs text-green-600">{days}d left</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No batches found</p>
              )}
            </div>

            {detail.transactions && detail.transactions.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Recent Transactions</h4>
                <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium text-gray-600">Date</th>
                        <th className="text-left p-2 font-medium text-gray-600">Type</th>
                        <th className="text-right p-2 font-medium text-gray-600">Qty</th>
                        <th className="text-right p-2 font-medium text-gray-600">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.transactions.map((tx) => (
                        <tr key={tx.id} className="border-t">
                          <td className="p-2">{new Date(tx.created_at).toLocaleDateString()}</td>
                          <td className="p-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              tx.transaction_type === 'PURCHASE' ? 'bg-green-100 text-green-700' :
                              tx.transaction_type === 'SALE' ? 'bg-blue-100 text-blue-700' :
                              tx.transaction_type === 'RETURN' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>{tx.transaction_type}</span>
                          </td>
                          <td className="p-2 text-right">{tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}</td>
                          <td className="p-2 text-right">{tx.quantity_after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">No data available</div>
        )}

        <div className="flex justify-end space-x-3 pt-4 mt-4 border-t">
          <button onClick={onRestock} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            Restock
          </button>
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
