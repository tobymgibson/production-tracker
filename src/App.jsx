import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Download, Upload, Eye, EyeOff, AlertTriangle, TrendingUp, Calendar, Package,
  Search, X, Plus, ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle, LogOut,
} from 'lucide-react';
import { firebaseService } from './firebase-service.js';
import './app-styles.css';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const DEFAULT_MACHINES = [
  { id: 1, name: 'KO1', fullName: 'Klett 1',   capacity: 50000, stockPercentage: 57, availableCapacity: 21500, avgSetupTime: 2   },
  { id: 2, name: 'KO3', fullName: 'Klett 3',   capacity: 17500, stockPercentage: 22, availableCapacity: 13650, avgSetupTime: 1.5 },
  { id: 3, name: 'BO1', fullName: 'Century',   capacity: 24000, stockPercentage: 45, availableCapacity: 13200, avgSetupTime: 1.5 },
  { id: 4, name: 'JC1', fullName: 'Jinchang',  capacity: 48000, stockPercentage: 49, availableCapacity: 24480, avgSetupTime: 2   },
];

const VALIDATIONS = [
  'Existing Tooling', 'Design Brief', 'Artwork Brief', 'Credit Check',
  'Design Approval', 'Artwork Approval', 'Colour Approval', 'Customer Order',
  'Pre-Production', 'Job Raised', 'Material Purchasing', 'Kick Off Meeting Required',
  'Formes Ordered', 'Plates Ordered',
];

