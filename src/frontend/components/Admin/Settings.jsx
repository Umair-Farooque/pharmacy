import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [printers, setPrinters] = useState([]);

  const [backupStatus, setBackupStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [backupSuccess, setBackupSuccess] = useState('');
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreFilename, setRestoreFilename] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [customBackupDir, setCustomBackupDir] = useState('');
  const [sqlFilePath, setSqlFilePath] = useState('');

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(console.error).finally(() => setLoading(false));
    if (window.electronAPI && window.electronAPI.getPrinters) {
      window.electronAPI.getPrinters().then(setPrinters).catch(() => {});
    }
    loadBackupStatus();
  }, []);

  const loadBackupStatus = async () => {
    try {
      const status = await api.get('/backup/status');
      setBackupStatus(status);
      if (status?.backup_dir) setCustomBackupDir(status.backup_dir);
    } catch (err) {
      console.error('Backup status error:', err);
    }
    try {
      const list = await api.get('/backup/list');
      setBackups(list || []);
    } catch (err) {
      console.error('Backup list error:', err);
    }
  };

  const handleTestPrint = async () => {
    if (!window.electronAPI || !window.electronAPI.printBill) {
      alert('Printing is only available in the desktop app.');
      return;
    }
    const printerName = localStorage.getItem('printer_name') || settings.printer_name || null;
    const html = `
      <div class="center"><h3 style="font-size:20px;">${settings.shop_name || 'Test Store'}</h3></div>
      <div class="line"></div>
      <p>PRINT TEST</p>
      <p>${new Date().toLocaleString()}</p>
      <p>Printer selected: ${printerName || '(default printer)'}</p>
      <div class="line"></div>
      <p>If you can read this, printing works.</p>
      <div class="line"></div>`;
    try {
      const result = await window.electronAPI.printBill(html, printerName, settings.paper_size || '80mm');
      if (!result?.success) {
        alert('Test print failed: ' + (result?.error || 'Unknown error'));
      } else {
        alert('Test print sent successfully.');
      }
    } catch (err) {
      alert('Test print failed: ' + err.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    setBackupError('');
    setBackupSuccess('');
    try {
      await api.post('/backup/create', customBackupDir ? { backup_dir: customBackupDir } : {});
      setBackupSuccess('Backup started successfully');
      setTimeout(() => setBackupSuccess(''), 3000);
      setTimeout(loadBackupStatus, 2000);
    } catch (err) {
      setBackupError(err.message || 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFilename && !sqlFilePath) return;
    setRestoreLoading(true);
    setBackupError('');
    try {
      const payload = {};
      if (sqlFilePath) {
        payload.file_path = sqlFilePath;
      } else {
        payload.filename = restoreFilename;
      }
      await api.post('/backup/restore', payload);
      setBackupSuccess('Database restored successfully. The application will reload.');
      setShowRestoreModal(false);
      setRestoreFilename('');
      setSqlFilePath('');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setBackupError(err.message || 'Restore failed');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!confirm(`Delete backup ${filename}?`)) return;
    try {
      await api.delete(`/backup/${encodeURIComponent(filename)}`);
      loadBackupStatus();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }));

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
  const fmtSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-2xl font-bold text-gray-800">Settings</h2>

      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Shop Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name</label>
              <input type="text" value={settings.shop_name || ''} onChange={e => update('shop_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone 1</label>
              <input type="text" value={settings.shop_phone || ''} onChange={e => update('shop_phone', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone 2</label>
              <input type="text" value={settings.shop_phone2 || ''} onChange={e => update('shop_phone2', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={settings.shop_address || ''} onChange={e => update('shop_address', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Tax & Pricing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Enabled</label>
              <select value={settings.tax_enabled || '0'} onChange={e => update('tax_enabled', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
              <input type="number" step="0.01" value={settings.tax_rate || '0'} onChange={e => update('tax_rate', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Cashier Permissions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount Cap (%)</label>
              <input type="number" step="0.5" value={settings.cashier_discount_cap_percent || '5'} onChange={e => update('cashier_discount_cap_percent', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Alerts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
              <input type="number" value={settings.low_stock_alert_default || '10'} onChange={e => update('low_stock_alert_default', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Alert (days before)</label>
              <input type="number" value={settings.expiry_alert_days || '60'} onChange={e => update('expiry_alert_days', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Backup</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auto Backup</label>
              <select value={settings.auto_backup_enabled || '1'} onChange={e => update('auto_backup_enabled', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="0">Disabled</option>
                <option value="1">Enabled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backup Time</label>
              <input type="time" value={settings.backup_time || '02:00'} onChange={e => update('backup_time', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Backup & Restore</h3>
          {backupError && <p className="text-red-500 text-sm mb-3">{backupError}</p>}
          {backupSuccess && <p className="text-green-600 text-sm mb-3">{backupSuccess}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backup Directory</label>
              <div className="flex gap-2">
                <input type="text" value={customBackupDir || ''} onChange={e => setCustomBackupDir(e.target.value)} placeholder="Select backup folder..." className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                <button type="button" onClick={async () => {
                  if (window.electronAPI?.selectBackupDir) {
                    const dir = await window.electronAPI.selectBackupDir();
                    if (dir) setCustomBackupDir(dir);
                  } else {
                    alert('Folder selection is only available in the desktop app');
                  }
                }} className="px-3 py-2 bg-gray-100 border rounded-lg text-sm hover:bg-gray-200 whitespace-nowrap">Browse</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retention Count</label>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border">{backupStatus?.retention_count || 30} backups</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Backup</label>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border">{fmtDate(backupStatus?.last_backup_at)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Backups</label>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border">{backupStatus?.backup_count || 0} files</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleBackupNow} disabled={backingUp} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
              {backingUp ? 'Creating Backup...' : 'Backup Now'}
            </button>
            <button onClick={() => { setShowRestoreModal(true); loadBackupStatus(); }} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
              Restore Database
            </button>
            <button type="button" onClick={async () => {
              if (window.electronAPI?.selectSqlFile) {
                const file = await window.electronAPI.selectSqlFile();
                if (file) {
                  setSqlFilePath(file);
                  setBackupSuccess(`Selected: ${file}`);
                  setTimeout(() => setBackupSuccess(''), 3000);
                }
              } else {
                alert('SQL file selection is only available in the desktop app');
              }
            }} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">
              Load SQL File
            </button>
          </div>
          {backups.length > 0 && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <p className="text-sm font-medium text-gray-700">Available Backups</p>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {backups.map(b => (
                  <div key={b.filename} className="flex items-center justify-between px-4 py-2 border-b last:border-b-0 hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{b.filename}</p>
                      <p className="text-xs text-gray-500">{fmtDate(b.created_at)} · {fmtSize(b.size)}</p>
                    </div>
                    <button onClick={() => handleDeleteBackup(b.filename)} className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Printer</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thermal Printer (this PC)</label>
              <select value={localStorage.getItem('printer_name') ?? (settings.printer_name || '')} onChange={e => {
                const val = e.target.value;
                if (val) localStorage.setItem('printer_name', val); else localStorage.removeItem('printer_name');
                update('printer_name', val);
              }} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Default Printer</option>
                {(printers || []).map((p, i) => <option key={i} value={p.name}>{p.name}{p.isDefault ? ' (Default)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paper Width</label>
              <select value={settings.paper_size || '80mm'} onChange={e => update('paper_size', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <button onClick={handleTestPrint} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
              🖨️ Test Print
            </button>
            <p className="text-xs text-gray-500 mt-1">Sends a test receipt to the printer selected above. Use this to verify printing on this PC.</p>
          </div>
        </div>

        <div className="border-t pt-6 flex items-center justify-between">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span className="text-green-600 font-medium">Settings saved!</span>}
        </div>
      </div>

      {showRestoreModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg text-red-700">⚠️ Restore Database</h3>
              <button onClick={() => { setShowRestoreModal(false); setRestoreFilename(''); setSqlFilePath(''); setBackupError(''); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800 font-medium">Warning: This will replace all current data!</p>
                <p className="text-xs text-red-600 mt-1">All existing records will be permanently lost. A safety backup will be created automatically before restoring.</p>
              </div>

              {!sqlFilePath ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Backup to Restore</label>
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    {backups.length === 0 ? (
                      <p className="p-4 text-center text-gray-500 text-sm">No backups available</p>
                    ) : (
                      backups.map(b => (
                        <label key={b.filename} className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${restoreFilename === b.filename ? 'bg-blue-50' : ''}`}>
                          <input type="radio" name="restore" value={b.filename} checked={restoreFilename === b.filename} onChange={e => setRestoreFilename(e.target.value)} className="text-blue-600" />
                          <div>
                            <p className="text-sm font-medium">{b.filename}</p>
                            <p className="text-xs text-gray-500">{fmtDate(b.created_at)} · {fmtSize(b.size)}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-800">External SQL file selected</p>
                  <p className="text-xs text-green-700 mt-1 break-all">{sqlFilePath}</p>
                </div>
              )}

              {backupError && <p className="text-red-500 text-sm">{backupError}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowRestoreModal(false); setRestoreFilename(''); setSqlFilePath(''); setBackupError(''); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={handleRestore} disabled={restoreLoading || (!restoreFilename && !sqlFilePath)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
                  {restoreLoading ? 'Restoring...' : 'Confirm Restore'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
