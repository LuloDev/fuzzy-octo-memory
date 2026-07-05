import { QueryClient } from '@tanstack/react-query';

// React Query global defaults:
//   - refetchOnWindowFocus: false (the dashboard is normally displayed
//     inside a VPS, so window focus events are unreliable)
//   - refetchInterval: 30s for "live" reads, manual for ticker CRUD
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchInterval: 30_000,
      staleTime: 15_000,
      retry: 1,
    },
  },
});

export default queryClient;