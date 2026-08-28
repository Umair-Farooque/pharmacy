import React from 'react';
import { useAuth } from './context/AuthContext';
import Login from './components/Common/Login';
import Navbar from './components/Common/Navbar';
import ConnectionStatus from './components/Common/ConnectionStatus';
import AdminDashboard from './components/Admin/Dashboard';
import Inventory from './components/Admin/Inventory';
import Reports from './components/Admin/Reports';
import Users from './components/Admin/Users';
import Settings from './components/Admin/Settings';
import Billing from './components/Cashier/Billing';
import SearchMedicine from './components/Cashier/SearchMedicine';

function App() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = React.useState('dashboard');

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
        case 'billing':
        default: return <Billing onNavigate={setCurrentPage} />;
      }
    }

    switch (currentPage) {
      case 'inventory': return <Inventory />;
      case 'reports': return <Reports />;
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
      <main className="p-6">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
