import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Referral capture: /?ref=CODE
const ref = new URLSearchParams(window.location.search).get('ref');
if (ref) localStorage.setItem('root.ref', ref);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
