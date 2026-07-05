import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { PanicButton } from './PanicButton';

export function Layout() {
  return (
    <div className="min-h-screen bg-ink">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>
      {/* Floating panic button, bottom-right — always available per the
          constitution's "single action to flatten everything" requirement. */}
      <div className="fixed bottom-6 right-6 z-50">
        <PanicButton />
      </div>
    </div>
  );
}