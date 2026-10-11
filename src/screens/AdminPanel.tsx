import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, FileText, Trash2,
  Ban, CheckCircle2, Crown, Search,
  ChevronDown, ChevronUp, BarChart3, X,
  LogOut, BookOpen, Edit2, Save,
  Lightbulb, CheckSquare, AlertOctagon,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import {
  getAllUsers, updateUserRole, toggleUserBan, deleteUser,
} from '../lib/auth';
import {
  loadReports, deleteReport, getStats,
  approveScamTip, removeCommunityScam, loadCommunityScams, isAlreadyApproved,
} from '../lib/storage';
import { supabase } from '../lib/supabase';
import type { User, CommunityReport, Scam, ScamCategory } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const TAB = ['Overview', 'Reports', 'Scam Tips', 'Users', 'Scam DB'] as const;
type Tab = typeof TAB[number];

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500';

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-sm font-medium text-slate-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab() {
  const [stats,   setStats]   = useState<{ total: number; overchargedPct: number; overchargedCount: number; topCity: string; avgOverpayPct: number } | null>(null);
  const [users,   setUsers]   = useState<User[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [scams,   setScams]   = useState<Scam[]>([]);

  useEffect(() => {
    getStats().then(setStats);
    getAllUsers().then(setUsers);
    loadReports().then(setReports);
    loadCommunityScams().then(setScams);
  }, []);

  const typeBreakdown = (['fare','complaint','review','scam_tip'] as const).map((t) => ({
    type: t,
    count: reports.filter((r) => r.type === t).length,
  }));

  const total = stats?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Reports"    value={total}                                       color="text-blue-600"  />
        <StatCard label="Overcharged"      value={`${stats?.overchargedPct ?? 0}%`}            color="text-red-600" sub={`${stats?.overchargedCount ?? 0} reports`} />
        <StatCard label="Registered Users" value={users.length}                                color="text-green-600" sub={`${users.filter((u) => u.role === 'admin').length} admin(s)`} />
        <StatCard label="Scam Entries"     value={scams.length}                             color="text-orange-600" sub="in database" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={15} className="text-slate-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-700">Report Breakdown</h3>
        </div>
        <div className="space-y-2">
          {typeBreakdown.map(({ type, count }) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const colors: Record<string, string> = {
              fare: 'bg-blue-500', complaint: 'bg-red-500',
              review: 'bg-amber-500', scam_tip: 'bg-orange-500',
            };
            return (
              <div key={type}>
                <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                  <span className="capitalize">{type.replace('_', ' ')}</span>
                  <span>{count} ({pct}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${colors[type]} rounded-full transition-all`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {total === 0 && (
        <p className="text-center text-sm text-slate-400 py-6">
          No community reports yet.
        </p>
      )}
    </div>
  );
}

// ── Reports tab ───────────────────────────────────────────────────────────────

function ReportsTab() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [search,  setSearch]  = useState('');
  const [typeF,   setTypeF]   = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { loadReports().then(setReports); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return reports
      .filter((r) =>
        (!typeF || r.type === typeF) &&
        (!q || r.fromPlace?.toLowerCase().includes(q) ||
               r.toPlace?.toLowerCase().includes(q)   ||
               r.city.toLowerCase().includes(q)        ||
               r.note?.toLowerCase().includes(q)       ||
               r.title?.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [reports, search, typeF]);

  const handleDelete = async (id: string) => {
    await deleteReport(id);
    loadReports().then(setReports);
  };

  const TYPE_COLORS: Record<string, string> = {
    fare: 'bg-blue-100 text-blue-700',
    complaint: 'bg-red-100 text-red-700',
    review: 'bg-amber-100 text-amber-700',
    scam_tip: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2
            text-slate-400 pointer-events-none" aria-hidden="true" />
          <input type="search" placeholder="Search reports…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-8`} aria-label="Search reports" />
        </div>
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All types</option>
          <option value="fare">Fare</option>
          <option value="complaint">Complaint</option>
          <option value="review">Review</option>
          <option value="scam_tip">Scam tip</option>
        </select>
      </div>

      <p className="text-xs text-slate-500">{filtered.length} report(s)</p>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <FileText size={32} className="mx-auto mb-2 opacity-30" aria-hidden="true" />
          <p className="text-sm">No reports match.</p>
        </div>
      ) : (
        filtered.map((r) => (
          <div key={r.id}
            className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Row header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                ${TYPE_COLORS[r.type] ?? 'bg-slate-100 text-slate-600'}`}>
                {r.type.replace('_',' ')}
              </span>
              <span className="text-xs text-slate-600 flex-1 truncate">
                {r.city} · {r.fromPlace || '?'}{r.toPlace ? ` → ${r.toPlace}` : ''}
              </span>
              <span className="text-xs text-slate-400 shrink-0">{timeAgo(r.timestamp)}</span>
              <button type="button"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="text-slate-400 hover:text-slate-600 focus:outline-none ml-1"
                aria-label="Toggle details">
                {expanded === r.id
                  ? <ChevronUp   size={14} aria-hidden="true" />
                  : <ChevronDown size={14} aria-hidden="true" />}
              </button>
            </div>

            {/* Expanded */}
            {expanded === r.id && (
              <div className="px-3 pb-3 border-t border-slate-100 space-y-2 pt-2">
                {r.title && <p className="text-sm font-semibold text-slate-800">{r.title}</p>}
                {r.quotedFare > 0 && (
                  <p className="text-xs text-slate-600">
                    Quoted ₹{r.quotedFare} · Paid ₹{r.paidFare}
                    {r.isOvercharged ? ' · Overcharged' : ''}
                  </p>
                )}
                {r.note && <p className="text-xs text-slate-700 leading-relaxed">{r.note}</p>}
                {r.driverDetails && (
                  <p className="text-xs text-slate-500">🚗 {r.driverDetails}</p>
                )}
                {r.evidence && r.evidence.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {r.evidence.map((ev, i) => (
                      <img key={i} src={ev.dataUrl} alt={`Evidence ${i+1}`}
                        className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                    ))}
                  </div>
                )}
                <div className="flex justify-end pt-1">
                  <button type="button" onClick={() => handleDelete(r.id)}
                    className="flex items-center gap-1.5 text-xs text-red-600
                      hover:text-red-800 focus:outline-none font-medium">
                    <Trash2 size={12} aria-hidden="true" /> Delete report
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users,  setUsers]  = useState<User[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => { getAllUsers().then(setUsers); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) =>
      !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const refresh = () => getAllUsers().then(setUsers);

  const handleRoleToggle = async (u: User) => {
    if (u.id === currentUserId) return;
    await updateUserRole(u.id, u.role === 'admin' ? 'user' : 'admin');
    refresh();
  };
  const handleBan = async (u: User) => {
    if (u.id === currentUserId) return;
    await toggleUserBan(u.id, !u.banned);
    refresh();
  };
  const handleDelete = async (u: User) => {
    if (u.id === currentUserId) return;
    await deleteUser(u.id);
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2
          text-slate-400 pointer-events-none" aria-hidden="true" />
        <input type="search" placeholder="Search users…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-8`} aria-label="Search users" />
      </div>

      <p className="text-xs text-slate-500">{filtered.length} user(s)</p>

      {filtered.map((u) => {
        const isSelf = u.id === currentUserId;
        return (
          <div key={u.id}
            className={`bg-white rounded-xl border p-3 space-y-2
              ${u.banned ? 'border-red-200 opacity-60' : 'border-slate-200'}`}>
            <div className="flex items-start gap-2">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center
                justify-center shrink-0 text-sm font-bold text-blue-700">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p>
                  {u.role === 'admin' && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5
                      rounded-full font-semibold flex items-center gap-0.5">
                      <Crown size={10} aria-hidden="true" /> Admin
                    </span>
                  )}
                  {u.banned && (
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5
                      rounded-full font-semibold">Banned</span>
                  )}
                  {isSelf && (
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5
                      rounded-full font-semibold">You</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">{u.email}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Joined {timeAgo(u.createdAt)}
                </p>
              </div>
            </div>

            {/* Actions — disabled for self */}
            {!isSelf && (
              <div className="flex gap-2 flex-wrap pt-1 border-t border-slate-100">
                <button type="button" onClick={() => handleRoleToggle(u)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg
                    bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium
                    focus:outline-none transition-colors">
                  <Crown size={11} aria-hidden="true" />
                  {u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                </button>
                <button type="button" onClick={() => handleBan(u)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg
                    font-medium focus:outline-none transition-colors
                    ${u.banned
                      ? 'bg-green-50 text-green-700 hover:bg-green-100'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                  {u.banned
                    ? <><CheckCircle2 size={11} aria-hidden="true" /> Unban</>
                    : <><Ban size={11} aria-hidden="true" /> Ban</>}
                </button>
                <button type="button" onClick={() => handleDelete(u)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg
                    bg-red-50 text-red-700 hover:bg-red-100 font-medium
                    focus:outline-none transition-colors ml-auto">
                  <Trash2 size={11} aria-hidden="true" /> Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Scam DB tab ───────────────────────────────────────────────────────────────

function ScamDBTab() {
  const [scams,    setScams]    = useState<Scam[]>([]);
  const [search,   setSearch]   = useState('');
  const [editing,  setEditing]  = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Scam>>({});
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // ── Add new scam state ──
  const [showAdd,  setShowAdd]  = useState(false);
  const [addData,  setAddData]  = useState({
    city: '', location: '', title: '', category: 'scam' as ScamCategory,
    description: '', howToAvoid: '', typicalLoss: '',
    severity: 'medium' as Scam['severity'], serviceType: 'taxi' as Scam['serviceType'],
    redFlags: '', tags: '',
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addError,  setAddError]  = useState<string | null>(null);

  const CITIES = ['guwahati','shillong','gangtok','tawang','kaziranga'];
  const SERVICE_OPTIONS = ['taxi','auto','shared_cab','guide','restaurant'];

  const loadScams = async () => {
    const all = await loadCommunityScams();
    setScams(all);
  };

  useEffect(() => { loadScams(); }, []);

  const handleAdd = async () => {
    setAddError(null);
    if (!addData.city)        { setAddError('Select a city.');        return; }
    if (!addData.title.trim()){ setAddError('Title is required.');     return; }
    if (!addData.description.trim()) { setAddError('Description is required.'); return; }
    if (!addData.howToAvoid.trim())  { setAddError('How to Avoid is required.'); return; }

    setAddSaving(true);
    const id = `admin_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const { error } = await supabase.from('community_scams').insert({
      id,
      city:          addData.city,
      location:      addData.location.trim() || addData.city,
      lat:           0,
      lng:           0,
      title:         addData.title.trim(),
      category:      addData.category,
      description:   addData.description.trim(),
      how_to_avoid:  addData.howToAvoid.trim(),
      typical_loss:  addData.typicalLoss.trim() || null,
      severity:      addData.severity,
      service_type:  addData.serviceType,
      red_flags:     addData.redFlags.trim()
        ? addData.redFlags.split('\n').map((s) => s.trim()).filter(Boolean)
        : null,
      tags: addData.tags.trim()
        ? addData.tags.split(',').map((s) => s.trim()).filter(Boolean)
        : [addData.city, addData.serviceType],
      source: 'seed',
    });
    setAddSaving(false);
    if (error) { setAddError(error.message); return; }
    setShowAdd(false);
    setAddData({
      city: '', location: '', title: '', category: 'scam',
      description: '', howToAvoid: '', typicalLoss: '',
      severity: 'medium', serviceType: 'taxi', redFlags: '', tags: '',
    });
    loadScams();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return scams.filter((s) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q)  ||
      s.location.toLowerCase().includes(q),
    );
  }, [scams, search]);

  const startEdit = (s: Scam) => {
    setEditing(s.id);
    setEditData({
      title:       s.title,
      description: s.description,
      howToAvoid:  s.howToAvoid,
      typicalLoss: s.typicalLoss ?? '',
      severity:    s.severity,
      category:    s.category,
      redFlags:    s.redFlags,
    });
  };

  const handleSave = async (s: Scam) => {
    setSaving(true);
    const { error } = await supabase.from('community_scams').update({
      title:        editData.title,
      description:  editData.description,
      how_to_avoid: editData.howToAvoid,
      typical_loss: editData.typicalLoss || null,
      severity:     editData.severity,
      category:     editData.category,
      red_flags:    editData.redFlags?.length ? editData.redFlags : null,
    }).eq('id', s.id);
    setSaving(false);
    if (error) {
      setMsg({ id: s.id, text: 'Save failed: ' + error.message, ok: false });
    } else {
      setMsg({ id: s.id, text: '✓ Saved', ok: true });
      setEditing(null);
      loadScams();
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scam entry? This cannot be undone.')) return;
    await supabase.from('community_scams').delete().eq('id', id);
    loadScams();
  };

  const SEV_COLOR: Record<string, string> = {
    high:   'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low:    'bg-slate-100 text-slate-600',
  };

  const CATEGORY_LIST: ScamCategory[] = ['overcharging','hidden_charge','tourist_trap','fake_service','scam'];

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
        All {scams.length} scam entries are stored in Supabase. Edits save immediately.
        Seed entries and community-approved tips are both shown here.
      </div>

      {/* ── Add new button ── */}
      <button type="button"
        onClick={() => { setShowAdd((v) => !v); setAddError(null); }}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
          border-2 border-dashed text-sm font-medium transition-colors focus:outline-none
          ${showAdd
            ? 'border-blue-400 bg-blue-50 text-blue-700'
            : 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600'
          }`}>
        {showAdd
          ? <><X size={15} aria-hidden="true" /> Cancel</>
          : <><BookOpen size={15} aria-hidden="true" /> Add New Scam Entry</>}
      </button>

      {/* ── Add form ── */}
      {showAdd && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">New Scam Entry</h3>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">City *</label>
              <select value={addData.city}
                onChange={(e) => setAddData((d) => ({ ...d, city: e.target.value }))}
                className={`${inputClass} text-xs`}>
                <option value="">Select…</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
              <input type="text" value={addData.location}
                onChange={(e) => setAddData((d) => ({ ...d, location: e.target.value }))}
                placeholder="e.g. Airport, Market…"
                className={`${inputClass} text-xs`} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
            <input type="text" value={addData.title}
              onChange={(e) => setAddData((d) => ({ ...d, title: e.target.value }))}
              placeholder="Short descriptive title"
              className={`${inputClass} text-xs`} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Severity *</label>
              <select value={addData.severity}
                onChange={(e) => setAddData((d) => ({ ...d, severity: e.target.value as Scam['severity'] }))}
                className={`${inputClass} text-xs`}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Category *</label>
              <select value={addData.category}
                onChange={(e) => setAddData((d) => ({ ...d, category: e.target.value as ScamCategory }))}
                className={`${inputClass} text-xs`}>
                {CATEGORY_LIST.map((c) => (
                  <option key={c} value={c}>{c.replace('_',' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Service *</label>
              <select value={addData.serviceType}
                onChange={(e) => setAddData((d) => ({ ...d, serviceType: e.target.value as Scam['serviceType'] }))}
                className={`${inputClass} text-xs`}>
                {SERVICE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace('_',' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
            <textarea rows={3} value={addData.description}
              onChange={(e) => setAddData((d) => ({ ...d, description: e.target.value }))}
              placeholder="What happens, who does it, how much they charge…"
              className={`${inputClass} resize-none text-xs`} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">How to Avoid *</label>
            <textarea rows={2} value={addData.howToAvoid}
              onChange={(e) => setAddData((d) => ({ ...d, howToAvoid: e.target.value }))}
              placeholder="What the traveller should do instead…"
              className={`${inputClass} resize-none text-xs`} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Typical Loss</label>
              <input type="text" value={addData.typicalLoss}
                onChange={(e) => setAddData((d) => ({ ...d, typicalLoss: e.target.value }))}
                placeholder="e.g. ₹300–800"
                className={`${inputClass} text-xs`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tags (comma-separated)</label>
              <input type="text" value={addData.tags}
                onChange={(e) => setAddData((d) => ({ ...d, tags: e.target.value }))}
                placeholder="e.g. airport, taxi"
                className={`${inputClass} text-xs`} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Red Flags (one per line)
            </label>
            <textarea rows={2} value={addData.redFlags}
              onChange={(e) => setAddData((d) => ({ ...d, redFlags: e.target.value }))}
              placeholder={"Refuses to show ID\nAsks for cash only"}
              className={`${inputClass} resize-none text-xs`} />
          </div>

          {addError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200
              rounded-lg px-3 py-2">{addError}</p>
          )}

          <button type="button" onClick={handleAdd} disabled={addSaving}
            className="w-full flex items-center justify-center gap-2 bg-blue-700
              hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold
              py-2.5 rounded-xl transition-colors focus:outline-none">
            {addSaving
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Save size={14} aria-hidden="true" />}
            {addSaving ? 'Adding…' : 'Add to Scam DB'}
          </button>
        </div>
      )}

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2
          text-slate-400 pointer-events-none" aria-hidden="true" />
        <input type="search" placeholder="Search scams…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-8`} aria-label="Search scams" />
      </div>

      <p className="text-xs text-slate-500">{filtered.length} entries</p>

      {filtered.map((s) => (
        <div key={s.id}
          className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">

          {/* Header row */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SEV_COLOR[s.severity]}`}>
                  {s.severity}
                </span>
                {s.source === 'community' && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-teal-100 text-teal-700">
                    Community
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {s.city} · {s.location} · {s.category.replace('_',' ')}
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button type="button"
                onClick={() => editing === s.id ? setEditing(null) : startEdit(s)}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100
                  hover:text-blue-700 focus:outline-none transition-colors"
                aria-label="Edit entry">
                <Edit2 size={13} aria-hidden="true" />
              </button>
              <button type="button"
                onClick={() => handleDelete(s.id)}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-100
                  hover:text-red-700 focus:outline-none transition-colors"
                aria-label="Delete entry">
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Description preview when not editing */}
          {editing !== s.id && (
            <p className="text-xs text-slate-600 leading-relaxed">{s.description}</p>
          )}

          {/* Inline full editor */}
          {editing === s.id && (
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                <input type="text" value={editData.title ?? ''}
                  onChange={(e) => setEditData((d) => ({ ...d, title: e.target.value }))}
                  className={`${inputClass} text-xs`} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Severity</label>
                  <select value={editData.severity ?? 'medium'}
                    onChange={(e) => setEditData((d) => ({ ...d, severity: e.target.value as Scam['severity'] }))}
                    className={`${inputClass} text-xs`}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <select value={editData.category ?? 'scam'}
                    onChange={(e) => setEditData((d) => ({ ...d, category: e.target.value as ScamCategory }))}
                    className={`${inputClass} text-xs`}>
                    {CATEGORY_LIST.map((c) => (
                      <option key={c} value={c}>{c.replace('_',' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea rows={3} value={editData.description ?? ''}
                  onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))}
                  className={`${inputClass} resize-none text-xs`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">How to Avoid</label>
                <textarea rows={2} value={editData.howToAvoid ?? ''}
                  onChange={(e) => setEditData((d) => ({ ...d, howToAvoid: e.target.value }))}
                  className={`${inputClass} resize-none text-xs`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Typical Loss (optional)</label>
                <input type="text" value={editData.typicalLoss ?? ''}
                  onChange={(e) => setEditData((d) => ({ ...d, typicalLoss: e.target.value }))}
                  placeholder="e.g. ₹300–800"
                  className={`${inputClass} text-xs`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Red Flags (one per line)
                </label>
                <textarea rows={2}
                  value={(editData.redFlags ?? []).join('\n')}
                  onChange={(e) => setEditData((d) => ({
                    ...d,
                    redFlags: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean),
                  }))}
                  className={`${inputClass} resize-none text-xs`} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => handleSave(s)}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-700
                    text-white rounded-lg hover:bg-blue-800 disabled:opacity-60
                    focus:outline-none font-medium">
                  <Save size={11} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setEditing(null)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-slate-100
                    text-slate-600 rounded-lg hover:bg-slate-200 focus:outline-none">
                  <X size={11} aria-hidden="true" /> Cancel
                </button>
              </div>
            </div>
          )}

          {msg?.id === s.id && (
            <p className={`text-xs font-medium ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>
              {msg.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Scam Tips review queue ────────────────────────────────────────────────────

const SEVERITY_OPTIONS: Scam['severity'][] = ['high', 'medium', 'low'];
const CATEGORY_OPTIONS: { value: ScamCategory; label: string }[] = [
  { value: 'overcharging',  label: 'Overcharging'  },
  { value: 'hidden_charge', label: 'Hidden Charge' },
  { value: 'tourist_trap',  label: 'Tourist Trap'  },
  { value: 'fake_service',  label: 'Fake Service'  },
  { value: 'scam',          label: 'Scam / Fraud'  },
];

function ScamTipsTab() {
  const [tips,      setTips]      = useState<CommunityReport[]>([]);
  const [approved,  setApproved]  = useState<Scam[]>([]);
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  // Per-tip form state stored in a map
  const [forms, setForms] = useState<Record<string, {
    severity: Scam['severity'];
    category: ScamCategory;
    howToAvoid: string;
    typicalLoss: string;
    redFlags: string;
  }>>({});

  const [savedId, setSavedId] = useState<string | null>(null);

  const refreshAll = async () => {
    const allReports = await loadReports();
    const scamTips = allReports.filter((r) => r.type === 'scam_tip');
    setTips(scamTips);
    const communityScams = await loadCommunityScams();
    setApproved(communityScams);
    // build approved-ids set
    const ids = await Promise.all(scamTips.map((r) => isAlreadyApproved(r.id).then((v) => v ? r.id : null)));
    setApprovedIds(new Set(ids.filter(Boolean) as string[]));
  };

  useEffect(() => { refreshAll(); }, []);

  const pending      = tips.filter((r) => !approvedIds.has(r.id));
  const approvedTips = tips.filter((r) =>  approvedIds.has(r.id));

  const getForm = (id: string) => forms[id] ?? {
    severity:   'medium' as Scam['severity'],
    category:   'scam' as ScamCategory,
    howToAvoid: '',
    typicalLoss: '',
    redFlags:   '',
  };

  const setForm = (id: string, patch: Partial<ReturnType<typeof getForm>>) =>
    setForms((prev) => ({ ...prev, [id]: { ...getForm(id), ...patch } }));

  const handleApprove = async (report: CommunityReport) => {
    const f = getForm(report.id);
    if (!f.howToAvoid.trim()) return;

    await approveScamTip(report, {
      severity:    f.severity,
      category:    f.category,
      howToAvoid:  f.howToAvoid.trim(),
      typicalLoss: f.typicalLoss.trim() || undefined,
      redFlags:    f.redFlags.trim()
        ? f.redFlags.split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined,
    });

    await refreshAll();
    setSavedId(report.id);
    setExpanded(null);
    setTimeout(() => setSavedId(null), 3000);
  };

  const handleRemove = async (scamId: string) => {
    await removeCommunityScam(scamId);
    await refreshAll();
  };

  const SEV_COLOR: Record<string, string> = {
    high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="space-y-4">
      {/* Pending queue */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertOctagon size={15} className="text-orange-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-700">
            Pending Review ({pending.length})
          </h3>
        </div>

        {pending.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-xl border border-slate-200">
            <CheckSquare size={28} className="mx-auto text-green-400 mb-2" aria-hidden="true" />
            <p className="text-sm text-slate-500">All caught up — no pending scam tips.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => {
              const f = getForm(r.id);
              const isOpen = expanded === r.id;
              return (
                <div key={r.id}
                  className="bg-white rounded-xl border border-orange-200 overflow-hidden">
                  {/* Header */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full flex items-start gap-2.5 px-3 py-3 text-left
                      focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {r.title ?? 'Untitled scam tip'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {r.city} · {r.serviceType.replace('_',' ')} · {timeAgo(r.timestamp)}
                      </p>
                    </div>
                    {isOpen
                      ? <ChevronUp   size={15} className="text-slate-400 mt-0.5 shrink-0" />
                      : <ChevronDown size={15} className="text-slate-400 mt-0.5 shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-4 pt-2 border-t border-slate-100 space-y-3">
                      {/* Submitted content */}
                      {r.note && (
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-slate-600 mb-1">
                            User's description:
                          </p>
                          <p className="text-xs text-slate-700 leading-relaxed">{r.note}</p>
                        </div>
                      )}
                      {r.fromPlace && (
                        <p className="text-xs text-slate-500">📍 Location: {r.fromPlace}</p>
                      )}

                      {/* Approval form */}
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-3">
                        <p className="text-xs font-bold text-green-800 flex items-center gap-1.5">
                          <Lightbulb size={12} aria-hidden="true" />
                          Complete before approving:
                        </p>

                        {/* Severity + Category */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Severity *
                            </label>
                            <select value={f.severity}
                              onChange={(e) => setForm(r.id, { severity: e.target.value as Scam['severity'] })}
                              className={`${inputClass} text-xs`}>
                              {SEVERITY_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Category *
                            </label>
                            <select value={f.category}
                              onChange={(e) => setForm(r.id, { category: e.target.value as ScamCategory })}
                              className={`${inputClass} text-xs`}>
                              {CATEGORY_OPTIONS.map(({ value, label }) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* How to avoid */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            How to Avoid * (shown to users)
                          </label>
                          <textarea rows={2} value={f.howToAvoid}
                            onChange={(e) => setForm(r.id, { howToAvoid: e.target.value })}
                            placeholder="What should travellers do to avoid this?"
                            className={`${inputClass} resize-none text-xs`} />
                        </div>

                        {/* Typical loss */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Typical Loss (optional, e.g. ₹200–500)
                          </label>
                          <input type="text" value={f.typicalLoss}
                            onChange={(e) => setForm(r.id, { typicalLoss: e.target.value })}
                            placeholder="e.g. ₹300–800"
                            className={`${inputClass} text-xs`} />
                        </div>

                        {/* Red flags */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Red Flags (optional, one per line)
                          </label>
                          <textarea rows={2} value={f.redFlags}
                            onChange={(e) => setForm(r.id, { redFlags: e.target.value })}
                            placeholder={"Refuses to show ID\nAsks for cash upfront"}
                            className={`${inputClass} resize-none text-xs`} />
                        </div>

                        <button type="button"
                          onClick={() => handleApprove(r)}
                          disabled={!f.howToAvoid.trim()}
                          className="w-full flex items-center justify-center gap-2 bg-green-600
                            hover:bg-green-700 disabled:opacity-40 text-white text-sm
                            font-semibold py-2.5 rounded-xl transition-colors
                            focus:outline-none focus:ring-2 focus:ring-green-500">
                          <CheckCircle2 size={15} aria-hidden="true" />
                          Approve &amp; Add to Scam Library
                        </button>
                      </div>
                    </div>
                  )}

                  {savedId === r.id && (
                    <div className="px-3 py-2 bg-green-50 text-green-700 text-xs font-medium
                      border-t border-green-200">
                      ✓ Added to Scam Library successfully
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Already approved */}
      {approvedTips.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={15} className="text-green-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-700">
              Approved ({approvedTips.length})
            </h3>
          </div>
          <div className="space-y-2">
            {approved.map((s) => (
              <div key={s.id}
                className="bg-white rounded-xl border border-green-200 px-3 py-2.5
                  flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.title}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                      ${SEV_COLOR[s.severity]}`}>
                      {s.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {s.city} · {s.category.replace('_',' ')}
                    {s.approvedAt ? ` · approved ${timeAgo(s.approvedAt)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => handleRemove(s.id)}
                  className="shrink-0 text-slate-400 hover:text-red-500 transition-colors
                    focus:outline-none p-1"
                  aria-label="Remove from library">
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main AdminPanel ────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const navigate      = useNavigate();
  const { user, isAdmin, logOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  // Guard
  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <Shield size={40} className="mx-auto text-slate-300" aria-hidden="true" />
        <p className="text-slate-600 font-medium">You must be signed in to access this page.</p>
        <button onClick={() => navigate('/auth')}
          className="bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold
            hover:bg-blue-800 transition-colors">
          Sign In
        </button>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <Ban size={40} className="mx-auto text-red-300" aria-hidden="true" />
        <p className="text-slate-600 font-medium">Admin access only.</p>
        <button onClick={() => navigate('/')}
          className="text-blue-600 hover:text-blue-800 font-medium focus:outline-none">
          ← Back to app
        </button>
      </div>
    );
  }

  const TAB_ICONS: Record<Tab, React.ElementType> = {
    Overview:    BarChart3,
    Reports:     FileText,
    'Scam Tips': AlertOctagon,
    Users:       Users,
    'Scam DB':   BookOpen,
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-900 flex items-center
          justify-center shrink-0">
          <Shield size={18} className="text-white" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-800">Admin Panel</h2>
          <p className="text-xs text-slate-500">Signed in as {user.name}</p>
        </div>
        <button onClick={() => { logOut(); navigate('/auth'); }}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600
            border border-slate-300 px-3 py-2 rounded-xl transition-colors
            focus:outline-none">
          <LogOut size={13} aria-hidden="true" /> Sign out
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1" role="tablist">
        {TAB.map((t) => {
          const Icon = TAB_ICONS[t];
          const active = activeTab === t;
          return (
            <button key={t} role="tab" aria-selected={active}
              onClick={() => setActiveTab(t)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg
                text-xs font-medium transition-all focus:outline-none
                ${active
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={15} aria-hidden="true" />
              {t}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === 'Overview'   && <OverviewTab />}
        {activeTab === 'Reports'    && <ReportsTab />}
        {activeTab === 'Scam Tips'  && <ScamTipsTab />}
        {activeTab === 'Users'      && <UsersTab currentUserId={user.id} />}
        {activeTab === 'Scam DB'    && <ScamDBTab />}
      </div>
    </div>
  );
}
