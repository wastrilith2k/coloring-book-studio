import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App apiKey={apiKey} />
  </StrictMode>
);
