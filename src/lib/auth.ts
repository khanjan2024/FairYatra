/**
 * auth.ts — wraps Supabase Auth.
 * Passwords are handled entirely by Supabase (bcrypt server-side).
 */

import { supabase } from './supabase';
import type { User, UserRole } from '../types';

// ─── Map Supabase user + profile → our User type ──────────────────────────────

export async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return {
    id:           data.id,
    name:         data.name,
    email:        '',          // filled by caller from auth.user
    passwordHash: '',          // not stored client-side
    salt:         '',
    role:         data.role as UserRole,
    createdAt:    new Date(data.created_at).getTime(),
    banned:       data.banned ?? false,
  };
}

// ─── Auth actions ─────────────────────────────────────────────────────────────

export interface AuthError {
  field?: 'email' | 'password' | 'name' | 'general';
  message: string;
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<{ user: User } | { error: AuthError }> {
  if (!name.trim())
    return { error: { field: 'name', message: 'Name is required.' } };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return { error: { field: 'email', message: 'Enter a valid email address.' } };
  if (password.length < 6)
    return { error: { field: 'password', message: 'Password must be at least 6 characters.' } };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim() } },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already'))
      return { error: { field: 'email', message: 'An account with this email already exists.' } };
    return { error: { field: 'general', message: error.message } };
  }
  if (!data.user) return { error: { field: 'general', message: 'Signup failed. Try again.' } };

  const profile = await fetchProfile(data.user.id);
  if (!profile) return { error: { field: 'general', message: 'Profile creation failed.' } };

  return { user: { ...profile, email: data.user.email ?? email } };
}

export async function logIn(
  email: string,
  password: string,
): Promise<{ user: User } | { error: AuthError }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    if (error.message.toLowerCase().includes('invalid'))
      return { error: { field: 'password', message: 'Incorrect email or password.' } };
    if (error.message.toLowerCase().includes('banned'))
      return { error: { field: 'general', message: 'This account has been suspended.' } };
    return { error: { field: 'general', message: error.message } };
  }
  if (!data.user) return { error: { field: 'general', message: 'Login failed.' } };

  const profile = await fetchProfile(data.user.id);
  if (!profile) return { error: { field: 'general', message: 'Could not load profile.' } };
  if (profile.banned)
    return { error: { field: 'general', message: 'This account has been suspended.' } };

  return { user: { ...profile, email: data.user.email ?? email } };
}

export async function logOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const profile = await fetchProfile(session.user.id);
  if (!profile) return null;
  return { ...profile, email: session.user.email ?? '' };
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  // email not in profiles table — we can't expose it without service_role key
  return data.map((p) => ({
    id:           p.id,
    name:         p.name,
    email:        '(hidden)',
    passwordHash: '',
    salt:         '',
    role:         p.role as UserRole,
    createdAt:    new Date(p.created_at).getTime(),
    banned:       p.banned ?? false,
  }));
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  await supabase.from('profiles').update({ role }).eq('id', userId);
}

export async function toggleUserBan(userId: string, banned: boolean): Promise<void> {
  await supabase.from('profiles').update({ banned }).eq('id', userId);
}

export async function deleteUser(_userId: string): Promise<void> {
  // Deleting auth users requires service_role key (server-side only).
  // We ban instead as a safe client-side alternative.
  console.warn('deleteUser: use toggleUserBan to disable accounts client-side.');
}

// ─── Seed admin helper (call once after first signup) ─────────────────────────
// Not needed anymore — run the SQL snippet from supabase_schema.sql instead.
export async function seedAdmin(): Promise<void> {
  // no-op: handled by Supabase trigger + manual SQL promotion
}