const SAVE_CHUNK_SIZE = 400; // Firestore batch limit is 500; leave headroom

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const vKey = v => v.toLowerCase().replace(/\s+/g, '');
const qty  = o => parseInt(String(o.quantity || '0').replace(/,/g, '')) || 0;
const fmtNum = n => Number(n).toLocaleString();
const fmtDate = str => {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const statusClass = s => ({
  'In Progress': 'status-InProgress',
  'Complete':    'status-Complete',
  'Deleted':     'status-Deleted',
  'On Hold':     'status-OnHold',
  'Urgent':      'status-Urgent',
}[s] || 'status-InProgress');

// Pure helper: parse Excel paste data into orders
const parseExcelImport = (text, machines) => {
  const lines = text.split('\n').map(l => l.split('\t').map(c => c.trim()));
  if (lines.length < 2) return [];
  const h = lines[0].map(x => x.toLowerCase().trim());
  const newOrders = [];

  const parseDate = (raw) => {
    if (!raw) return '';
    if (typeof raw === 'number') {
      // Note: Excel's 1900-leap-year bug means dates before March 1900 will be off by one.
      const d = new Date(new Date(1900, 0, 1).getTime() + (raw - 2) * 86400000);
      return d.toISOString().split('T')[0];
    }
    const s = String(raw).trim();
    if (s.includes('/')) {
      const [d, m, y] = s.split('/');
      const yr = y.length === 2 ? (parseInt(y) < 50 ? '20' : '19') + y : y;
      if (parseInt(d) >= 1 && parseInt(d) <= 31 && parseInt(m) >= 1 && parseInt(m) <= 12) {
        return `${yr}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return '';
  };

  for (let i = 1; i < lines.length; i++) {
    const r = lines[i];
    const customer = r[h.indexOf('customer')] || '';
    if (!customer) continue;

    const validations = {};
    VALIDATIONS.forEach(v => {
      const colIdx = h.findIndex(header => v.toLowerCase().split(' ').every(t => header.includes(t)));
      const k = vKey(v);
      if (colIdx !== -1 && r[colIdx]) {
        const val = String(r[colIdx]).toLowerCase().trim();
        validations[k] = val === 'x' || val === 'y' || val === 'yes';
      } else {
        validations[k] = false;
      }
    });

    const pdIdx = h.findIndex(x => x.includes('production agreed') || (x.includes('production') && x.includes('date')) || x.includes('planning date'));
    const sdIdx = h.findIndex(x => x.includes('ship') && x.includes('date'));
    const machineIdx = h.indexOf('machine');
    let machineId = null;
    if (machineIdx !== -1 && r[machineIdx]) {
      const ms = String(r[machineIdx]).toLowerCase();
      const m = machines.find(x => ms.includes(x.name.toLowerCase()) || ms.includes(x.fullName.toLowerCase()));
      if (m) machineId = m.id;
    }

    newOrders.push({
      id: `${Date.now()}-${i}`, customer,
      worksOrder: r[h.findIndex(x => x.includes('works') && x.includes('order'))] || '',
      description: r[h.indexOf('description')] || '',
      spec: r[h.indexOf('spec')] || '',
      quantity: r[h.indexOf('quantity')] || '',
      status: r[h.indexOf('status')] || 'In Progress',
      planningDate: pdIdx !== -1 ? parseDate(r[pdIdx]) : '',
      shipsDate: sdIdx !== -1 ? parseDate(r[sdIdx]) : '',
      machineId, validations, notes: 'Imported', created: new Date().toISOString(),
    });
  }
  return newOrders;
};

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const CapBar = ({ pct, style = 'ok' }) => (
  <div className="cap-bar">
    <div className={`cap-bar-fill ${style}`} style={{ width: `${Math.min(pct, 100)}%` }} />
  </div>
);

const MetricCard = ({ label, value, sub, accent = 'blue', icon: Icon }) => (
  <div className={`metric-card ${accent}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="section-label">{label}</span>
      {Icon && <Icon size={16} color="var(--col-muted)" />}
    </div>
    <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, color: 'var(--col-text)', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--col-muted)' }}>{sub}</div>}
  </div>
);

const SectionLabel = ({ children }) => (
  <div className="section-label" style={{ marginBottom: 12 }}>{children}</div>
);

const LiveBadge = () => (
  <span className="badge badge-green" style={{ gap: 6 }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--col-green)', animation: 'pulse-dot 2s infinite', display: 'inline-block' }} />
    Live
  </span>
);

const MachineBadge = ({ name }) => name
  ? <span className="badge badge-blue font-mono">{name}</span>
  : <span className="badge badge-muted">—</span>;

// ─────────────────────────────────────────────
// Login Screen (Firebase Auth)
// ─────────────────────────────────────────────
const LoginScreen = ({ onSignIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!email || !password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSignIn(email, password);
    } catch (err) {
      console.error('Sign-in failed:', err);
      const code = err?.code || '';
      setError(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
          ? 'Invalid email or password'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts — try again later'
            : code === 'auth/network-request-failed'
              ? 'Network error — check your connection'
              : 'Sign-in failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, background: 'var(--col-yellow)', borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', boxShadow: '0 0 40px #f5c84240',
          }}>
            <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#0c0e12' }}>PT</span>
          </div>
          <h1 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--col-text)', letterSpacing: '-0.02em' }}>Production Tracker</h1>
          <p style={{ color: 'var(--col-muted)', fontSize: 13, marginTop: 4 }}>Weedon Corrugated Products</p>
        </div>

        <form className="card" style={{ padding: 32 }} onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <div className="section-label" style={{ marginBottom: 6 }}>Email</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input"
              style={{ fontSize: 15 }}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="section-label" style={{ marginBottom: 6 }}>Password</div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="input"
                style={{ paddingRight: 44, fontSize: 15 }}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--col-muted)' }}
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && (
            <div style={{ background: '#f8717110', border: '1px solid #f8717140', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: 'var(--col-red)' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px 0', fontSize: 15 }}
            disabled={submitting || !email || !password}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Import Modal (replaces DOM manipulation)
// ─────────────────────────────────────────────
const ImportModal = ({ onClose, onImport }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onImport(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="card"
        style={{ maxWidth: 720, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: 20, borderBottom: '1px solid var(--col-border)' }}>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 18, color: 'var(--col-text)' }}>Import from Excel</h2>
          <p style={{ fontSize: 13, color: 'var(--col-muted)', marginTop: 4 }}>
            Paste tab-separated data from Excel below. The first row should contain headers
            (Customer, Description, Quantity, Machine, etc.).
          </p>
        </div>
        <div style={{ padding: 20, flex: 1, overflow: 'auto' }}>
          <textarea
            className="input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste Excel data here (Ctrl+V)..."
            style={{ width: '100%', minHeight: 320, fontFamily: 'DM Mono, monospace', fontSize: 12, resize: 'vertical' }}
            autoFocus
          />
        </div>
        <div style={{ padding: 20, borderTop: '1px solid var(--col-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={handleImport} disabled={!text.trim() || busy}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('dashboard');
  const [filterMachine, setFilterMachine] = useState('All');
  const [filterDate, setFilterDate] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [sortBy, setSortBy] = useState('planningDate');
  const [sortDesc, setSortDesc] = useState(false);
  const [newOrder, setNewOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState({});
  const [validationFilter, setValidationFilter] = useState('all');
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [isLoadingFromSheets, setIsLoadingFromSheets] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [machines, setMachines] = useState(DEFAULT_MACHINES);
  const [showMigrateButton, setShowMigrateButton] = useState(false);

  const MACHINES = machines;

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── AUTH: subscribe to Firebase auth state ─────────
  useEffect(() => {
    const unsub = firebaseService.onAuthStateChanged(u => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub?.();
  }, []);

  const handleSignIn = useCallback(async (email, password) => {
    await firebaseService.signIn(email, password);
    // onAuthStateChanged will populate `user`
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await firebaseService.signOut();
      // Clear local state
      setOrders([]);
      setLastSyncTime(null);
      setView('dashboard');
    } catch (err) {
      console.error('Sign-out failed:', err);
      showToast('Failed to sign out', 'error');
    }
  }, [showToast]);

  // Capacity warning for new order
  const _nomid  = newOrder?.machineId;
  const _nopdate = newOrder?.planningDate || '';
  const _noqty   = newOrder?.quantity || '';

  const capacityWarning = useMemo(() => {
    if (!_nomid || !_nopdate || !_noqty) return null;
    const machine = machines.find(m => m.id === _nomid);
    if (!machine) return null;
    const newQty = parseInt(String(_noqty).replace(/,/g, '')) || 0;
    if (!newQty) return null;
    const existing = orders.filter(o => o.machineId === _nomid && o.planningDate === _nopdate && o.status !== 'Complete' && o.status !== 'Deleted');
    const existingQty = existing.reduce((s, o) => s + qty(o), 0);
    const total = existingQty + newQty;
    const avail = machine.availableCapacity;
    const pct = Math.round((total / avail) * 100);
    const isOver = total > avail * 1.05;
    const isNear = total >= avail * 0.9 && !isOver;
    const suggested = [];
    for (let i = 1; i <= 28 && suggested.length < 3; i++) {
      const d = new Date(_nopdate + 'T00:00:00');
      d.setDate(d.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const ds = d.toISOString().split('T')[0];
      const used = orders.filter(o => o.machineId === _nomid && o.planningDate === ds && o.status !== 'Complete' && o.status !== 'Deleted').reduce((s, o) => s + qty(o), 0);
      if (used + newQty <= avail) suggested.push({ date: ds, remaining: avail - used, dayName: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) });
    }
    return { machine, existingQty, newQty, total, avail, remaining: Math.max(0, avail - total), pct, isOver, isNear, existing, suggested };
  }, [_nomid, _nopdate, _noqty, orders, machines]);

  // Firebase data subscription — requires authenticated user
  useEffect(() => {
    if (!user) return;
    const unsubOrders = firebaseService.subscribeToOrders(data => {
      setOrders(data);
      setLastSyncTime(new Date());
      if (data.length === 0) {
        try {
          const stored = localStorage.getItem('orders-final');
          if (stored && JSON.parse(stored).length > 0) setShowMigrateButton(true);
        } catch (err) {
          console.error('Failed to read localStorage:', err);
        }
      }
      try {
        localStorage.setItem('orders-final', JSON.stringify(data));
      } catch (err) {
        console.error('Failed to write localStorage:', err);
      }
    });
    const unsubMachines = firebaseService.subscribeToMachines(data => {
      setMachines(data.length > 0 ? data : DEFAULT_MACHINES);
    });
    showToast('Connected to Firebase — real-time sync active', 'success');
    return () => { unsubOrders?.(); unsubMachines?.(); };
  }, [user, showToast]);

  // Save: parallel within chunks (Firestore batch limit is 500)
  const save = async (data) => {
    try {
      for (let i = 0; i < data.length; i += SAVE_CHUNK_SIZE) {
        const chunk = data.slice(i, i + SAVE_CHUNK_SIZE);
        await Promise.all(chunk.map(order => firebaseService.saveOrder(order)));
      }
      setLastSyncTime(new Date());
      try {
        localStorage.setItem('orders-final', JSON.stringify(data));
      } catch (err) {
        console.error('Failed to cache orders locally:', err);
      }
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Failed to save to Firebase', 'error');
      try {
        localStorage.setItem('orders-final', JSON.stringify(data));
      } catch (cacheErr) {
        console.error('Local cache also failed:', cacheErr);
      }
      setOrders(data);
    }
  };

  const initializeFirebase = async () => {
    setIsLoadingFromSheets(true);
    try {
      await firebaseService.initializeDefaultMachines();
      showToast('Firebase initialised', 'success');
    } catch (err) {
      console.error('Firebase init failed:', err);
      showToast('Failed to initialise', 'error');
    } finally {
      setIsLoadingFromSheets(false);
    }
  };

  const migrateFromGoogleSheets = async () => {
    setIsLoadingFromSheets(true);
    try {
      const { googleSheetsService } = await import('./google-sheets-service.js');
      const d = await googleSheetsService.fetchOrders();
      await firebaseService.importFromGoogleSheets(d);
      showToast(`Migrated ${d.length} orders`, 'success');
      setShowMigrateButton(false);
    } catch (err) {
      console.error('Migration failed:', err);
      showToast('Migration failed', 'error');
    } finally {
      setIsLoadingFromSheets(false);
    }
  };

  const deleteOrder = async (id) => {
    const o = orders.find(x => x.id === id);
    if (window.confirm(`DELETE ORDER?\n\nCustomer: ${o?.customer}\n\nThis cannot be undone!`)) {
      try {
        await firebaseService.deleteOrder(id);
        showToast('Order deleted', 'success');
      } catch (err) {
        console.error('Delete failed:', err);
        showToast('Failed to delete', 'error');
      }
    }
  };

  const toggleVal = async (id, key) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const updatedValidations = { ...order.validations, [key]: !order.validations[key] };
    const req = VALIDATIONS.filter(v => v !== 'Kick Off Meeting Required');
    const allDone = req.every(v => updatedValidations[vKey(v)]);
    const updated = { ...order, validations: updatedValidations, status: allDone ? 'Complete' : order.status };
    try {
      await firebaseService.saveOrder(updated);
      if (allDone && order.status !== 'Complete') showToast(`✓ Auto-completed: ${order.customer}`, 'success');
    } catch (err) {
      console.error('Validation toggle failed:', err);
      showToast('Failed to update', 'error');
    }
  };

  const updateOrder = async (id, updates) => {
    const order = orders.find(o => o.id === id);
    if (order) {
      try {
        await firebaseService.saveOrder({ ...order, ...updates });
      } catch (err) {
        console.error('Update failed:', err);
        showToast('Failed to update', 'error');
      }
    }
  };

  const updateEditingOrder = (id, field, value) => {
    setEditingOrder(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };

  const saveEditingOrder = (id) => {
    if (editingOrder[id]) {
      updateOrder(id, editingOrder[id]);
      setEditingOrder(prev => { const s = { ...prev }; delete s[id]; return s; });
    }
  };

  const initNewOrder = () => setNewOrder({
    id: `new-${Date.now()}`, customer: '', worksOrder: '', description: '', spec: '',
    quantity: '', status: 'In Progress', planningDate: '', shipsDate: '', machineId: null,
    validations: Object.fromEntries(VALIDATIONS.map(v => [vKey(v), false])),
    notes: '', created: new Date().toISOString(),
  });

  const saveNewOrder = async () => {
    if (newOrder?.customer) {
      try {
        await firebaseService.saveOrder({ ...newOrder, id: `${Date.now()}`, created: new Date().toISOString() });
        setNewOrder(null);
        setView('active');
        showToast('Order created and synced', 'success');
      } catch (err) {
        console.error('Save new order failed:', err);
        showToast('Failed to save order', 'error');
      }
    } else {
      showToast('Please enter a customer name', 'error');
    }
  };

  const cancelNewOrder = () => {
    if (newOrder?.customer || newOrder?.description) {
      if (window.confirm('Discard this order?')) setNewOrder(null);
    } else {
      setNewOrder(null);
    }
  };

  // Import handler — uses extracted pure parser, no DOM manipulation
  const handleImport = async (text) => {
    const newOrders = parseExcelImport(text, MACHINES);
    if (newOrders.length === 0) {
      showToast('No valid orders found in pasted data', 'error');
      return;
    }
    await save([...orders, ...newOrders]);
    showToast(`Imported ${newOrders.length} orders`, 'success');
    setShowImportModal(false);
  };

  const exportData = () => {
    const csv = [
      ['Customer', 'Works Order', 'Description', 'Spec', 'Quantity', 'Status', 'Machine', 'Planning Date', 'Ship Date', ...VALIDATIONS, 'Notes'],
      ...orders.map(o => [
        o.customer, o.worksOrder || '', o.description, o.spec, o.quantity, o.status,
        MACHINES.find(m => m.id === o.machineId)?.name || '',
        o.planningDate, o.shipsDate,
        ...VALIDATIONS.map(v => o.validations?.[vKey(v)] ? 'x' : ''),
        o.notes || '',
      ]),
    ].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `production-orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Analytics
  const analytics = useMemo(() => {
    const act = orders.filter(o => o.status !== 'Deleted');
    const todayStr = new Date().toISOString().split('T')[0];
    const forecast = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      MACHINES.forEach(machine => {
        const ods = act.filter(o => o.machineId === machine.id && o.planningDate === ds);
        const ns = ods.reduce((s, o) => s + qty(o), 0);
        const stock = Math.round(machine.capacity * (machine.stockPercentage / 100));
        if (ns > 0) forecast.push({
          date: ds, machine: machine.name, machineId: machine.id,
          nonStockUsed: ns, stockReserved: stock,
          totalCapacity: machine.capacity, availableCapacity: machine.availableCapacity,
          pctAvail: Math.round((ns / machine.availableCapacity) * 100),
          pctTotal: Math.round(((ns + stock) / machine.capacity) * 100),
          isOver: ns > machine.availableCapacity * 1.05,
          isNear: ns >= machine.availableCapacity * 0.9 && ns <= machine.availableCapacity * 1.05,
        });
      });
    }
    const machineUtil = MACHINES.map(machine => {
      const mos = act.filter(o => o.machineId === machine.id && o.planningDate >= todayStr);
      const total = mos.reduce((s, o) => s + qty(o), 0);
      const days = new Set(mos.map(o => o.planningDate)).size;
      const avg = days > 0 ? total / days : 0;
      return {
        machine: machine.name, fullName: machine.fullName, orders: mos.length,
        totalQuantity: total, scheduledDays: days, avgPerDay: Math.round(avg),
        availableCapacity: machine.availableCapacity,
        utilisationPercent: Math.round((avg / machine.availableCapacity) * 100),
      };
    });
    const validationStats = {};
    VALIDATIONS.forEach(v => {
      const k = vKey(v);
      const done = act.filter(o => o.validations?.[k]).length;
      validationStats[v] = { completed: done, total: act.length, percentage: act.length > 0 ? Math.round((done / act.length) * 100) : 0 };
    });
    const bottlenecks = Object.entries(validationStats)
      .filter(([v]) => v !== 'Kick Off Meeting Required')
      .sort((a, b) => a[1].percentage - b[1].percentage)
      .slice(0, 3)
      .filter(([, s]) => s.percentage < 80 && s.total > 0);
    const kickOffRequired = act.filter(o => o.validations?.kickoffmeetingrequired);
    const ordersWithDates = act.filter(o => o.planningDate && o.created);
    const avgLeadTime = ordersWithDates.length > 0
      ? Math.round(ordersWithDates.reduce((s, o) => s + Math.max(0, Math.ceil((new Date(o.planningDate) - new Date(o.created)) / 86400000)), 0) / ordersWithDates.length)
      : 0;
    return {
      totalActive: act.length, totalCompleted: orders.filter(o => o.status === 'Complete').length,
      overCapacityDays: forecast.filter(f => f.isOver).length,
      nearCapacityDays: forecast.filter(f => f.isNear).length,
      forecast: forecast.sort((a, b) => new Date(a.date) - new Date(b.date)),
      machineUtil, validationStats, bottlenecks, kickOffRequired, avgLeadTime,
    };
  }, [orders, MACHINES]);

  // ─── DERIVED LISTS (memoized) ──────────────────────
  const active    = useMemo(() => orders.filter(o => o.status !== 'Complete' && o.status !== 'Deleted'), [orders]);
  const completed = useMemo(() => orders.filter(o => o.status === 'Complete'), [orders]);
  const deleted   = useMemo(() => orders.filter(o => o.status === 'Deleted'), [orders]);
  const matNeeded = useMemo(() => active.filter(o => !o.validations?.materialpurchasing), [active]);

  const display = useMemo(() => {
    let list = view === 'active' ? active
             : view === 'completed' ? completed
             : view === 'deleted' ? deleted
             : view === 'materialneeded' ? matNeeded
             : orders;

    if (searchFilter && view !== 'dashboard') {
      const s = searchFilter.toLowerCase();
      list = list.filter(o =>
        o.customer?.toLowerCase().includes(s) || o.spec?.toLowerCase().includes(s) ||
        o.worksOrder?.toLowerCase().includes(s) || o.description?.toLowerCase().includes(s)
      );
    }
    if (view === 'active' && validationFilter !== 'all') {
      if (validationFilter === 'materialpurchasing') list = list.filter(o => !o.validations?.materialpurchasing);
      if (validationFilter === 'pending') list = list.filter(o => VALIDATIONS.some(v => !o.validations?.[vKey(v)]));
    }
    return [...list].sort((a, b) => {
      let av = a[sortBy] || '', bv = b[sortBy] || '';
      if (sortBy === 'planningDate') { av = new Date(av || '9999-12-31'); bv = new Date(bv || '9999-12-31'); }
      const cmp = av > bv ? 1 : av < bv ? -1 : 0;
      return sortDesc ? -cmp : cmp;
    });
  }, [view, orders, active, completed, deleted, matNeeded, searchFilter, validationFilter, sortBy, sortDesc]);

  // ─────────────────────────────────────────────
  // AUTH GATES
  // ─────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="login-wrap">
        <div style={{ color: 'var(--col-muted)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginScreen onSignIn={handleSignIn} />
        {toast && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200 }}>
            <div className={`toast ${toast.type} animate-toast-in`}>
              <span style={{ fontSize: 18 }}>{toast.type === 'error' ? '⚠' : '✓'}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{toast.message}</span>
            </div>
          </div>
        )}
      </>
    );
  }

  // ─────────────────────────────────────────────
  // MAIN APP
  // ─────────────────────────────────────────────
  return (
    <>
      <div style={{ minHeight: '100vh', background: 'var(--col-bg)' }}>

        {/* ── HEADER ── */}
        <header style={{
          background: 'var(--col-surface)',
          borderBottom: '1px solid var(--col-border)',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
              {/* Brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, background: 'var(--col-yellow)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 12, color: '#0c0e12' }}>PT</span>
                </div>
                <div>
                  <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--col-text)', lineHeight: 1.2 }}>Production Tracker</div>
                  <div style={{ fontSize: 10, color: 'var(--col-muted)', lineHeight: 1, fontFamily: 'DM Mono,monospace', letterSpacing: '0.06em' }}>WEEDON CORRUGATED</div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {lastSyncTime && <LiveBadge />}
                {user?.email && (
                  <span style={{ fontSize: 12, color: 'var(--col-muted)', fontFamily: 'DM Mono,monospace' }}>
                    {user.email}
                  </span>
                )}
                {showMigrateButton && (
                  <button className="btn btn-ghost" onClick={migrateFromGoogleSheets} disabled={isLoadingFromSheets}>
                    <Upload size={14} />{isLoadingFromSheets ? 'Migrating…' : 'Migrate'}
                  </button>
                )}
                {orders.length === 0 && (
                  <button className="btn btn-ghost" onClick={initializeFirebase}>Initialise</button>
                )}
                <button className="btn btn-primary" onClick={() => { initNewOrder(); setView('neworder'); }}>
                  <Plus size={14} />New Order
                </button>
                <button className="btn btn-ghost" onClick={() => setShowImportModal(true)}><Upload size={14} />Import</button>
                <button className="btn btn-ghost" onClick={exportData}><Download size={14} />Export</button>
                <button className="btn btn-danger" onClick={() => setShowClearModal(true)} aria-label="Clear all orders"><X size={14} /></button>
                <button className="btn btn-ghost" onClick={handleSignOut} aria-label="Sign out"><LogOut size={14} /></button>
              </div>
            </div>
          </div>

          {/* Nav tabs */}
          <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px 0', display: 'flex', gap: 4, paddingBottom: 10, paddingTop: 2, overflowX: 'auto' }}>
            {[
              { id: 'dashboard',     label: 'Dashboard',  icon: TrendingUp },
              { id: 'active',        label: 'Active',     count: active.length },
              { id: 'materialneeded',label: 'Materials',  count: matNeeded.length, alert: true },
              { id: 'capacity',      label: 'Capacity',   icon: Calendar },
              { id: 'completed',     label: 'Completed',  count: completed.length },
              { id: 'all',           label: 'All Orders' },
              { id: 'neworder',      label: 'New Order',  icon: Plus },
            ].map(tab => (
              <button
                key={tab.id}
                className={`nav-tab${view === tab.id ? ' active' : tab.alert && tab.count > 0 ? ' alert-tab' : ''}`}
                onClick={() => { if (tab.id === 'neworder' && !newOrder) initNewOrder(); setView(tab.id); }}
              >
                {tab.icon && <tab.icon size={13} />}
                {tab.label}
                {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
              </button>
            ))}
          </div>
        </header>

        {/* ── CONTENT ── */}
        <main style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 24px 64px' }}>

          {/* ══════════ NEW ORDER ══════════ */}
          {view === 'neworder' && newOrder && (
            <div style={{ maxWidth: 800, margin: '0 auto' }} className="animate-fade-in">
              <div className="card">
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--col-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 20, color: 'var(--col-text)' }}>Create New Order</h2>
                    <p style={{ color: 'var(--col-muted)', fontSize: 13, marginTop: 2 }}>Fill in the order details below</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={saveNewOrder}>Save Order</button>
                    <button className="btn btn-ghost" onClick={cancelNewOrder}>Cancel</button>
                  </div>
                </div>

                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Basic Info */}
                  <div className="card-2" style={{ padding: 20 }}>
                    <SectionLabel>Basic Information</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'Customer Name *', field: 'customer', placeholder: 'Enter customer name' },
                        { label: 'Works Order Number', field: 'worksOrder', placeholder: 'e.g. WO-2024-001' },
                        { label: 'Description', field: 'description', placeholder: 'Order description' },
                        { label: 'Specification', field: 'spec', placeholder: 'e.g. C-Flute, 200gsm' },
                        { label: 'Quantity (feeds)', field: 'quantity', placeholder: '50000' },
                      ].map(({ label, field, placeholder }) => (
                        <div key={field}>
                          <div className="section-label" style={{ marginBottom: 6 }}>{label}</div>
                          <input className="input" placeholder={placeholder} value={newOrder[field] || ''} onChange={e => setNewOrder({ ...newOrder, [field]: e.target.value })} autoFocus={field === 'customer'} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Production Details */}
                  <div className="card-2" style={{ padding: 20 }}>
                    <SectionLabel>Production Details</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <div className="section-label" style={{ marginBottom: 6 }}>Machine</div>
                        <select className="input" value={newOrder.machineId || ''} onChange={e => setNewOrder({ ...newOrder, machineId: parseInt(e.target.value) || null })}>
                          <option value="">Select Machine</option>
                          {MACHINES.map(m => <option key={m.id} value={m.id}>{m.name} — {m.fullName}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="section-label" style={{ marginBottom: 6 }}>Planning Date</div>
                        <input type="date" className="input" value={newOrder.planningDate} onChange={e => setNewOrder({ ...newOrder, planningDate: e.target.value })} />
                      </div>
                      <div>
                        <div className="section-label" style={{ marginBottom: 6 }}>Ship Date</div>
                        <input type="date" className="input" value={newOrder.shipsDate} onChange={e => setNewOrder({ ...newOrder, shipsDate: e.target.value })} />
                      </div>
                    </div>

                    {/* Capacity Warning */}
                    {capacityWarning && (
                      <div style={{
                        marginTop: 16,
                        border: `1.5px solid ${capacityWarning.isOver ? '#f8717140' : capacityWarning.isNear ? '#fb923c40' : '#34d39940'}`,
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          padding: '10px 16px',
                          background: capacityWarning.isOver ? '#f8717115' : capacityWarning.isNear ? '#fb923c12' : '#34d39912',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: capacityWarning.isOver ? 'var(--col-red)' : capacityWarning.isNear ? 'var(--col-orange)' : 'var(--col-green)' }}>
                            {capacityWarning.isOver ? '⚠ OVER CAPACITY' : capacityWarning.isNear ? '⚡ NEAR CAPACITY' : '✓ CAPACITY OK'} — {capacityWarning.machine.name} · {fmtDate(newOrder.planningDate)}
                          </span>
                          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 20, color: capacityWarning.isOver ? 'var(--col-red)' : capacityWarning.isNear ? 'var(--col-orange)' : 'var(--col-green)' }}>
                            {capacityWarning.pct}%
                          </span>
                        </div>
                        <div style={{ padding: '12px 16px' }}>
                          <div style={{ height: 24, background: 'var(--col-border2)', borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
                            <div style={{ width: `${Math.min((capacityWarning.existingQty / capacityWarning.avail) * 100, 100)}%`, background: 'var(--col-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 600 }}>
                              {(capacityWarning.existingQty / capacityWarning.avail) * 100 > 12 && 'Existing'}
                            </div>
                            <div style={{
                              width: `${Math.min((capacityWarning.newQty / capacityWarning.avail) * 100, 100 - Math.min((capacityWarning.existingQty / capacityWarning.avail) * 100, 100))}%`,
                              background: capacityWarning.isOver ? 'var(--col-red)' : capacityWarning.isNear ? 'var(--col-orange)' : 'var(--col-blue)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 600,
                            }}>
                              {(capacityWarning.newQty / capacityWarning.avail) * 100 > 10 && 'New'}
                            </div>
                            {!capacityWarning.isOver && <div style={{ flex: 1, background: '#34d39930' }} />}
                          </div>
                          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--col-muted)', flexWrap: 'wrap' }}>
                            <span>Existing: <b style={{ color: 'var(--col-text)' }}>{fmtNum(capacityWarning.existingQty)}</b></span>
                            <span>This order: <b style={{ color: 'var(--col-text)' }}>{fmtNum(capacityWarning.newQty)}</b></span>
                            <span>Available: <b style={{ color: 'var(--col-blue)' }}>{fmtNum(capacityWarning.avail)}</b></span>
                            <span style={{ marginLeft: 'auto' }}>Total: <b style={{ color: capacityWarning.isOver ? 'var(--col-red)' : 'var(--col-text)' }}>{fmtNum(capacityWarning.total)}</b></span>
                          </div>
                          {(capacityWarning.isOver || capacityWarning.isNear) && capacityWarning.suggested.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div className="section-label" style={{ marginBottom: 8 }}>💡 Alternative dates</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {capacityWarning.suggested.map(s => (
                                  <button key={s.date} onClick={() => setNewOrder({ ...newOrder, planningDate: s.date })}
                                    style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--col-surface2)', border: '1px solid var(--col-border2)', cursor: 'pointer', color: 'var(--col-blue)', fontSize: 12, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', transition: 'all 0.15s' }}>
                                    {s.dayName}
                                    <span style={{ color: 'var(--col-muted)', fontWeight: 400 }}>{fmtNum(s.remaining)} avail.</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Validations */}
                  <div className="card-2" style={{ padding: 20 }}>
                    <SectionLabel>Validation Checklist</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {VALIDATIONS.map(v => {
                        const k = vKey(v);
                        const checked = newOrder.validations?.[k] || false;
                        return (
                          <label key={v} className={`val-item${checked ? ' checked' : ''}`}>
                            <div className="val-check">{checked && <CheckCircle2 size={12} color="#0c0e12" />}</div>
                            <span style={{ fontSize: 12, fontWeight: checked ? 600 : 400, color: checked ? 'var(--col-green)' : 'var(--col-text)' }}>{v}</span>
                            <input type="checkbox" checked={checked} onChange={() => setNewOrder({ ...newOrder, validations: { ...newOrder.validations, [k]: !checked } })} style={{ display: 'none' }} />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="card-2" style={{ padding: 20 }}>
                    <SectionLabel>Notes</SectionLabel>
                    <textarea className="input" rows={3} placeholder="Add any additional notes…" style={{ resize: 'none' }}
                      value={newOrder.notes} onChange={e => setNewOrder({ ...newOrder, notes: e.target.value })} />
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '14px 0', fontSize: 15 }} onClick={saveNewOrder}>✓ Save Order</button>
                    <button className="btn btn-ghost" style={{ padding: '14px 24px' }} onClick={cancelNewOrder}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════ DASHBOARD ══════════ */}
          {view === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <MetricCard label="Active Orders" value={analytics.totalActive} accent="blue" icon={Package} />
                <MetricCard label="Completed" value={analytics.totalCompleted} accent="green" icon={CheckCircle2} />
                <MetricCard label="Avg Lead Time" value={`${analytics.avgLeadTime}d`} sub="order to production" accent="yellow" icon={Clock} />
                <MetricCard label="Capacity Alerts" value={analytics.overCapacityDays} sub="days over capacity" accent="red" icon={AlertCircle} />
              </div>

              {(analytics.overCapacityDays > 0 || analytics.bottlenecks.length > 0 || analytics.kickOffRequired?.length > 0) && (
                <div style={{ background: '#f8717108', border: '1px solid #f8717130', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <AlertTriangle size={18} color="var(--col-red)" />
                    <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--col-red)' }}>Production Alerts</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {analytics.overCapacityDays > 0 && (
                      <div style={{ background: 'var(--col-surface)', border: '1px solid var(--col-border)', borderLeft: '3px solid var(--col-red)', borderRadius: 8, padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--col-text)' }}>⚠ {analytics.overCapacityDays} day(s) over capacity in next 14 days</div>
                        <div style={{ fontSize: 12, color: 'var(--col-muted)', marginTop: 3 }}>Review capacity tab to redistribute workload</div>
                      </div>
                    )}
                    {analytics.bottlenecks.map(([v, s]) => (
                      <div key={v} style={{ background: 'var(--col-surface)', border: '1px solid var(--col-border)', borderLeft: '3px solid var(--col-yellow)', borderRadius: 8, padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--col-text)' }}>📋 {v}: {s.percentage}% complete ({s.completed}/{s.total})</div>
                        <div style={{ fontSize: 12, color: 'var(--col-muted)', marginTop: 3 }}>Blocking progress on multiple orders</div>
                      </div>
                    ))}
                    {analytics.kickOffRequired?.length > 0 && (
                      <div style={{ background: 'var(--col-surface)', border: '1px solid var(--col-border)', borderLeft: '3px solid var(--col-blue)', borderRadius: 8, padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--col-text)' }}>📅 {analytics.kickOffRequired.length} order(s) requiring kick-off meeting</div>
                        <div style={{ fontSize: 12, color: 'var(--col-muted)', marginTop: 3 }}>{analytics.kickOffRequired.slice(0, 3).map(o => o.customer).join(', ')}{analytics.kickOffRequired.length > 3 && ` +${analytics.kickOffRequired.length - 3} more`}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 14-Day Forecast */}
              <div className="card">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--col-border)' }}>
                  <SectionLabel>14-Day Capacity Forecast</SectionLabel>
                </div>
                <div style={{ padding: 20 }}>
                  {analytics.forecast.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--col-muted)', fontSize: 14 }}>No scheduled production in the next 14 days</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {analytics.forecast.slice(0, 8).map((f, i) => (
                        <div key={i} style={{
                          display: 'grid', gridTemplateColumns: '120px 1fr 72px',
                          alignItems: 'center', gap: 16, padding: '12px 16px',
                          borderRadius: 8, background: f.isOver ? '#f8717108' : f.isNear ? '#fb923c08' : 'var(--col-surface2)',
                          border: `1px solid ${f.isOver ? '#f8717130' : f.isNear ? '#fb923c30' : 'var(--col-border)'}`,
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--col-text)' }}>{fmtDate(f.date)}</div>
                            <MachineBadge name={f.machine} />
                          </div>
                          <div>
                            <CapBar pct={f.pctAvail} style={f.isOver ? 'over' : f.isNear ? 'warn' : 'ok'} />
                            <div style={{ fontSize: 11, color: 'var(--col-muted)', marginTop: 4 }}>
                              {fmtNum(f.nonStockUsed)} / {fmtNum(f.availableCapacity)} available feeds
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: f.isOver ? 'var(--col-red)' : f.isNear ? 'var(--col-orange)' : 'var(--col-blue)' }}>{f.pctAvail}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Machine Utilisation */}
              <div className="card">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--col-border)' }}>
                  <SectionLabel>Machine Utilisation</SectionLabel>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0 }}>
                  {analytics.machineUtil.map((m, i) => {
                    const over = m.utilisationPercent >= 105;
                    const near = m.utilisationPercent >= 90 && !over;
                    const col = over ? 'var(--col-red)' : near ? 'var(--col-orange)' : 'var(--col-blue)';
                    return (
                      <div key={m.machine} style={{
                        padding: 20,
                        borderRight: i % 2 === 0 ? '1px solid var(--col-border)' : 'none',
                        borderBottom: i < 2 ? '1px solid var(--col-border)' : 'none',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 18, color: 'var(--col-text)' }}>{m.machine}</div>
                            <div style={{ fontSize: 12, color: 'var(--col-muted)' }}>{m.fullName}</div>
                          </div>
                          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 28, color: col }}>{m.utilisationPercent}%</div>
                        </div>
                        <CapBar pct={m.utilisationPercent} style={over ? 'over' : near ? 'warn' : 'ok'} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                          {[
                            { label: 'Orders', val: m.orders },
                            { label: 'Avg/Day', val: fmtNum(m.avgPerDay) },
                            { label: 'Capacity', val: fmtNum(m.availableCapacity) },
                          ].map(({ label, val }) => (
                            <div key={label} style={{ background: 'var(--col-surface2)', borderRadius: 6, padding: '8px 10px' }}>
                              <div className="section-label">{label}</div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--col-text)', marginTop: 2 }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══════════ CAPACITY PLANNING ══════════ */}
          {view === 'capacity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {MACHINES.map(machine => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const mos = active.filter(o => o.machineId === machine.id && o.planningDate >= todayStr);
                  const total = mos.reduce((s, o) => s + qty(o), 0);
                  const days = new Set(mos.map(o => o.planningDate)).size;
                  const avg = days > 0 ? total / days : 0;
                  const pct = Math.round((avg / machine.availableCapacity) * 100);
                  const stock = Math.round(machine.capacity * (machine.stockPercentage / 100));
                  const over = pct > 105, near = pct >= 90 && !over;
                  const col = over ? 'var(--col-red)' : near ? 'var(--col-orange)' : 'var(--col-blue)';
                  return (
                    <div key={machine.id} className="card" style={{ padding: 16, border: `1px solid ${over ? '#f8717130' : near ? '#fb923c30' : 'var(--col-border)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--col-text)' }}>{machine.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--col-muted)' }}>{machine.fullName}</div>
                        </div>
                        <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 24, color: col }}>{pct}%</div>
                      </div>
                      <CapBar pct={pct} style={over ? 'over' : near ? 'warn' : 'ok'} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10, fontSize: 11 }}>
                        {[
                          { l: 'Avg/Day', v: fmtNum(Math.round(avg)) },
                          { l: 'Available', v: fmtNum(machine.availableCapacity) },
                          { l: 'Stock Alloc.', v: fmtNum(stock) },
                          { l: 'Days Booked', v: days },
                        ].map(({ l, v }) => (
                          <div key={l} style={{ background: 'var(--col-surface2)', borderRadius: 5, padding: '5px 8px' }}>
                            <div className="section-label" style={{ fontSize: 9 }}>{l}</div>
                            <div style={{ fontWeight: 600, color: 'var(--col-text)', marginTop: 1 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, textAlign: 'center', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: over ? '#f8717115' : near ? '#fb923c12' : '#34d39910', color: col }}>
                        {over ? '⚠ OVER CAPACITY' : near ? '⚡ NEAR CAPACITY' : '✓ OK'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                  <div>
                    <div className="section-label" style={{ marginBottom: 6 }}>Filter by Machine</div>
                    <select className="input" value={filterMachine} onChange={e => setFilterMachine(e.target.value)}>
                      <option value="All">All Machines</option>
                      {MACHINES.map(m => <option key={m.id} value={m.id}>{m.name} — {m.fullName}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="section-label" style={{ marginBottom: 6 }}>Filter by Date</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="date" className="input" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                      {filterDate && <button className="btn btn-ghost" onClick={() => setFilterDate('')} aria-label="Clear date filter"><X size={13} /></button>}
                    </div>
                  </div>
                </div>
              </div>

              {MACHINES.filter(m => filterMachine === 'All' || m.id === parseInt(filterMachine)).map(machine => {
                const stockRes = Math.round(machine.capacity * (machine.stockPercentage / 100));
                const dates = Array.from(new Set(
                  orders.filter(o => o.planningDate && o.status !== 'Complete' && o.status !== 'Deleted' && (!filterDate || o.planningDate === filterDate)).map(o => o.planningDate)
                )).sort();

                const machineOrders = dates.map(date => {
                  const ods = orders.filter(o => o.machineId === machine.id && o.planningDate === date && o.status !== 'Complete' && o.status !== 'Deleted');
                  const ns = ods.reduce((s, o) => s + qty(o), 0);
                  return {
                    date, orders: ods, ns, stockRes,
                    avail: machine.availableCapacity,
                    total: machine.capacity,
                    remaining: Math.max(0, machine.availableCapacity - ns),
                    pct: Math.round((ns / machine.availableCapacity) * 100),
                    isOver: ns > machine.availableCapacity * 1.05,
                    isNear: ns >= machine.availableCapacity * 0.9 && ns <= machine.availableCapacity * 1.05,
                  };
                }).filter(d => d.orders.length > 0);

                if (!machineOrders.length) return null;

                return (
                  <div key={machine.id} className="card">
                    <div className="machine-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 42, height: 42, background: 'var(--col-yellow)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 12, color: '#0c0e12' }}>
                          {machine.name}
                        </div>
                        <div>
                          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--col-text)' }}>{machine.fullName}</div>
                          <div style={{ fontSize: 11, color: 'var(--col-muted)', fontFamily: 'DM Mono,monospace' }}>
                            Total {fmtNum(machine.capacity)} · Stock {fmtNum(stockRes)} ({machine.stockPercentage}%) · Available {fmtNum(machine.availableCapacity)}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: 'var(--col-muted)' }}>{machineOrders.length} day(s)</div>
                        <div style={{ fontWeight: 600, color: 'var(--col-text)' }}>{machineOrders.reduce((s, d) => s + d.orders.length, 0)} orders</div>
                      </div>
                    </div>

                    {machineOrders.map(day => {
                      const dd = new Date(day.date + 'T00:00:00');
                      const col = day.isOver ? 'var(--col-red)' : day.isNear ? 'var(--col-orange)' : 'var(--col-blue)';
                      const stockPct = (day.stockRes / day.total) * 100;
                      const nsPct = Math.min((day.ns / day.total) * 100, 100 - stockPct);
                      const remPct = Math.max(0, 100 - stockPct - nsPct);

                      return (
                        <div key={day.date} className={`day-row${day.isOver ? ' over' : day.isNear ? ' near' : ''}`}>
                          <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr 64px', gap: 16, alignItems: 'center', marginBottom: 14 }}>
                            <div style={{
                              background: 'var(--col-surface2)', border: `1px solid ${day.isOver ? '#f8717130' : day.isNear ? '#fb923c30' : 'var(--col-border)'}`,
                              borderRadius: 8, textAlign: 'center', padding: '8px 4px',
                            }}>
                              <div style={{ fontSize: 9, fontFamily: 'DM Mono,monospace', color: col, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{dd.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--col-text)', lineHeight: 1 }}>{dd.getDate()}</div>
                              <div style={{ fontSize: 9, color: 'var(--col-muted)', fontFamily: 'DM Mono,monospace' }}>{dd.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</div>
                            </div>

                            <div>
                              <div style={{ height: 28, background: 'var(--col-border2)', borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 6 }}>
                                <div style={{ width: `${stockPct}%`, background: 'var(--col-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 600 }}>
                                  {stockPct > 10 && 'Stock'}
                                </div>
                                <div style={{ width: `${nsPct}%`, background: day.isOver ? 'var(--col-red)' : day.isNear ? 'var(--col-orange)' : 'var(--col-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 600 }}>
                                  {nsPct > 8 && fmtNum(day.ns)}
                                </div>
                                <div style={{ width: `${remPct}%`, background: '#34d39920', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--col-green)', fontWeight: 600 }}>
                                  {remPct > 8 && fmtNum(day.remaining)}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--col-muted)' }}>
                                <span>Stock <b style={{ color: 'var(--col-text)' }}>{fmtNum(day.stockRes)}</b></span>
                                <span>Orders <b style={{ color: col }}>{fmtNum(day.ns)}</b></span>
                                <span>Remaining <b style={{ color: 'var(--col-green)' }}>{fmtNum(day.remaining)}</b></span>
                                <span style={{ marginLeft: 'auto' }}>Total <b style={{ color: 'var(--col-text)' }}>{fmtNum(day.total)}</b></span>
                              </div>
                            </div>

                            <div style={{ textAlign: 'center', background: day.isOver ? '#f8717115' : day.isNear ? '#fb923c12' : '#34d39910', borderRadius: 8, padding: '10px 4px' }}>
                              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 20, color: col }}>{day.pct}%</div>
                              <div style={{ fontSize: 9, color: col, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{day.isOver ? 'OVER' : day.isNear ? 'NEAR' : 'OK'}</div>
                            </div>
                          </div>

                          {day.isOver && (
                            <div style={{ marginBottom: 12, padding: '8px 14px', background: '#f8717115', border: '1px solid #f8717130', borderRadius: 6, fontSize: 12, color: 'var(--col-red)', fontWeight: 600 }}>
                              ⚠ Over capacity by {fmtNum(day.ns - Math.round(day.avail * 1.05))} feeds — consider rescheduling
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 84 }}>
                            {day.orders.map(o => (
                              <div key={o.id} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: 'var(--col-surface)', border: '1px solid var(--col-border)',
                                borderRadius: 7, padding: '8px 14px', transition: 'border-color 0.15s',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                  <div style={{ width: 3, height: 28, borderRadius: 2, background: day.isOver ? 'var(--col-red)' : day.isNear ? 'var(--col-orange)' : 'var(--col-blue)', flexShrink: 0 }} />
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--col-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer}</div>
                                    {(o.description || o.worksOrder) && <div style={{ fontSize: 11, color: 'var(--col-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}{o.worksOrder && ` · ${o.worksOrder}`}</div>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
                                  {o.spec && <span style={{ fontSize: 11, background: 'var(--col-surface2)', color: 'var(--col-muted)', padding: '2px 8px', borderRadius: 4, fontFamily: 'DM Mono,monospace' }}>{o.spec}</span>}
                                  <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--col-text)' }}>{fmtNum(qty(o))}</span>
                                  <span style={{ fontSize: 10, color: 'var(--col-muted)', fontFamily: 'DM Mono,monospace' }}>feeds</span>
                                  <span className={`status-pill ${statusClass(o.status)}`}>{o.status}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════ ORDERS LIST ══════════ */}
          {(view === 'active' || view === 'completed' || view === 'all' || view === 'materialneeded') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="animate-fade-in">

              {view === 'materialneeded' && (
                <div style={{ background: '#f5c84210', border: '1px solid #f5c84240', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 28 }}>📦</span>
                  <div>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--col-yellow)' }}>Material Purchasing Queue</div>
                    <div style={{ fontSize: 13, color: 'var(--col-muted)', marginTop: 3 }}>{matNeeded.length} order(s) awaiting material purchasing — tick the checkbox when materials are ordered.</div>
                  </div>
                </div>
              )}

              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: view === 'active' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--col-muted)' }} />
                    <input className="input" style={{ paddingLeft: 32 }} placeholder="Search customer, works order, spec…" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
                    {searchFilter && <button onClick={() => setSearchFilter('')} aria-label="Clear search" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--col-muted)' }}><X size={14} /></button>}
                  </div>
                  <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="planningDate">Sort by Planning Date</option>
                    <option value="customer">Sort by Customer</option>
                    <option value="status">Sort by Status</option>
                  </select>
                  {view === 'active' && (
                    <select className="input" value={validationFilter} onChange={e => setValidationFilter(e.target.value)}>
                      <option value="all">All Active ({active.length})</option>
                      <option value="materialpurchasing">Material Purchasing Needed ({matNeeded.length})</option>
                      <option value="pending">Any Validations Pending ({active.filter(o => VALIDATIONS.some(v => !o.validations?.[vKey(v)])).length})</option>
                    </select>
                  )}
                </div>
                {(searchFilter || validationFilter !== 'all') && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {searchFilter && <span className="badge badge-blue">"{searchFilter}" <button onClick={() => setSearchFilter('')} aria-label="Clear search" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', paddingLeft: 4 }}><X size={10} /></button></span>}
                    {validationFilter !== 'all' && <span className="badge badge-yellow">{validationFilter === 'materialpurchasing' ? '📦 Material Purchasing' : '⏳ Pending Validations'} <button onClick={() => setValidationFilter('all')} aria-label="Clear validation filter" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', paddingLeft: 4 }}><X size={10} /></button></span>}
                    <button onClick={() => { setSearchFilter(''); setValidationFilter('all'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--col-muted)', fontSize: 12, textDecoration: 'underline' }}>Clear all</button>
                  </div>
                )}
              </div>

              {display.length === 0 ? (
                <div className="card" style={{ padding: 60, textAlign: 'center' }}>
                  <Package size={40} style={{ margin: '0 auto 16px', color: 'var(--col-dim)' }} />
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--col-muted)' }}>No orders found</div>
                  <div style={{ fontSize: 13, color: 'var(--col-dim)', marginTop: 6 }}>{searchFilter ? 'Try adjusting your search' : 'Create a new order to get started'}</div>
                </div>
              ) : display.map(order => {
                const isExpanded = expandedOrder === order.id;
                const machine = MACHINES.find(m => m.id === order.machineId);
                const validDone = VALIDATIONS.filter(v => v !== 'Kick Off Meeting Required' && order.validations?.[vKey(v)]).length;
                const validTotal = VALIDATIONS.filter(v => v !== 'Kick Off Meeting Required').length;
                const pct = Math.round((validDone / validTotal) * 100);

                return (
                  <div key={order.id} className={`order-row${isExpanded ? ' expanded' : ''}`}>
                    <div className="order-header" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.5fr 1fr 1fr 32px', gap: 16, alignItems: 'center' }}>
                        <div>
                          <div className="section-label" style={{ marginBottom: 4 }}>Customer</div>
                          <input className="inline-input" style={{ fontWeight: 700, fontSize: 14 }}
                            value={editingOrder[order.id]?.customer ?? order.customer ?? ''}
                            onChange={e => { e.stopPropagation(); updateEditingOrder(order.id, 'customer', e.target.value); }}
                            onBlur={() => saveEditingOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                            placeholder="Customer name"
                          />
                          {order.worksOrder && <div style={{ fontSize: 11, color: 'var(--col-muted)', fontFamily: 'DM Mono,monospace', marginTop: 2 }}>{order.worksOrder}</div>}
                        </div>
                        <div>
                          <div className="section-label" style={{ marginBottom: 4 }}>Description</div>
                          <input className="inline-input" style={{ fontSize: 13 }}
                            value={editingOrder[order.id]?.description ?? order.description ?? ''}
                            onChange={e => { e.stopPropagation(); updateEditingOrder(order.id, 'description', e.target.value); }}
                            onBlur={() => saveEditingOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                            placeholder="—"
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <input type="date" className="inline-input" style={{ fontSize: 12 }}
                            value={editingOrder[order.id]?.planningDate ?? order.planningDate ?? ''}
                            onChange={e => { e.stopPropagation(); updateEditingOrder(order.id, 'planningDate', e.target.value); }}
                            onBlur={() => saveEditingOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                          />
                          <MachineBadge name={machine?.name} />
                        </div>
                        <div>
                          <div className="section-label" style={{ marginBottom: 6 }}>Validations</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 4, background: 'var(--col-border2)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--col-green)' : pct >= 70 ? 'var(--col-blue)' : 'var(--col-orange)', borderRadius: 2, transition: 'width 0.4s' }} />
                            </div>
                            <span style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', color: 'var(--col-muted)', whiteSpace: 'nowrap' }}>{validDone}/{validTotal}</span>
                          </div>
                        </div>
                        <div onClick={e => e.stopPropagation()}>
                          <select
                            value={order.status || 'In Progress'}
                            onChange={e => updateOrder(order.id, { status: e.target.value })}
                            className={`status-pill ${statusClass(order.status)}`}
                            style={{ cursor: 'pointer', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit' }}
                          >
                            <option value="In Progress">In Progress</option>
                            <option value="Urgent">Urgent</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Complete">Complete</option>
                            <option value="Deleted">🗑 Delete</option>
                          </select>
                        </div>
                        <div style={{ color: 'var(--col-muted)', display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--col-border)', background: 'var(--col-surface2)', padding: 20 }} className="animate-fade-in">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                          {[
                            { label: 'Spec', field: 'spec', placeholder: 'Specification' },
                            { label: 'Quantity (feeds)', field: 'quantity', placeholder: '0' },
                            { label: 'Works Order', field: 'worksOrder', placeholder: 'Works order #' },
                          ].map(({ label, field, placeholder }) => (
                            <div key={field}>
                              <div className="section-label" style={{ marginBottom: 6 }}>{label}</div>
                              <input className="input" placeholder={placeholder}
                                value={editingOrder[order.id]?.[field] ?? order[field] ?? ''}
                                onChange={e => updateEditingOrder(order.id, field, e.target.value)}
                                onBlur={() => saveEditingOrder(order.id)}
                              />
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                          <div>
                            <div className="section-label" style={{ marginBottom: 6 }}>Machine</div>
                            <select className="input" value={order.machineId || ''} onChange={e => updateOrder(order.id, { machineId: parseInt(e.target.value) || null })}>
                              <option value="">Not Assigned</option>
                              {MACHINES.map(m => <option key={m.id} value={m.id}>{m.name} — {m.fullName}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="section-label" style={{ marginBottom: 6 }}>Ship Date</div>
                            <input type="date" className="input"
                              value={editingOrder[order.id]?.shipsDate ?? order.shipsDate ?? ''}
                              onChange={e => updateEditingOrder(order.id, 'shipsDate', e.target.value)}
                              onBlur={() => saveEditingOrder(order.id)}
                            />
                          </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                          <div className="section-label" style={{ marginBottom: 10 }}>Validation Checklist</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {VALIDATIONS.map(v => {
                              const k = vKey(v);
                              const checked = order.validations?.[k] || false;
                              const highlight = view === 'materialneeded' && k === 'materialpurchasing';
                              return (
                                <label key={v} className={`val-item${checked ? ' checked' : highlight ? ' highlight' : ''}`} onClick={() => toggleVal(order.id, k)}>
                                  <div className="val-check">{checked && <CheckCircle2 size={11} color="#0c0e12" />}</div>
                                  <span style={{ fontSize: 11, fontWeight: checked ? 600 : 400, color: checked ? 'var(--col-green)' : highlight ? 'var(--col-yellow)' : 'var(--col-text)' }}>
                                    {highlight && '📦 '}{v}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="section-label" style={{ marginBottom: 6 }}>Notes</div>
                          <textarea className="input" rows={3} style={{ resize: 'none' }} placeholder="Add notes…"
                            value={editingOrder[order.id]?.notes ?? order.notes ?? ''}
                            onChange={e => updateEditingOrder(order.id, 'notes', e.target.value)}
                            onBlur={() => saveEditingOrder(order.id)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── IMPORT MODAL ── */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
        />
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200 }}>
          <div className={`toast ${toast.type} animate-toast-in`}>
            <span style={{ fontSize: 16 }}>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'ℹ'}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--col-text)' }}>{toast.message}</span>
            <button onClick={() => setToast(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--col-muted)', padding: 0 }}><X size={15} /></button>
          </div>
        </div>
      )}

      {/* ── CLEAR MODAL ── */}
      {showClearModal && (
        <div className="modal-overlay" onClick={() => setShowClearModal(false)}>
          <div className="card" style={{ maxWidth: 480, width: '100%', padding: 32 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ background: '#f8717118', border: '1px solid #f8717130', borderRadius: 10, padding: 10 }}>
                <AlertTriangle size={24} color="var(--col-red)" />
              </div>
              <div>
                <h2 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--col-red)' }}>Delete All Orders?</h2>
                <p style={{ fontSize: 13, color: 'var(--col-muted)', marginTop: 2 }}>This action cannot be undone</p>
              </div>
            </div>

            <div style={{ background: '#f8717108', border: '1px solid #f8717130', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: 'var(--col-text)', marginBottom: 8 }}>You are about to permanently delete:</div>
              <div style={{ color: 'var(--col-muted)', lineHeight: 1.8 }}>
                · <b style={{ color: 'var(--col-text)' }}>{orders.length}</b> total orders<br />
                · <b style={{ color: 'var(--col-text)' }}>{active.length}</b> active orders<br />
                · <b style={{ color: 'var(--col-text)' }}>{completed.length}</b> completed orders
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Type <code style={{ background: 'var(--col-surface2)', padding: '1px 6px', borderRadius: 4, fontFamily: 'DM Mono,monospace', color: 'var(--col-red)' }}>DELETE ALL</code> to confirm</div>
              <input className="input" style={{ fontSize: 14 }} placeholder="DELETE ALL" value={clearConfirmText} onChange={e => setClearConfirmText(e.target.value)} autoFocus />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn"
                style={{ flex: 1, justifyContent: 'center', padding: '12px 0', fontSize: 14, background: clearConfirmText === 'DELETE ALL' ? 'var(--col-red)' : 'var(--col-surface2)', color: clearConfirmText === 'DELETE ALL' ? 'white' : 'var(--col-dim)', cursor: clearConfirmText === 'DELETE ALL' ? 'pointer' : 'not-allowed' }}
                disabled={clearConfirmText !== 'DELETE ALL'}
                onClick={async () => {
                  try {
                    await firebaseService.clearAllOrders();
                    setShowClearModal(false);
                    setClearConfirmText('');
                    showToast('All orders deleted', 'success');
                  } catch (err) {
                    console.error('Clear all failed:', err);
                    showToast('Failed to delete', 'error');
                  }
                }}
              >
                Delete All Orders
              </button>
              <button className="btn btn-ghost" style={{ padding: '12px 20px' }} onClick={() => { setShowClearModal(false); setClearConfirmText(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
