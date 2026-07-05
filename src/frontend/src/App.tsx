import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { TickersPage } from '@/pages/TickersPage';
import { PositionsPage } from '@/pages/PositionsPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'tickers', element: <TickersPage /> },
      { path: 'positions', element: <PositionsPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}