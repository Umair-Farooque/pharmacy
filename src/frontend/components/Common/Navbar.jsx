import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Navbar({ currentPage, onNavigate, onLogout }) {
  const { user, isAdmin } = useAuth();

  const adminLinks = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'reports', label: 'Reports' },
    { key: 'users', label: 'Users' },
    { key: 'settings', label: 'Settings' },
  ];

  const cashierLinks = [
    { key: 'billing', label: 'Billing' },
    { key: 'search', label: 'Search' },
  ];

  const links = isAdmin ? adminLinks : cashierLinks;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold text-blue-600">BunnySystems</h1>
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
              onClick={onLogout}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
