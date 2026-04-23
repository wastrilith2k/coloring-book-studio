import { createElement } from 'react';
import './index.css';
import App from './App.jsx';
import { mountAuthUI } from './lib/auth/index.js';

const rootEl = document.getElementById('root');

mountAuthUI(rootEl, ({ user, signOut }) =>
  createElement(App, { user, signOut })
);
