import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

export default function AppShell({ children }) {
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="min-h-screen bg-base">
      <Navbar onMenu={() => setDrawer(true)} />
      {/* The sidebar is flush with the left edge of the window; only the page content is centered (capped for readability). */}
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-line lg:block"><Sidebar /></aside>
        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6"><div className="mx-auto w-full max-w-[1200px]">{children || <Outlet />}</div></main>
      </div>
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)}>
            <motion.div className="h-full w-64 border-r border-line-strong bg-base pt-16" initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()}>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
