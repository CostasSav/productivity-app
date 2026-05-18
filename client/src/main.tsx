import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DarkModeProvider } from './context/DarkModeContext';
import { TasksProvider } from './context/TasksContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DarkModeProvider>
      <TasksProvider>
        <App />
      </TasksProvider>
    </DarkModeProvider>
  </React.StrictMode>
);
