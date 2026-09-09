import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

export default function SetupWizard() {
  const [step, setStep] = useState(1);
  const [isServer, setIsServer] = useState(true);
  const [config, setConfig] = useState({
    dbHost: '127.0.0.1',
    dbPort: '3306',
    dbUser: 'root',
    dbPassword: '',
    dbName: 'pharmacy_db',
    serverIp: '192.168.1.100',
    shopName: 'Medical Store',
    adminPassword: '',
    adminPasswordConfirm: '',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [restoreSqlPath, setRestoreSqlPath] = useState('');

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getConfig) {
      window.electronAPI.getConfig().then(existingConfig => {
        if (existingConfig) {
          setConfig(prev => ({
            ...prev,
            dbHost: existingConfig.DB_HOST || '127.0.0.1',
            dbPort: existingConfig.DB_PORT || '3306',
            dbUser: existingConfig.DB_USER || 'root',
            dbPassword: existingConfig.DB_PASSWORD || '',
            dbName: existingConfig.DB_NAME || 'pharmacy_db',
            serverIp: existingConfig.SERVER_IP || '192.168.1.100',
          }));
        }
      });
    }
  }, []);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const res = await fetch(`http://${config.serverIp}:3000/api/health`);
      if (res.ok) {
        setTestResult({ success: true, message: 'Connection successful!' });
      } else {
        setTestResult({ success: false, message: 'Server responded with error' });
      }
    } catch (err) {
      setTestResult({ success: false, message: 'Cannot connect to server. Make sure the server PC is running.' });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    if (config.adminPassword !== config.adminPasswordConfirm) {
      setError('Admin passwords do not match');
      return;
    }
    if (config.adminPassword.length < 6) {
      setError('Admin password must be at least 6 characters');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const electronConfig = {
        dbHost: config.dbHost,
        dbPort: config.dbPort,
        dbUser: config.dbUser,
        dbPassword: config.dbPassword,
        dbName: config.dbName,
        serverIp: isServer ? '127.0.0.1' : config.serverIp,
        jwtSecret: 'pharmacy_secret_key_change_in_production',
      };

      if (window.electronAPI && window.electronAPI.saveConfig) {
        const result = await window.electronAPI.saveConfig(electronConfig);
        if (!result.success) {
          throw new Error(result.error || 'Failed to save config');
        }
      }

      if (isServer && restoreSqlPath && window.electronAPI?.scheduleRestore) {
        await window.electronAPI.scheduleRestore(restoreSqlPath);
      }

      if (isServer && config.adminPassword) {
        await api.post('/auth/setup-admin', { password: config.adminPassword });
      }

      localStorage.setItem('setup_complete', 'true');
      localStorage.setItem('server_ip', isServer ? '127.0.0.1' : config.serverIp);

      if (window.electronAPI && window.electronAPI.restartApp) {
        window.electronAPI.restartApp();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Al-Hafiz Pharmacy</h1>
          <p className="text-gray-500 mt-2">Setup Wizard - Step {step} of 3</p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between mb-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${s <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {s}
              </div>
            ))}
          </div>
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-full bg-blue-600 rounded transition-all" style={{ width: `${(step / 3) * 100}%` }}></div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">This PC is the:</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setIsServer(true)}
                  className={`p-4 rounded-xl border-2 transition-all ${isServer ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="text-2xl mb-2">🖥️</div>
                  <div className="font-medium">Server (Admin)</div>
                  <div className="text-xs text-gray-500">Has MySQL database</div>
                </button>
                <button
                  onClick={() => setIsServer(false)}
                  className={`p-4 rounded-xl border-2 transition-all ${!isServer ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="text-2xl mb-2">💻</div>
                  <div className="font-medium">Client (Cashier)</div>
                  <div className="text-xs text-gray-500">Connects to server</div>
                </button>
              </div>
            </div>

            {!isServer && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Server PC IP Address</label>
                <input
                  type="text"
                  value={config.serverIp}
                  onChange={e => setConfig({ ...config, serverIp: e.target.value })}
                  placeholder="192.168.1.100"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Ask your server PC administrator for this IP</p>
              </div>
            )}

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {isServer ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MySQL Host</label>
                  <input
                    type="text"
                    value={config.dbHost}
                    onChange={e => setConfig({ ...config, dbHost: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                    <input
                      type="text"
                      value={config.dbPort}
                      onChange={e => setConfig({ ...config, dbPort: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Database Name</label>
                    <input
                      type="text"
                      value={config.dbName}
                      onChange={e => setConfig({ ...config, dbName: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">MySQL Username</label>
                    <input
                      type="text"
                      value={config.dbUser}
                      onChange={e => setConfig({ ...config, dbUser: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">MySQL Password</label>
                    <input
                      type="password"
                      value={config.dbPassword}
                      onChange={e => setConfig({ ...config, dbPassword: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name</label>
                  <input
                    type="text"
                    value={config.shopName}
                    onChange={e => setConfig({ ...config, shopName: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Database Setup</label>
                  <div className="flex gap-3 mb-3">
                    <button
                      type="button"
                      onClick={() => setRestoreSqlPath('')}
                      className={`flex-1 py-2 border rounded-lg text-sm font-medium ${!restoreSqlPath ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      Create New Database
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.electronAPI?.selectSqlFile) {
                          const file = await window.electronAPI.selectSqlFile();
                          if (file) setRestoreSqlPath(file);
                        } else {
                          alert('SQL file selection is only available in the desktop app');
                        }
                      }}
                      className={`flex-1 py-2 border rounded-lg text-sm font-medium ${restoreSqlPath ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      Restore Existing Database
                    </button>
                  </div>
                  {restoreSqlPath && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm text-green-800 font-medium">Selected backup file:</p>
                      <p className="text-xs text-green-700 break-all mt-1">{restoreSqlPath}</p>
                      <button
                        type="button"
                        onClick={() => setRestoreSqlPath('')}
                        className="text-xs text-red-600 hover:text-red-700 mt-2"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                  {!restoreSqlPath && (
                    <p className="text-xs text-gray-500">A new pharmacy database will be created automatically.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Server IP</label>
                  <input
                    type="text"
                    value={config.serverIp}
                    onChange={e => setConfig({ ...config, serverIp: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="w-full py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                {testResult && (
                  <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    {testResult.message}
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-medium"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {isServer ? (
              <>
                <p className="text-gray-600 text-sm">Set your admin account password. Use this to login as administrator.</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
                  <input
                    type="password"
                    value={config.adminPassword}
                    onChange={e => setConfig({ ...config, adminPassword: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={config.adminPasswordConfirm}
                    onChange={e => setConfig({ ...config, adminPasswordConfirm: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">✅</div>
                <p className="text-gray-600">Configuration complete!</p>
                <p className="text-sm text-gray-500 mt-2">Click Save to continue. You'll be asked to login with admin credentials from the server PC.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-medium"
              >
                Back
              </button>
              <button
                onClick={saveConfig}
                disabled={saving}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save & Finish'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
