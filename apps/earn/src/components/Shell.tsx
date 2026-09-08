import { motion } from 'framer-motion';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icon } from './ui';

const NAV = [
  { to: '/', label: 'Overview', icon: 'home' },
  { to: '/data', label: 'Data', icon: 'data' },
  { to: '/extension', label: 'Extension', icon: 'puzzle' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Shell() {
  const { email } = useAuth();
  const loc = useLocation();
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="https://rootnetwork.co">
          <img src="/icons/logo-black.png" alt="" />
          Root Network
        </a>
        <nav className="nav" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav__item ${isActive ? 'active' : ''}`}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-pill" className="nav__pill" transition={{ type: 'spring', stiffness: 520, damping: 42 }} />}
                  <Icon name={n.icon} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="sidebar__links">
            <a href="https://read.rootnetwork.co">Protocol</a>
            <a href="https://x.com/rootnetworkco" target="_blank" rel="noopener">
              X
            </a>
          </div>
          {email && (
            <div className="sidebar__links" style={{ fontSize: 11.5 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="mobile-top">
          <a className="brand" href="https://rootnetwork.co">
            <img src="/icons/logo-black.png" alt="" style={{ height: 20 }} />
            Root Network
          </a>
        </div>
        <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
          <Outlet />
        </motion.div>
      </main>

      <nav className="tabbar" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tab-pill" className="tab__pill" transition={{ type: 'spring', stiffness: 520, damping: 42 }} />}
                <Icon name={n.icon} size={22} />
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
