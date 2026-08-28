import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../utils/api';

export default function Billing({ onNavigate }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [discountType, setDiscountType] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [processing, setProcessing] = useState(false);
  const [billPreview, setBillPreview] = useState(null);
  const [settings, setSettings] = useState({});
  const [pendingMedicine, setPendingMedicine] = useState(null);
  const [quantityInput, setQuantityInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [billLookupOpen, setBillLookupOpen] = useState(false);
  const [billLookupTerm, setBillLookupTerm] = useState('');
  const [billLookupResult, setBillLookupResult] = useState(null);
  const [billLookupError, setBillLookupError] = useState('');
  const [recentBills, setRecentBills] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const searchRef = useRef(null);
  const quantityRef = useRef(null);
  const billLookupRef = useRef(null);

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (cart.length > 0) {
          handleSubmitSaleAndPrint();
        } else if (billPreview) {
          handlePrint();
        }
      }
      if (e.key === 'F2') {
        e.preventDefault();
        openBillLookup();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [billPreview, cart, processing]);

  const openBillLookup = async () => {
    setBillLookupOpen(true);
    setBillLookupTerm('');
    setBillLookupResult(null);
    setBillLookupError('');
    setLoadingRecent(true);
    try {
      const res = await api.get('/sales?limit=20&offset=0');
      setRecentBills(res);
    } catch {
      setRecentBills([]);
    } finally {
      setLoadingRecent(false);
    }
    setTimeout(() => billLookupRef.current?.focus(), 50);
  };

  const closeBillLookup = () => {
    setBillLookupOpen(false);
    setBillLookupResult(null);
    setBillLookupError('');
    setBillLookupTerm('');
  };

  const handleBillLookup = async (e) => {
    if (e.key === 'Escape') { closeBillLookup(); return; }
    if (e.key !== 'Enter') return;
    const term = billLookupTerm.trim();
    if (!term) return;
    setBillLookupError('');
    setBillLookupResult(null);
    try {
      const res = await api.get(`/sales/bill/${encodeURIComponent(term)}`);
      setBillLookupResult(res);
    } catch {
      setBillLookupError('Bill not found');
    }
  };

  const fmt = (n) => {
    const s = parseFloat(n || 0).toFixed(2);
    return s.replace(/\.00$/, '');
  };

  const printBillFromData = (saleData) => {
    const printContent = `
      <html><head><title>Bill ${saleData.bill_number}</title>
      <style>
        body { font-family: monospace; max-width: 300px; margin: 0 auto; padding: 10px; }
        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; }
      </style></head><body>
        <div class="center"><h3>${settings.shop_name || 'Medical Store'}</h3>
        <p>${settings.shop_address || ''}<br/>${settings.shop_phone || ''}</p></div>
        <div class="line"></div>
        <p>Bill #: ${saleData.bill_number}<br/>
        ${new Date(saleData.created_at).toLocaleString()}</p>
        <div class="line"></div>
        ${(saleData.items || []).map(item => `<div class="row"><span>${item.medicine_name || item.medicine_id}</span><span>${item.quantity} x ${fmt(item.selling_rate_per_unit)}</span><span>${fmt(item.line_total)}</span></div>`).join('')}
        <div class="line"></div>
        <div class="row"><span>Subtotal:</span><span>${fmt(saleData.subtotal)}</span></div>
        ${saleData.discount_amount > 0 ? `<div class="row"><span>Discount:</span><span>-${fmt(saleData.discount_amount)}</span></div>` : ''}
        <div class="row"><strong>TOTAL:</strong><strong>Rs. ${fmt(saleData.final_amount)}</strong></div>
        <div class="line"></div>
        <div class="center"><p>Payment: ${saleData.payment_method}</p>
        <p>Cashier: ${saleData.cashier_name || ''}</p>
        <p>Thank you! Visit Again</p></div>
      </body></html>
    `;
    const win = window.open('', '_blank', 'width=400,height=600');
    win.document.write(printContent);
    win.document.close();
    win.print();
  };

  const search = useCallback(async (term) => {
    setSearchTerm(term);
    setSelectedIndex(-1);
    if (term.length < 2) { setSearchResults([]); return; }
    try {
      const res = await api.get(`/medicines?search=${encodeURIComponent(term)}`);
      setSearchResults(res.filter(m => m.total_stock > 0));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const selectMedicine = (medicine) => {
    setPendingMedicine(medicine);
    setQuantityInput('1');
    setSearchResults([]);
    setSearchTerm('');
    setSelectedIndex(-1);
    setTimeout(() => quantityRef.current?.focus(), 50);
  };

  const handleSearchKeyDown = (e) => {
    if (searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectMedicine(searchResults[selectedIndex]);
    } else if (e.key === 'Enter' && selectedIndex === -1 && searchResults.length > 0) {
      e.preventDefault();
      selectMedicine(searchResults[0]);
    } else if (e.key === 'Escape') {
      setSearchResults([]);
      setSelectedIndex(-1);
    }
  };

  const handleQuantityKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const qty = parseInt(quantityInput);
      if (!qty || qty <= 0) {
        alert('Please enter a valid quantity');
        return;
      }
      if (pendingMedicine && qty > pendingMedicine.total_stock) {
        alert(`Only ${pendingMedicine.total_stock} units available`);
        return;
      }
      const medicine = pendingMedicine;
      const existing = cart.find(item => item.medicine_id === medicine.id);
      if (existing) {
        const newQty = existing.quantity + qty;
        if (newQty > medicine.total_stock) {
          alert(`Cannot add more than available stock. Current: ${existing.quantity}, Added: ${qty}, Available: ${medicine.total_stock}`);
          return;
        }
        setCart(cart.map(item => item.medicine_id === medicine.id ? { ...item, quantity: newQty } : item));
      } else {
        setCart([...cart, {
          medicine_id: medicine.id,
          name: medicine.name,
          quantity: qty,
          selling_rate_per_unit: medicine.selling_rate_per_unit || 0,
          stock: medicine.total_stock,
        }]);
      }
      setPendingMedicine(null);
      setQuantityInput('');
      setSearchResults([]);
      setSearchTerm('');
      setTimeout(() => searchRef.current?.focus(), 50);
    } else if (e.key === 'Escape') {
      setPendingMedicine(null);
      setQuantityInput('');
      setSearchTerm('');
      setSearchResults([]);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  };

  const addToCart = (medicine) => {
    selectMedicine(medicine);
  };

  const updateQuantity = (medicineId, qty) => {
    if (qty <= 0) {
      setCart(cart.filter(item => item.medicine_id !== medicineId));
    } else {
      setCart(cart.map(item => item.medicine_id === medicineId ? { ...item, quantity: qty } : item));
    }
  };

  const removeFromCart = (medicineId) => {
    setCart(cart.filter(item => item.medicine_id !== medicineId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.selling_rate_per_unit, 0);
  let discountAmount = 0;
  if (discountType === 'PERCENTAGE' && discountValue > 0) {
    discountAmount = subtotal * (discountValue / 100);
  } else if (discountType === 'FIXED' && discountValue > 0) {
    discountAmount = parseFloat(discountValue);
  }
  const finalAmount = Math.max(0, subtotal - discountAmount);

  const handleSubmitSale = async () => {
    if (cart.length === 0) return alert('Cart is empty');

    const discountCap = parseFloat(settings.cashier_discount_cap_percent || 5);
    if (discountType === 'PERCENTAGE' && parseFloat(discountValue) > discountCap) {
      return alert(`Discount exceeds your ${discountCap}% cap. Admin approval required.`);
    }

    setProcessing(true);
    try {
      const res = await api.post('/sales', {
        items: cart.map(item => ({ medicine_id: item.medicine_id, quantity: item.quantity })),
        discount_type: discountType || null,
        discount_value: discountValue ? parseFloat(discountValue) : 0,
        tax_amount: 0,
        payment_method: paymentMethod,
      });
      setBillPreview(res);
      setCart([]);
      setDiscountType('');
      setDiscountValue('');
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitSaleAndPrint = async () => {
    if (cart.length === 0) return alert('Cart is empty');

    const discountCap = parseFloat(settings.cashier_discount_cap_percent || 5);
    if (discountType === 'PERCENTAGE' && parseFloat(discountValue) > discountCap) {
      return alert(`Discount exceeds your ${discountCap}% cap. Admin approval required.`);
    }

    setProcessing(true);
    try {
      const res = await api.post('/sales', {
        items: cart.map(item => ({ medicine_id: item.medicine_id, quantity: item.quantity })),
        discount_type: discountType || null,
        discount_value: discountValue ? parseFloat(discountValue) : 0,
        tax_amount: 0,
        payment_method: paymentMethod,
      });
      setBillPreview(res);
      setCart([]);
      setDiscountType('');
      setDiscountValue('');
      setTimeout(() => printBillFromData(res), 100);
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handlePrint = () => {
    if (!billPreview) return;
    printBillFromData(billPreview);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Billing</h2>
        <button onClick={openBillLookup} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          Find Bill (F2)
        </button>
      </div>

      {billLookupOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Find Bill</h3>
              <button onClick={closeBillLookup} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-4 border-b">
              <input
                ref={billLookupRef}
                type="text"
                placeholder="Enter bill number (e.g. 20260828-0001)"
                value={billLookupTerm}
                onChange={e => { setBillLookupTerm(e.target.value); setBillLookupError(''); setBillLookupResult(null); }}
                onKeyDown={handleBillLookup}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
              {billLookupError && <p className="text-red-500 text-sm mt-2">{billLookupError}</p>}
            </div>

            {billLookupResult ? (
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-lg">#{billLookupResult.bill_number}</h4>
                    <span className="text-green-600 font-semibold text-lg">Rs. {billLookupResult.final_amount?.toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-gray-600">Date: {new Date(billLookupResult.created_at).toLocaleString()}</p>
                  <p className="text-sm text-gray-600">Cashier: {billLookupResult.cashier_name}</p>
                  <p className="text-sm text-gray-600">Payment: {billLookupResult.payment_method}</p>
                  {(billLookupResult.items || []).length > 0 && (
                    <table className="w-full mt-3 text-sm border-t pt-3">
                      <thead>
                        <tr className="text-left text-gray-600">
                          <th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billLookupResult.items.map((item, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1">{item.medicine_name || item.medicine_id}</td>
                            <td className="text-right">{item.quantity}</td>
                            <td className="text-right">Rs.{item.selling_rate_per_unit?.toFixed(2)}</td>
                            <td className="text-right">Rs.{item.line_total?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {billLookupResult.discount_amount > 0 && (
                    <p className="text-sm text-red-600 mt-1">Discount: -Rs.{billLookupResult.discount_amount?.toFixed(2)}</p>
                  )}
                  <button
                    onClick={() => printBillFromData(billLookupResult)}
                    className="mt-3 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Print Bill
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 flex-1 overflow-y-auto">
                <h4 className="text-sm font-medium text-gray-600 mb-2">Recent Bills</h4>
                {loadingRecent ? (
                  <p className="text-gray-500 text-sm">Loading...</p>
                ) : recentBills.length === 0 ? (
                  <p className="text-gray-500 text-sm">No recent bills</p>
                ) : (
                  <div className="space-y-2">
                    {recentBills.map(bill => (
                      <button
                        key={bill.id}
                        onClick={async () => {
                          try {
                            const res = await api.get(`/sales/${bill.id}`);
                            setBillLookupResult(res);
                          } catch {
                            setBillLookupError('Could not load bill details');
                          }
                        }}
                        className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 rounded-lg border transition-colors"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-sm">#{bill.bill_number}</p>
                            <p className="text-xs text-gray-500">{new Date(bill.created_at).toLocaleString()}</p>
                            <p className="text-xs text-gray-500">{bill.cashier_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">Rs. {bill.final_amount?.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">{bill.payment_method}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="relative">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search medicine by name..."
                value={searchTerm}
                onChange={e => search(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-lg"
                autoFocus
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((med, idx) => (
                    <button
                      key={med.id}
                      onClick={() => addToCart(med)}
                      className={`w-full text-left px-4 py-3 border-b last:border-0 flex justify-between items-center ${idx === selectedIndex ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
                    >
                      <div>
                        <span className="font-medium">{med.name}</span>
                        {med.rack_code && <span className="text-xs text-gray-500 ml-2">Rack: {med.rack_code}</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-green-600 font-medium">Stock: {med.total_stock}</span>
                        <span className="text-gray-500 text-sm ml-2">@ Rs.{med.selling_rate_per_unit || '?'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {pendingMedicine && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{pendingMedicine.name}</p>
                  <p className="text-xs text-gray-500">Stock: {pendingMedicine.total_stock} | Rate: Rs.{pendingMedicine.selling_rate_per_unit || '?'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">Qty:</label>
                  <input
                    ref={quantityRef}
                    type="number"
                    min="1"
                    max={pendingMedicine.total_stock}
                    value={quantityInput}
                    onChange={e => setQuantityInput(e.target.value)}
                    onKeyDown={handleQuantityKeyDown}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                    autoFocus
                  />
                  <span className="text-xs text-gray-500">Enter</span>
                  <button
                    onClick={() => { setPendingMedicine(null); setQuantityInput(''); setSearchResults([]); setSearchTerm(''); searchRef.current?.focus(); }}
                    className="text-gray-400 hover:text-gray-600 text-lg px-1"
                  >×</button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">Cart ({cart.length} items)</h3>
            </div>
            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Search and add medicines to begin</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Item</th>
                    <th className="text-center p-3 font-medium text-gray-600">Qty</th>
                    <th className="text-right p-3 font-medium text-gray-600">Rate</th>
                    <th className="text-right p-3 font-medium text-gray-600">Total</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.medicine_id} className="border-t">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateQuantity(item.medicine_id, parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-3 text-right">Rs. {item.selling_rate_per_unit.toFixed(2)}</td>
                      <td className="p-3 text-right font-medium">Rs. {(item.quantity * item.selling_rate_per_unit).toFixed(2)}</td>
                      <td className="p-3">
                        <button onClick={() => removeFromCart(item.medicine_id)} className="text-red-500 hover:text-red-700 text-lg">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Bill Summary</h3>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">Rs. {subtotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Discount</label>
                <div className="flex space-x-2">
                  <select value={discountType} onChange={e => setDiscountType(e.target.value)} className="flex-1 px-2 py-1.5 border rounded text-sm">
                    <option value="">None</option>
                    <option value="PERCENTAGE">%</option>
                    <option value="FIXED">Rs.</option>
                  </select>
                  {discountType && (
                    <input type="number" step="0.5" min="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="w-20 px-2 py-1.5 border rounded text-sm" placeholder="0" />
                  )}
                </div>
                {discountAmount > 0 && (
                  <p className="text-xs text-red-600 mt-1">- Rs. {discountAmount.toFixed(2)}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-2 py-1.5 border rounded text-sm">
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL:</span>
                <span>Rs. {finalAmount.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handleSubmitSale}
              disabled={processing || cart.length === 0}
              className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-lg disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Complete Sale'}
            </button>
            <p className="text-center text-xs text-gray-400">Alt+S to submit</p>
          </div>

          {billPreview && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <h4 className="font-semibold text-green-800 mb-2">Sale Complete!</h4>
              <p className="text-sm text-green-700">Bill #: {billPreview.bill_number}</p>
              <p className="text-sm text-green-700">Amount: Rs. {billPreview.final_amount.toFixed(2)}</p>
              <p className="text-sm text-green-700">Profit: Rs. {billPreview.total_profit?.toFixed(2) || '0.00'}</p>
              <button onClick={handlePrint} className="mt-3 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
                Print Bill
              </button>
              <p className="text-center text-xs text-gray-400 mt-1">Alt+S to print</p>
              <button onClick={() => { setBillPreview(null); searchRef.current?.focus(); }} className="mt-2 w-full py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
