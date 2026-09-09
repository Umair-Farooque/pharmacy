const db = require('../db');
const { logAudit } = require('../middleware');

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).trim();
  p = p.replace(/[\s\-\(\)\.]/g, '');
  if (p.startsWith('+92')) p = '0' + p.slice(3);
  else if (p.startsWith('92') && p.length === 12) p = '0' + p.slice(2);
  return p;
}

async function findOrCreateCustomer(conn, phone, name) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const [existing] = await conn.query('SELECT id FROM customers WHERE phone = ? AND is_active = 1', [normalizedPhone]);
  if (existing.length > 0) return existing[0].id;

  const [result] = await conn.query('INSERT INTO customers (name, phone) VALUES (?, ?)', [name ? name.trim() : 'Customer-' + normalizedPhone, normalizedPhone]);
  return result.insertId;
}

async function createSale(req, res) {
  const { items, discount_type, discount_value, tax_amount, payment_method, customer_id, customer_phone, customer_name } = req.body;
  const cashier_id = req.user.id;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Sale must have at least one item' });
  }

  if (discount_type && !['PERCENTAGE', 'FIXED'].includes(discount_type)) {
    return res.status(400).json({ error: 'discount_type must be PERCENTAGE or FIXED' });
  }
  if (discount_value !== undefined && discount_value !== null && discount_value < 0) {
    return res.status(400).json({ error: 'discount_value must be >= 0' });
  }
  if (discount_type === 'PERCENTAGE' && discount_value > 100) {
    return res.status(400).json({ error: 'Percentage discount cannot exceed 100' });
  }
  if (!['CASH', 'CARD', 'UPI', 'CREDIT'].includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment_method' });
  }
  if (tax_amount < 0) {
    return res.status(400).json({ error: 'tax_amount must be >= 0' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [cashierRow] = await conn.query('SELECT full_name FROM users WHERE id = ?', [cashier_id]);
    const cashier_name = cashierRow[0]?.full_name || '';

    let finalCustomerId = customer_id || null;
    let customerName = null;

    if (!finalCustomerId && customer_phone) {
      finalCustomerId = await findOrCreateCustomer(conn, customer_phone, customer_name);
    }

    if (finalCustomerId) {
      const [custRows] = await conn.query('SELECT name, is_active FROM customers WHERE id = ?', [finalCustomerId]);
      if (custRows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'Customer not found' });
      }
      if (!custRows[0].is_active) {
        await conn.rollback();
        return res.status(400).json({ error: 'Customer is inactive' });
      }
      customerName = custRows[0].name;
    }

    const bill_number = await db.getNextSaleBill();
    let subtotal = 0;
    let totalProfit = 0;
    const saleItems = [];

    for (const item of items) {
      const { medicine_id, quantity, service_charge } = item;
      const serviceChg = parseFloat(service_charge) || 0;

      const [medicines] = await conn.query('SELECT * FROM medicines WHERE id = ?', [medicine_id]);
      if (medicines.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: `Medicine ${medicine_id} not found` });
      }
      const medicine = medicines[0];
      const currentSellingPrice = parseFloat(medicine.current_selling_price) || 0;

      if (currentSellingPrice <= 0) {
        await conn.rollback();
        return res.status(400).json({ error: `Selling price not set for ${medicine.name}` });
      }

      const [batches] = await conn.query(
        `SELECT * FROM stock_batches WHERE medicine_id = ? AND quantity_in_stock > 0
         AND (expiry_date IS NULL OR expiry_date > CURDATE())
         ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC, expiry_date ASC, id ASC LIMIT 50`,
        [medicine_id]
      );
      const totalAvailable = batches.reduce((sum, b) => sum + b.quantity_in_stock, 0);
      if (totalAvailable < quantity) {
        await conn.rollback();
        return res.status(409).json({ error: `Insufficient stock for ${medicine.name}. Available: ${totalAvailable}` });
      }

      let remaining = quantity;
      let medicineLineTotal = 0;
      let medicineLineProfit = 0;

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity_in_stock);
        const lineItemTotal = deduct * currentSellingPrice;
        const lineItemProfit = (currentSellingPrice - batch.purchase_rate_per_unit) * deduct;
        medicineLineTotal += lineItemTotal;
        medicineLineProfit += lineItemProfit;

        await conn.run(
          'UPDATE stock_batches SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?',
          [deduct, batch.id]
        );

        const [beforeRow] = await conn.query('SELECT quantity_in_stock FROM stock_batches WHERE id = ?', [batch.id]);
        const afterQty = beforeRow[0].quantity_in_stock;

        await conn.run(
          `INSERT INTO stock_transactions (medicine_id, batch_id, transaction_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
           VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)`,
          [medicine_id, batch.id, -deduct, afterQty + deduct, afterQty, cashier_id, `Sale: ${bill_number}`]
        );

        saleItems.push({
          medicine_id,
          medicine_name: medicine.name,
          batch_id: batch.id,
          quantity: deduct,
          purchase_rate_per_unit: batch.purchase_rate_per_unit,
          selling_rate_per_unit: currentSellingPrice,
          line_total: lineItemTotal,
          line_profit: lineItemProfit,
          service_charge: 0,
        });

        remaining -= deduct;
      }

      subtotal += medicineLineTotal + serviceChg;
      totalProfit += medicineLineProfit;
      const lastSaleItem = saleItems.filter(si => si.medicine_id === medicine_id).pop();
      if (lastSaleItem) {
        lastSaleItem.service_charge = serviceChg;
      }
    }

    let discountAmount = 0;
    if (discount_type === 'PERCENTAGE' && discount_value > 0) {
      discountAmount = subtotal * (discount_value / 100);
      if (discountAmount > subtotal) {
        await conn.rollback();
        return res.status(400).json({ error: 'Discount amount cannot exceed subtotal' });
      }
    } else if (discount_type === 'FIXED' && discount_value > 0) {
      discountAmount = parseFloat(discount_value);
      if (discountAmount > subtotal) {
        await conn.rollback();
        return res.status(400).json({ error: 'Discount amount cannot exceed subtotal' });
      }
    }

    const taxAmt = tax_amount || 0;
    const finalAmount = Math.max(0, subtotal - discountAmount + taxAmt);

    const saleResult = await conn.run(
      `INSERT INTO sales (bill_number, subtotal, discount_type, discount_value, discount_amount, tax_amount, final_amount, payment_method, customer_id, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bill_number, subtotal, discount_type || null, discount_value || 0, discountAmount, taxAmt, finalAmount, payment_method || 'CASH', finalCustomerId, cashier_id]
    );
    const saleId = saleResult.insertId;

    for (const si of saleItems) {
      await conn.run(
        `INSERT INTO sale_items (sale_id, medicine_id, batch_id, quantity, purchase_rate_per_unit, selling_rate_per_unit, line_total, line_profit, service_charge)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, si.medicine_id, si.batch_id, si.quantity, si.purchase_rate_per_unit, si.selling_rate_per_unit, si.line_total, si.line_profit, si.service_charge]
      );
    }

    if (payment_method === 'CREDIT' && finalCustomerId) {
      const [balanceRows] = await conn.query(
        'SELECT COALESCE(SUM(amount), 0) as current_balance FROM customer_credit_transactions WHERE customer_id = ?',
        [finalCustomerId]
      );
      const currentBalance = parseFloat(balanceRows[0].current_balance) || 0;
      const newBalance = currentBalance + finalAmount;

      await conn.query(
        `INSERT INTO customer_credit_transactions (customer_id, sale_id, type, amount, balance_after, notes, processed_by)
         VALUES (?, ?, 'CREDIT_SALE', ?, ?, NULL, ?)`,
        [finalCustomerId, saleId, finalAmount, newBalance, cashier_id]
      );

      await conn.query('UPDATE customers SET credit_balance = ? WHERE id = ?', [newBalance, finalCustomerId]);
    }

    await conn.commit();
    await logAudit(cashier_id, 'SALE_CREATED', 'sales', saleId, { bill_number, final_amount: finalAmount, customer_id: customer_id || null, customer_name: customerName });

    res.status(201).json({
      id: saleId,
      bill_number,
      subtotal,
      discount_type: discount_type || null,
      discount_value: discount_value || 0,
      discount_amount: discountAmount,
      tax_amount: taxAmt,
      final_amount: finalAmount,
      total_profit: totalProfit,
      payment_method: payment_method || 'CASH',
      customer_id: finalCustomerId,
      customer_name: customerName,
      cashier_id,
      cashier_name,
      created_at: new Date().toISOString(),
      items: saleItems,

    });
  } catch (err) {
    await conn.rollback();
    console.error('[SALE] Create error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
}

async function getSale(req, res) {
  try {
    const [sales] = await db.query(
      `SELECT s.*, u.full_name as cashier_name, c.name as customer_name, c.phone as customer_phone
       FROM sales s
       JOIN users u ON s.cashier_id = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (sales.length === 0) return res.status(404).json({ error: 'Sale not found' });

    const [items] = await db.query(
      `SELECT si.*, m.name as medicine_name FROM sale_items si
       JOIN medicines m ON si.medicine_id = m.id WHERE si.sale_id = ?`,
      [req.params.id]
    );

    res.json({ ...sales[0], items });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getSaleByBillNumber(req, res) {
  try {
    const [sales] = await db.query(
      `SELECT s.*, u.full_name as cashier_name, c.name as customer_name, c.phone as customer_phone
       FROM sales s
       JOIN users u ON s.cashier_id = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.bill_number = ?`,
      [req.params.bill_number]
    );
    if (sales.length === 0) return res.status(404).json({ error: 'Sale not found' });

    const [items] = await db.query(
      `SELECT si.*, m.name as medicine_name FROM sale_items si
       JOIN medicines m ON si.medicine_id = m.id WHERE si.sale_id = ?`,
      [sales[0].id]
    );

    res.json({ ...sales[0], items });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function listSales(req, res) {
  try {
    const { start_date, end_date, cashier_id, customer_id, limit = 100, offset = 0 } = req.query;
    let sql = `
      SELECT s.*, u.full_name as cashier_name, c.name as customer_name, c.phone as customer_phone
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id WHERE 1=1
    `;
    const params = [];

    if (start_date) { sql += ' AND DATE(s.created_at) >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND DATE(s.created_at) <= ?'; params.push(end_date); }
    if (cashier_id) { sql += ' AND s.cashier_id = ?'; params.push(cashier_id); }
    if (customer_id) { sql += ' AND s.customer_id = ?'; params.push(customer_id); }

    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [sales] = await db.query(sql, params);
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function generateReturnReference() {
  const year = new Date().getFullYear();
  const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `RET-${year}${random}`;
}

async function processReturn(req, res) {
  const { original_sale_id, items } = req.body;
  const processed_by = req.user.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items specified for return' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verify original sale exists
    const [sales] = await conn.query('SELECT * FROM sales WHERE id = ?', [original_sale_id]);
    if (sales.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Sale not found' });
    }

    const returnReference = await generateReturnReference();
    let totalRefundAmount = 0;
    let totalCogsReversed = 0;
    const returnItemRecords = [];

    for (const returnItem of items) {
      const { sale_item_id, quantity_returned } = returnItem;

      if (!sale_item_id || !quantity_returned || quantity_returned <= 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'Invalid return item data' });
      }

      // Get sale item details
      const [saleItems] = await conn.query('SELECT * FROM sale_items WHERE id = ?', [sale_item_id]);
      if (saleItems.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Sale item not found' });
      }

      const si = saleItems[0];

      // Calculate already returned quantity
      const [previousReturns] = await conn.query(
        'SELECT COALESCE(SUM(quantity_returned), 0) as total_returned FROM returns WHERE sale_item_id = ?',
        [sale_item_id]
      );
      const alreadyReturned = previousReturns[0]?.total_returned || 0;
      const remainingReturnable = si.quantity - alreadyReturned;

      if (quantity_returned > remainingReturnable) {
        await conn.rollback();
        return res.status(400).json({
          error: `Return quantity exceeds remaining returnable quantity for item. Available: ${remainingReturnable}, Requested: ${quantity_returned}`
        });
      }

      // Calculate refund amount using original sale price
      const refundAmount = quantity_returned * si.selling_rate_per_unit;
      const cogsReversed = quantity_returned * si.purchase_rate_per_unit;

      totalRefundAmount += refundAmount;
      totalCogsReversed += cogsReversed;

      returnItemRecords.push({
        sale_item_id: si.id,
        medicine_id: si.medicine_id,
        batch_id: si.batch_id,
        quantity_returned,
        selling_rate_per_unit: si.selling_rate_per_unit,
        purchase_rate_per_unit: si.purchase_rate_per_unit,
        refund_amount: refundAmount,
        cogs_reversed: cogsReversed,
      });
    }

    // Create return record
    const [returnResult] = await conn.query(
      `INSERT INTO returns (return_reference, original_sale_id, sale_item_id, quantity_returned, refund_amount, cogs_reversed, reason, processed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        returnReference,
        original_sale_id,
        returnItemRecords[0].sale_item_id,
        returnItemRecords.reduce((sum, item) => sum + item.quantity_returned, 0),
        totalRefundAmount,
        totalCogsReversed,
        req.body.reason || null,
        processed_by
      ]
    );
    const returnId = returnResult.insertId;

    // Create return items and restore stock
    for (const item of returnItemRecords) {
      // Create return item record
      await conn.query(
        `INSERT INTO return_items (return_id, sale_item_id, medicine_id, batch_id, quantity_returned, selling_rate_per_unit, purchase_rate_per_unit, refund_amount, cogs_reversed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          returnId,
          item.sale_item_id,
          item.medicine_id,
          item.batch_id,
          item.quantity_returned,
          item.selling_rate_per_unit,
          item.purchase_rate_per_unit,
          item.refund_amount,
          item.cogs_reversed,
        ]
      );

      // Restore stock to original batch
      const [beforeRow] = await conn.query('SELECT quantity_in_stock FROM stock_batches WHERE id = ?', [item.batch_id]);
      const beforeQty = beforeRow[0]?.quantity_in_stock || 0;

      await conn.query(
        'UPDATE stock_batches SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?',
        [item.quantity_returned, item.batch_id]
      );

      // Create stock transaction
      await conn.query(
        `INSERT INTO stock_transactions (medicine_id, batch_id, transaction_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
         VALUES (?, ?, 'RETURN', ?, ?, ?, ?, ?)`,
        [
          item.medicine_id,
          item.batch_id,
          item.quantity_returned,
          beforeQty,
          beforeQty + item.quantity_returned,
          processed_by,
          `Return: ${returnReference}`
        ]
      );
    }

    if (sales[0].payment_method === 'CREDIT' && sales[0].customer_id) {
      const refundAmount = totalRefundAmount;
      const [balanceRows] = await conn.query(
        'SELECT COALESCE(SUM(amount), 0) as current_balance FROM customer_credit_transactions WHERE customer_id = ?',
        [sales[0].customer_id]
      );
      const currentBalance = parseFloat(balanceRows[0].current_balance) || 0;
      const newBalance = currentBalance - refundAmount;

      await conn.query(
        `INSERT INTO customer_credit_transactions (customer_id, sale_id, type, amount, balance_after, notes, processed_by)
         VALUES (?, ?, 'REVERSAL', ?, ?, ?, ?)`,
        [sales[0].customer_id, original_sale_id, -refundAmount, newBalance, req.body.reason || null, processed_by]
      );

      await conn.query('UPDATE customers SET credit_balance = ? WHERE id = ?', [newBalance, sales[0].customer_id]);
    }

    await conn.commit();

    // Log audit
    await logAudit(
      processed_by,
      'RETURN_PROCESSED',
      'returns',
      returnId,
      {
        return_reference: returnReference,
        original_sale_id,
        total_refund_amount: totalRefundAmount,
        total_cogs_reversed: totalCogsReversed,
        items: returnItemRecords.length,
      }
    );

    res.status(201).json({
      message: 'Return processed successfully',
      return_reference: returnReference,
      return_id: returnId,
      total_refund_amount: totalRefundAmount,
      total_cogs_reversed: totalCogsReversed,
      items_processed: returnItemRecords.length,
    });
  } catch (err) {
    await conn.rollback();
    console.error('[SALE] Return error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
}

async function getReturnableItems(req, res) {
  try {
    const { sale_id } = req.params;

    const [sales] = await db.query('SELECT * FROM sales WHERE id = ?', [sale_id]);
    if (sales.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const [saleItems] = await db.query(
      `SELECT si.*, m.name as medicine_name, sb.batch_no, sb.expiry_date
       FROM sale_items si
       JOIN medicines m ON si.medicine_id = m.id
       LEFT JOIN stock_batches sb ON si.batch_id = sb.id
       WHERE si.sale_id = ?`,
      [sale_id]
    );

    const returnableItems = await Promise.all(
      saleItems.map(async (si) => {
        const [previousReturns] = await db.query(
          'SELECT COALESCE(SUM(quantity_returned), 0) as total_returned FROM returns WHERE sale_item_id = ?',
          [si.id]
        );
        const alreadyReturned = previousReturns[0]?.total_returned || 0;
        const remainingReturnable = si.quantity - alreadyReturned;

        return {
          ...si,
          already_returned: alreadyReturned,
          remaining_returnable: remainingReturnable,
          is_returnable: remainingReturnable > 0,
        };
      })
    );

    res.json({
      sale: sales[0],
      items: returnableItems,
    });
  } catch (err) {
    console.error('[SALE] Get returnable items error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function searchSaleByBillNumber(req, res) {
  try {
    const { bill_number } = req.params;
    const [sales] = await db.query(
      `SELECT s.*, u.full_name as cashier_name FROM sales s
       JOIN users u ON s.cashier_id = u.id
       WHERE s.bill_number = ?`,
      [bill_number]
    );

    if (sales.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json(sales[0]);
  } catch (err) {
    console.error('[SALE] Search bill error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { createSale, getSale, getSaleByBillNumber, listSales, processReturn, getReturnableItems, searchSaleByBillNumber };
