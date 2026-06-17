import React from 'react';
import ReactDOM from 'react-dom/client';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
