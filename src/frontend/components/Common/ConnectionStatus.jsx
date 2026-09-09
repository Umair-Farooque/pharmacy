import React, { useState, useEffect } from 'react';

function getApiBase() {
  const serverIp = localStorage.getItem('server_ip');
  if (serverIp) {
    return `http://${serverIp}:3000/api`;
  }
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';
}

export default function ConnectionStatus() {
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch(`${getApiBase()}/health`);
        setStatus(response.ok ? 'connected' : 'disconnected');
      } catch {
        setStatus('disconnected');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'connected') return null;

  const message =
    status === 'connecting'
      ? 'Connecting to server...'
      : 'Disconnected from server. Please check your network connection.';

  return (
    <div
      className={`px-4 py-2 text-center text-sm border-b ${
        status === 'connecting'
          ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}
    >
      {message}
    </div>
  );
}
