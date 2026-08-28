const db = require('../db');
const { logAudit } = require('../middleware');

async function createSale(req, res) {
  const { items, discount_type, discount_value, tax_amount, payment_method, customer_id } = req.body;
  const cashier_id = req.user.id;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Sale must have at least one item' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const bill_number = await db.getNextSaleBill();
    let subtotal = 0;
    let totalProfit = 0;
    const saleItems = [];

    for (const item of items) {
      const { medicine_id, quantity } = item;

      const [medicines] = await conn.query('SELECT * FROM medicines WHERE id = ?', [medicine_id]);
      if (medicines.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: `Medicine ${medicine_id} not found` });
      }
      const medicine = medicines[0];

      const [batches] = await conn.query(
        `SELECT * FROM stock_batches WHERE medicine_id = ? AND quantity_in_stock > 0
         ORDER BY expiry_date ASC LIMIT 50`,
        [medicine_id]
      );
      const totalAvailable = batches.reduce((sum, b) => sum + b.quantity_in_stock, 0);
      if (totalAvailable < quantity) {
        await conn.rollback();
        return res.status(409).json({ error: `Insufficient stock for ${medicine.name}. Available: ${totalAvailable}` });
      }

      let remaining = quantity;
      let lineTotal = 0;
      let lineProfit = 0;
      let primaryBatchId = null;

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity_in_stock);
        if (!primaryBatchId) primaryBatchId = batch.id;

        const lineItemTotal = deduct * batch.selling_rate_per_unit;
        const lineItemProfit = (batch.selling_rate_per_unit - batch.purchase_rate_per_unit) * deduct;
        lineTotal += lineItemTotal;
        lineProfit += lineItemProfit;

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

        remaining -= deduct;
      }

      subtotal += lineTotal;
      totalProfit += lineProfit;

      saleItems.push({
        medicine_id,
        batch_id: primaryBatchId,
        quantity,
        purchase_rate_per_unit: batches[0].purchase_rate_per_unit,
        selling_rate_per_unit: batches[0].selling_rate_per_unit,
        line_total: lineTotal,
        line_profit: lineProfit,
      });
    }

    let discountAmount = 0;
    if (discount_type === 'PERCENTAGE' && discount_value > 0) {
      discountAmount = subtotal * (discount_value / 100);
    } else if (discount_type === 'FIXED' && discount_value > 0) {
      discountAmount = parseFloat(discount_value);
    }

    const taxAmt = tax_amount || 0;
    const finalAmount = Math.max(0, subtotal - discountAmount + taxAmt);

    const saleResult = await conn.run(
      `INSERT INTO sales (bill_number, subtotal, discount_type, discount_value, discount_amount, tax_amount, final_amount, payment_method, customer_id, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bill_number, subtotal, discount_type || null, discount_value || 0, discountAmount, taxAmt, finalAmount, payment_method || 'CASH', customer_id || null, cashier_id]
    );
    const saleId = saleResult.insertId;

    for (const si of saleItems) {
      await conn.run(
        `INSERT INTO sale_items (sale_id, medicine_id, batch_id, quantity, purchase_rate_per_unit, selling_rate_per_unit, line_total, line_profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, si.medicine_id, si.batch_id, si.quantity, si.purchase_rate_per_unit, si.selling_rate_per_unit, si.line_total, si.line_profit]
      );
    }

    await conn.commit();
    await logAudit(cashier_id, 'SALE_CREATED', 'sales', saleId, { bill_number, final_amount: finalAmount });

    res.status(201).json({
      id: saleId,
      bill_number,
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmt,
      final_amount: finalAmount,
      total_profit: totalProfit,
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
      `SELECT s.*, u.full_name as cashier_name FROM sales s
       JOIN users u ON s.cashier_id = u.id WHERE s.id = ?`,
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
      `SELECT s.*, u.full_name as cashier_name FROM sales s
       JOIN users u ON s.cashier_id = u.id WHERE s.bill_number = ?`,
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
    const { start_date, end_date, cashier_id, limit = 100, offset = 0 } = req.query;
    let sql = `
      SELECT s.*, u.full_name as cashier_name FROM sales s
      JOIN users u ON s.cashier_id = u.id WHERE 1=1
    `;
    const params = [];

    if (start_date) { sql += ' AND DATE(s.created_at) >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND DATE(s.created_at) <= ?'; params.push(end_date); }
    if (cashier_id) { sql += ' AND s.cashier_id = ?'; params.push(cashier_id); }

    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [sales] = await db.query(sql, params);
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function processReturn(req, res) {
  const { original_sale_id, sale_item_id, quantity_returned, reason } = req.body;
  const processed_by = req.user.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [saleItems] = await conn.query('SELECT * FROM sale_items WHERE id = ?', [sale_item_id]);
    if (saleItems.length === 0) { await conn.rollback(); return res.status(404).json({ error: 'Sale item not found' }); }

    const si = saleItems[0];
    if (quantity_returned > si.quantity) {
      await conn.rollback();
      return res.status(400).json({ error: 'Return quantity exceeds sold quantity' });
    }

    const refundAmount = quantity_returned * si.selling_rate_per_unit;

    await conn.run(
      `INSERT INTO returns (original_sale_id, sale_item_id, quantity_returned, refund_amount, reason, processed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [original_sale_id, sale_item_id, quantity_returned, refundAmount, reason || null, processed_by]
    );

    await conn.run(
      'UPDATE stock_batches SET quantity_in_stock = quantity_in_stock + ? WHERE id = ?',
      [quantity_returned, si.batch_id]
    );

    const [beforeRow] = await conn.query('SELECT quantity_in_stock FROM stock_batches WHERE id = ?', [si.batch_id]);
    await conn.run(
      `INSERT INTO stock_transactions (medicine_id, batch_id, transaction_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES (?, ?, 'RETURN', ?, ?, ?, ?, ?)`,
      [si.medicine_id, si.batch_id, quantity_returned, beforeRow[0].quantity_in_stock - quantity_returned, beforeRow[0].quantity_in_stock, processed_by, reason || 'Customer return']
    );

    await conn.commit();
    await logAudit(processed_by, 'RETURN_PROCESSED', 'returns', original_sale_id, { refund_amount: refundAmount });
    res.status(201).json({ message: 'Return processed', refund_amount: refundAmount });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

module.exports = { createSale, getSale, getSaleByBillNumber, listSales, processReturn };
