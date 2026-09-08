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
  const [serviceCharge, setServiceCharge] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundBillNumber, setRefundBillNumber] = useState('');
  const [refundBill, setRefundBill] = useState(null);
  const [refundItems, setRefundItems] = useState({});
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundSuccess, setRefundSuccess] = useState(null);

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

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const printBillFromData = async (saleData) => {
    const aggregatedItems = {};
    for (const item of (saleData.items || [])) {
      const key = item.medicine_id;
      if (!aggregatedItems[key]) {
        aggregatedItems[key] = {
          medicine_name: item.medicine_name || item.medicine_id,
          quantity: 0,
          selling_rate_per_unit: parseFloat(item.selling_rate_per_unit || 0),
          line_total: 0,
          service_charge: 0,
        };
      }
      aggregatedItems[key].quantity += item.quantity;
      aggregatedItems[key].line_total += item.line_total;
      aggregatedItems[key].service_charge += item.service_charge || 0;
    }
    const printContent = `
      <html><head><title>Bill ${saleData.bill_number}</title>
      <style>
        body { font-family: 'Courier New', monospace; margin: 0; padding: 6px; font-size: 15px; font-weight: bold; color: #000; }
        .center { text-align: center; }
        .left { text-align: left; }
        .line { border-top: 2px solid #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
      </style></head><body>
        <div class="center"><h3 style="margin:0;font-size:20px;font-weight:bold;">${settings.shop_name || 'Medical Store'}</h3>
        <p style="margin:2px 0;font-size:14px;font-weight:bold;">${settings.shop_address || ''}</p>
        <p style="margin:2px 0;font-size:14px;font-weight:bold;">${settings.shop_phone || ''}${settings.shop_phone2 ? ' | ' + settings.shop_phone2 : ''}</p></div>
        <div class="line"></div>
        <p style="margin:2px 0;font-size:14px;font-weight:bold;">Bill #: ${saleData.bill_number}<br/>
        ${saleData.created_at ? formatDate(saleData.created_at) : 'N/A'}</p>
        <div class="line"></div>
        ${Object.values(aggregatedItems).map(item => {
          const serviceChg = parseFloat(item.service_charge || 0);
          const itemTotal = item.line_total + serviceChg;
          return `<div class="row"><span style="font-size:14px;font-weight:bold;">${item.medicine_name || 'Unknown'}</span><span style="font-size:14px;font-weight:bold;">${item.quantity} x ${fmt(item.selling_rate_per_unit)}</span><span style="font-size:14px;font-weight:bold;">${fmt(itemTotal)}</span></div>`;
        }).join('')}
        <div class="line"></div>
        <div class="row"><span style="font-size:14px;font-weight:bold;">Subtotal:</span><span style="font-size:14px;font-weight:bold;">${fmt(saleData.subtotal || 0)}</span></div>
        ${saleData.discount_amount > 0 ? `<div class="row"><span style="font-size:14px;font-weight:bold;">Discount:</span><span style="font-size:14px;font-weight:bold;">-${fmt(saleData.discount_amount || 0)}</span></div>` : ''}
        <div class="row"><strong style="font-size:16px;font-weight:bold;">TOTAL:</strong><strong style="font-size:16px;font-weight:bold;">Rs. ${fmt(saleData.final_amount || 0)}</strong></div>
        <div class="line"></div>
        <div class="left"><p style="font-size:14px;font-weight:bold;">Payment: ${saleData.payment_method || 'CASH'}</p>
        <p style="font-size:14px;font-weight:bold;">Medicines can be Returned within 7 days.</p>
        <p style="font-size:14px;font-weight:bold;">Thank you! Visit Again</p></div>
        <div class="line"></div>
        <div class="center"><p style="font-size:13px;font-weight:bold;">BunnySystems &nbsp;&nbsp; 030862629</p></div>
        <div class="line"></div>
      </body></html>
    `;

    if (window.electronAPI && window.electronAPI.printBill) {
      try {
        await window.electronAPI.printBill(
          printContent,
          settings.printer_name || null,
          settings.paper_size || '80mm'
        );
      } catch (err) {
        alert('Print failed: ' + err.message);
      }
    } else {
      const win = window.open('', '_blank', 'width=400,height=600');
      win.document.write(printContent);
      win.document.close();
      win.print();
    }
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
    if (medicine.category === 'Drip Bottle') {
      setServiceCharge('');
      setTimeout(() => document.getElementById('serviceChargeInput')?.focus(), 50);
    } else {
      setServiceCharge('');
      setTimeout(() => quantityRef.current?.focus(), 50);
    }
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
          selling_rate_per_unit: parseFloat(medicine.selling_rate_per_unit) || 0,
          stock: medicine.total_stock,
          service_charge: parseFloat(serviceCharge) || 0,
        }]);
      }
      setPendingMedicine(null);
      setQuantityInput('');
      setServiceCharge('');
      setSearchResults([]);
      setSearchTerm('');
      setTimeout(() => searchRef.current?.focus(), 50);
    } else if (e.key === 'Escape') {
      setPendingMedicine(null);
      setQuantityInput('');
      setServiceCharge('');
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

  const subtotal = cart.reduce((sum, item) => sum + (item.quantity * parseFloat(item.selling_rate_per_unit || 0)) + (parseFloat(item.service_charge || 0)), 0);
  const totalServiceCharges = cart.reduce((sum, item) => sum + (item.service_charge || 0), 0);
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
        items: cart.map(item => ({ medicine_id: item.medicine_id, quantity: item.quantity, service_charge: item.service_charge || 0 })),
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
        items: cart.map(item => ({ medicine_id: item.medicine_id, quantity: item.quantity, service_charge: item.service_charge || 0 })),
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

  const openRefundModal = () => {
    setRefundOpen(true);
    setRefundBillNumber('');
    setRefundBill(null);
    setRefundItems({});
    setRefundReason('');
    setRefundError('');
    setRefundSuccess(null);
    setTimeout(() => document.getElementById('refund-bill-input')?.focus(), 50);
  };

  const closeRefundModal = () => {
    setRefundOpen(false);
    setRefundBillNumber('');
    setRefundBill(null);
    setRefundItems({});
    setRefundReason('');
    setRefundError('');
    setRefundSuccess(null);
  };

  const searchRefundBill = async () => {
    if (!refundBillNumber.trim()) return;
    setRefundError('');
    setRefundBill(null);
    setRefundItems({});
    try {
      const res = await api.get(`/sales/${encodeURIComponent(refundBillNumber.trim())}/returnable-items`);
      setRefundBill(res.sale);
      // Initialize returnable items
      const items = {};
      (res.items || []).forEach(item => {
        if (item.is_returnable) {
          items[item.id] = { ...item, return_qty: 0 };
        }
      });
      setRefundItems(items);
    } catch (err) {
      setRefundError(err.message || 'Bill not found');
    }
  };

  const processRefund = async () => {
    if (!refundBill) return;
    
    const returnItems = Object.entries(refundItems)
      .filter(([_, item]) => item.return_qty > 0)
      .map(([sale_item_id, item]) => ({
        sale_item_id: parseInt(sale_item_id),
        quantity_returned: item.return_qty,
      }));

    if (returnItems.length === 0) {
      setRefundError('Please select at least one item to return');
      return;
    }

    setRefundLoading(true);
    setRefundError('');
    try {
      const res = await api.post('/sales/return', {
        original_sale_id: refundBill.id,
        items: returnItems,
        reason: refundReason || 'Customer return',
      });
      setRefundSuccess(res);
      setRefundItems({});
      setRefundReason('');
    } catch (err) {
      setRefundError(err.message || 'Failed to process return');
    } finally {
      setRefundLoading(false);
    }
  };

  const getRefundTotal = () => {
    return Object.entries(refundItems).reduce((total, [_, item]) => {
      return total + (item.return_qty * item.selling_rate_per_unit);
    }, 0);
  };

  const getReturnableItems = () => {
    if (!refundBill?.items) return [];
    return refundBill.items.filter(item => item.is_returnable);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Billing</h2>
        <div className="flex gap-2">
          <button onClick={openRefundModal} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
            Refund / Return
          </button>
          <button onClick={openBillLookup} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            Find Bill (F2)
          </button>
        </div>
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
                    <span className="text-green-600 font-semibold text-lg">Rs. {parseFloat(billLookupResult.final_amount || 0).toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-gray-600">Date: {formatDate(billLookupResult.created_at)}</p>
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
                            <td className="text-right">Rs.{parseFloat(item.selling_rate_per_unit || 0).toFixed(2)}</td>
                            <td className="text-right">Rs.{item.line_total?.toFixed ? item.line_total.toFixed(2) : parseFloat(item.line_total || 0)}</td>
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
                            <p className="text-xs text-gray-500">{formatDate(bill.created_at)}</p>
                            <p className="text-xs text-gray-500">{bill.cashier_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">Rs. {parseFloat(bill.final_amount || 0).toFixed(2)}</p>
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

      {refundOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Refund / Return</h3>
              <button onClick={closeRefundModal} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <div className="p-4 border-b">
              <div className="flex gap-2">
                <input
                  id="refund-bill-input"
                  type="text"
                  placeholder="Enter bill number (e.g. BL2026001234)"
                  value={refundBillNumber}
                  onChange={e => { setRefundBillNumber(e.target.value); setRefundError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') searchRefundBill(); }}
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  autoFocus
                />
                <button onClick={searchRefundBill} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                  Search
                </button>
              </div>
              {refundError && <p className="text-red-500 text-sm mt-2">{refundError}</p>}
            </div>

            {refundSuccess ? (
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <h4 className="font-semibold text-green-800 mb-2">Return Processed Successfully</h4>
                  <p className="text-sm text-green-700">Return Reference: {refundSuccess.return_reference}</p>
                  <p className="text-sm text-green-700">Total Refund: Rs. {parseFloat(refundSuccess.total_refund_amount || 0).toFixed(2)}</p>
                  <p className="text-sm text-green-700">Items Returned: {refundSuccess.items_processed}</p>
                  <button onClick={closeRefundModal} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                    Close
                  </button>
                </div>
              </div>
            ) : refundBill ? (
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-lg">#{refundBill.bill_number}</h4>
                    <span className="text-green-600 font-semibold text-lg">Rs. {parseFloat(refundBill.final_amount || 0).toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-gray-600">Date: {formatDate(refundBill.created_at)}</p>
                  <p className="text-sm text-gray-600">Cashier: {refundBill.cashier_name}</p>
                  <p className="text-sm text-gray-600">Payment: {refundBill.payment_method}</p>
                </div>

                <h4 className="font-semibold text-sm text-gray-700 mb-2">Select Items to Return</h4>
                <div className="space-y-2 mb-4">
                  {getReturnableItems().map(item => (
                    <div key={item.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium text-sm">{item.medicine_name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">Batch: {item.batch_no || 'N/A'} | Sold: {item.quantity} | Returned: {item.already_returned} | Returnable: {item.remaining_returnable}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">Rs. {parseFloat(item.selling_rate_per_unit || 0).toFixed(2)}</p>
                          <p className="text-xs text-gray-500">each</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600">Return Qty:</label>
                        <input
                          type="number"
                          min="0"
                          max={item.remaining_returnable}
                          value={refundItems[item.id]?.return_qty || 0}
                          onChange={e => {
                            const qty = parseInt(e.target.value) || 0;
                            if (qty >= 0 && qty <= item.remaining_returnable) {
                              setRefundItems(prev => ({
                                ...prev,
                                [item.id]: { ...item, return_qty: qty }
                              }));
                            }
                          }}
                          className="w-20 px-2 py-1 border rounded text-sm text-center"
                        />
                        <span className="text-xs text-gray-500">/ {item.remaining_returnable}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {getRefundTotal() > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-blue-800">Total Refund Amount:</span>
                      <span className="font-bold text-blue-900 text-lg">Rs. {getRefundTotal().toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
                  <input
                    type="text"
                    value={refundReason}
                    onChange={e => setRefundReason(e.target.value)}
                    placeholder="Reason for return..."
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <button
                  onClick={processRefund}
                  disabled={refundLoading || getRefundTotal() === 0}
                  className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm disabled:opacity-50"
                >
                  {refundLoading ? 'Processing...' : `Process Return (Rs. ${getRefundTotal().toFixed(2)})`}
                </button>
              </div>
            ) : (
              <div className="p-4 flex-1 overflow-y-auto">
                <p className="text-sm text-gray-500 text-center py-8">Search for a bill to process a return</p>
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
                  {pendingMedicine.category === 'Drip Bottle' && (
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-sm font-medium text-gray-600">Service Charges:</label>
                      <input
                        id="serviceChargeInput"
                        type="number"
                        min="0"
                        value={serviceCharge}
                        onChange={e => setServiceCharge(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') quantityRef.current?.focus(); }}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0"
                      />
                      <span className="text-xs text-gray-500">Rs.</span>
                    </div>
                  )}
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
                    onClick={() => { setPendingMedicine(null); setQuantityInput(''); setServiceCharge(''); setSearchResults([]); setSearchTerm(''); searchRef.current?.focus(); }}
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
                      <td className="p-3">
                        <span className="font-medium">{item.name}</span>
                        {item.service_charge > 0 && <span className="block text-xs text-green-600">+Service: Rs.{item.service_charge}</span>}
                      </td>
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateQuantity(item.medicine_id, parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-3 text-right">Rs. {parseFloat(item.selling_rate_per_unit || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-medium">Rs. {parseFloat((item.quantity * item.selling_rate_per_unit) + (item.service_charge || 0)).toFixed(2)}</td>
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
              <p className="text-sm text-green-700">Profit: Rs. {parseFloat(billPreview.total_profit || 0).toFixed(2) || '0.00'}</p>
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
