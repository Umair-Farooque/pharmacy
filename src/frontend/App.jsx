import React from 'react';
import { useAuth } from './context/AuthContext';
import Login from './components/Common/Login';
import Navbar from './components/Common/Navbar';
import ConnectionStatus from './components/Common/ConnectionStatus';
import AdminDashboard from './components/Admin/Dashboard';
import Inventory from './components/Admin/Inventory';
import Reports from './components/Admin/Reports';
import PurchaseInvoices from './components/Admin/PurchaseInvoices';
import SupplierReturns from './components/Admin/SupplierReturns';
import Users from './components/Admin/Users';
import Settings from './components/Admin/Settings';
import Customers from './components/Admin/Customers';
import Billing from './components/Cashier/Billing';
import SearchMedicine from './components/Cashier/SearchMedicine';
import SetupWizard from './components/Common/SetupWizard';

function App() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = React.useState('dashboard');
  const [showSetup, setShowSetup] = React.useState(() => {
    if (window.electronAPI) {
      return false;
    }
    return !localStorage.getItem('setup_complete');
  });

  if (showSetup) {
    return <SetupWizard />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onNavigate={setCurrentPage} />;
  }

  const renderPage = () => {
    if (user.role === 'CASHIER') {
      switch (currentPage) {
        case 'search': return <SearchMedicine />;
        case 'customers': return <Customers />;
        case 'billing':
        default: return <Billing onNavigate={setCurrentPage} />;
      }
    }

    switch (currentPage) {
      case 'inventory': return <Inventory />;
      case 'customers': return <Customers />;
      case 'reports': return <Reports />;
      case 'purchase-invoices': return <PurchaseInvoices />;
      case 'supplier-returns': return <SupplierReturns />;
      case 'users': return <Users />;
      case 'settings': return <Settings />;
      case 'dashboard':
      default: return <AdminDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar currentPage={currentPage} onNavigate={setCurrentPage} onLogout={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.reload(); }} />
      <ConnectionStatus />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
