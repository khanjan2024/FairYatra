import { Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Search, Map, FileEdit, BookOpen, Users, Shield, LogOut, LogIn } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import CheckFare     from './screens/CheckFare';
import MapScreen     from './screens/MapScreen';
import ReportPrice   from './screens/ReportPrice';
import ScamLibrary   from './screens/ScamLibrary';
import CommunityFeed from './screens/CommunityFeed';
import AuthScreen    from './screens/AuthScreen';
import AdminPanel    from './screens/AdminPanel';
import { useAuth }   from './lib/AuthContext';
import RequireAuth   from './lib/RequireAuth';

const NAV_ITEMS = [
  { to: '/',       label: 'Check Fare', Icon: Search  },
  { to: '/map',    label: 'Map',        Icon: Map     },
  { to: '/report', label: 'Report',     Icon: FileEdit},
  { to: '/feed',   label: 'Community',  Icon: Users   },
  { to: '/scams',  label: 'Scams',      Icon: BookOpen},
];

// ── User avatar menu ──────────────────────────────────────────────────────────

function UserMenu() {
  const { user, isAdmin, logOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) {
    return (
      <button
        onClick={() => navigate('/auth')}
        className="flex items-center gap-1.5 text-xs text-blue-200 hover:text-white
          border border-blue-700 px-2.5 py-1.5 rounded-xl transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-400"
        aria-label="Sign in">
        <LogIn size={14} aria-hidden="true" />
        Sign in
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 focus:outline-none group"
        aria-label="User menu" aria-expanded={open}>
        <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-blue-400
          flex items-center justify-center text-sm font-bold text-white
          group-hover:border-white transition-colors">
          {user.name.charAt(0).toUpperCase()}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-44 bg-white rounded-xl shadow-xl
          border border-slate-200 overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { navigate('/admin'); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm
                text-blue-700 hover:bg-blue-50 transition-colors text-left">
              <Shield size={14} aria-hidden="true" />
              Admin Panel
            </button>
          )}
          <button
            onClick={() => { logOut(); setOpen(false); navigate('/'); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm
              text-red-600 hover:bg-red-50 transition-colors text-left">
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { pathname }      = useLocation();
  const location          = useLocation();
  const { user, isAdmin } = useAuth();
  const isAuthPage    = pathname === '/auth';
  const isAdminPage   = pathname === '/admin';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header — hidden on auth screen */}
      {!isAuthPage && (
        <header className="bg-blue-900 text-white px-4 py-3 flex items-center
          gap-3 shadow-md sticky top-0 z-30">
          <img src="/logo.png" alt="FairYatra logo"
            className="w-9 h-9 rounded-xl shrink-0 object-cover" />
          <div className="flex-1">
            <h1 className="font-bold text-lg leading-tight tracking-tight">FairYatra</h1>
            <p className="text-blue-300 text-xs leading-tight">Fair fares for North East India</p>
          </div>
          {/* User role badge */}
          {isAdmin && !isAdminPage && (
            <NavLink to="/admin"
              className="flex items-center gap-1 text-xs bg-blue-700 hover:bg-blue-600
                px-2 py-1 rounded-lg transition-colors focus:outline-none mr-1">
              <Shield size={12} aria-hidden="true" />
              Admin
            </NavLink>
          )}
          <UserMenu />
        </header>
      )}

      {/* Main content */}
      <main className={`flex-1 overflow-y-auto ${!isAuthPage ? 'pb-20' : ''}`}>
        <Routes>
          {/* Public — auth page redirects logged-in users away */}
          <Route path="/auth" element={
            user ? <Navigate to={(location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'} replace /> : <AuthScreen />
          } />

          {/* Protected routes — all require login */}
          <Route path="/" element={<RequireAuth><CheckFare /></RequireAuth>} />
          <Route path="/map"    element={<RequireAuth><MapScreen /></RequireAuth>} />
          <Route path="/report" element={<RequireAuth><ReportPrice /></RequireAuth>} />
          <Route path="/feed"   element={<RequireAuth><CommunityFeed /></RequireAuth>} />
          <Route path="/scams"  element={<RequireAuth><ScamLibrary /></RequireAuth>} />
          <Route path="/admin"  element={<RequireAuth><AdminPanel /></RequireAuth>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Bottom nav — hidden on auth + admin screens */}
      {!isAuthPage && !isAdminPage && (
        <nav
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200
            flex z-30 shadow-lg"
          aria-label="Main navigation"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {NAV_ITEMS.map(({ to, label, Icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <NavLink key={to} to={to}
                className={`flex-1 flex flex-col items-center py-2 px-1 text-xs
                  font-medium transition-colors
                  ${active
                    ? 'text-blue-700 border-t-2 border-blue-700 -mt-0.5'
                    : 'text-slate-500 hover:text-blue-600'}`}
                aria-current={active ? 'page' : undefined}>
                <Icon size={20} className="mb-0.5" aria-hidden="true"
                  strokeWidth={active ? 2.5 : 1.75} />
                {label}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
