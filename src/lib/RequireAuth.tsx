import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/**
 * Wraps any route that requires a logged-in user.
 * Unauthenticated visitors are redirected to /auth.
 * After login, they are returned to the page they tried to visit.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // While the session is being restored from localStorage, show nothing
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="w-8 h-8 border-4 border-blue-600 border-t-transparent
          rounded-full animate-spin" aria-label="Loading…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
