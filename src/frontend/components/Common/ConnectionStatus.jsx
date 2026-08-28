import React, { useState, useEffect } from 'react';

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/health');
        setConnected(response.ok);
      } catch {
        setConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  if (connected) return null;

  return (
    <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-sm text-red-700">
      Disconnected from server. Please check your network connection.
    </div>
  );
}
