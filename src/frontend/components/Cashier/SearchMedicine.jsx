import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';

export default function SearchMedicine() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [racks, setRacks] = useState([]);

  useEffect(() => {
    api.get('/racks').then(setRacks).catch(() => {});
  }, []);

  const search = useCallback(async (term) => {
    setSearchTerm(term);
    if (term.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await api.get(`/medicines?search=${encodeURIComponent(term)}`);
      setResults(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-800">Medicine Search</h2>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <input
          type="text"
          placeholder="Search by name, generic name, or barcode..."
          value={searchTerm}
          onChange={e => search(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-lg"
          autoFocus
        />
      </div>

      {loading && <div className="text-center py-8 text-gray-500">Searching...</div>}

      {results.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 font-medium text-gray-600">Medicine</th>
                <th className="text-left p-4 font-medium text-gray-600">Category</th>
                <th className="text-left p-4 font-medium text-gray-600">Rack</th>
                <th className="text-right p-4 font-medium text-gray-600">Stock</th>
                <th className="text-right p-4 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map(med => (
                <tr key={med.id} className="border-t hover:bg-gray-50">
                  <td className="p-4">
                    <div className="font-medium text-gray-800">{med.name}</div>
                    {med.generic_name && <div className="text-xs text-gray-500">{med.generic_name}</div>}
                    {med.manufacturer && <div className="text-xs text-gray-400">{med.manufacturer}</div>}
                  </td>
                  <td className="p-4 text-gray-600">{med.category || '-'}</td>
                  <td className="p-4 text-gray-600">{med.rack_code || '-'}</td>
                  <td className="p-4 text-right">
                    <span className={`font-medium ${med.total_stock <= med.reorder_level ? 'text-red-600' : 'text-gray-800'}`}>
                      {med.total_stock}
                    </span>
                    {med.pack_size && med.total_stock > 0 && (
                      <div className="text-xs text-gray-400">
                        {Math.floor(med.total_stock / med.pack_size)} packs + {med.total_stock % med.pack_size} loose
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {med.total_stock <= 0 ? (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">Out of Stock</span>
                    ) : med.total_stock <= med.reorder_level ? (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">Low Stock</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">In Stock</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {searchTerm.length >= 2 && results.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">No medicines found matching "{searchTerm}"</div>
      )}
    </div>
  );
}
