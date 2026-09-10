import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../utils/api';

function ChangePasswordModal({ onClose }) {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!currentPassword) { setError('Current password is required'); return; }
    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      alert('Password changed successfully');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Change Password</h3>
        <p className="text-sm text-gray-500 mb-4">for user <span className="font-medium text-gray-700">{user?.username}</span></p>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password *</label>
            <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
            <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password *</label>
            <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Navbar({ currentPage, onNavigate, onLogout }) {
  const { user, isAdmin } = useAuth();
  const [showChangePw, setShowChangePw] = useState(false);

  const adminLinks = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'customers', label: 'Customers' },
    { key: 'reports', label: 'Reports' },
    { key: 'purchase-invoices', label: 'Purchase Invoices' },
    { key: 'supplier-returns', label: 'Supplier Returns' },
    { key: 'users', label: 'Users' },
    { key: 'settings', label: 'Settings' },
  ];

  const cashierLinks = [
    { key: 'billing', label: 'Billing' },
    { key: 'search', label: 'Search' },
    { key: 'customers', label: 'Customers' },
  ];

  const links = isAdmin ? adminLinks : cashierLinks;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold text-blue-600">Al-Hafiz Pharmacy</h1>
            <div className="hidden md:flex space-x-1">
              {links.map(link => (
                <button
                  key={link.key}
                  onClick={() => onNavigate(link.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    currentPage === link.key
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {user?.full_name} <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{user?.role}</span>
            </span>
            <button
              onClick={() => setShowChangePw(true)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Change Password
            </button>
            <button
              onClick={onLogout}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </nav>
  );
}
