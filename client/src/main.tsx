import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';
import { DarkModeProvider } from './context/DarkModeContext';
import { TasksProvider } from './context/TasksContext';
import { GlobalFetchingBar, GlobalQueryErrorBanner } from './components/ui/GlobalQueryStatus';
import './index.css';
import { PWAUpdatePrompt } from './components/ui/PWAUpdatePrompt';
import { AuthGate } from './context/AuthContext';
import { ApiError } from './api/request';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // default: 30s for frequently-changing data (tasks, habits, grocery)
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && [401, 403].includes(error.status)) && count < 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PWAUpdatePrompt />
      <DarkModeProvider>
        <AuthGate>
          <GlobalFetchingBar />
          <GlobalQueryErrorBanner />
          <TasksProvider>
            <App />
          </TasksProvider>
        </AuthGate>
      </DarkModeProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>
);
