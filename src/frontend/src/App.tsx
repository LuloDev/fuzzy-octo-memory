import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { TickersPage } from '@/pages/TickersPage';
import { PositionsPage } from '@/pages/PositionsPage';
import { AuditPage } from '@/pages/AuditPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'tickers', element: <TickersPage /> },
      { path: 'positions', element: <PositionsPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}