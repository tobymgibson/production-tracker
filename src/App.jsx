import React, { useState, useEffect, useMemo } from 'react';
import { Download, Upload, Lock, Eye, EyeOff, AlertTriangle, TrendingUp, Calendar, Package, Search, X, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { firebaseService } from './firebase-service.js';

// MACHINES will be loaded from Firebase dynamically
// Default values used as fallback
const DEFAULT_MACHINES = [
  { 
    id: 1, 
    name: 'KO1', 
    fullName: 'Klett 1',
    capacity: 50000, 
    stockPercentage: 57,
    availableCapacity: 21500,
    avgSetupTime: 2 
  },
  { 
    id: 2, 
    name: 'KO3', 
    fullName: 'Klett 3',
    capacity: 17500, 
    stockPercentage: 22,
    availableCapacity: 13650,
    avgSetupTime: 1.5 
  },
  { 
    id: 3, 
    name: 'BO1', 
    fullName: 'Century',
    capacity: 24000, 
    stockPercentage: 45,
    availableCapacity: 13200,
    avgSetupTime: 1.5 
  },
  { 
    id: 4, 
    name: 'JC1', 
    fullName: 'Jinchang',
    capacity: 48000, 
    stockPercentage: 49,
    availableCapacity: 24480,
    avgSetupTime: 2 
  }
];

const VALIDATIONS = [
  'Existing Tooling', 'Design Brief', 'Artwork Brief', 'Credit Check',
  'Design Approval', 'Artwork Approval', 'Colour Approval', 'Customer Order',
  'Pre-Production', 'Job Raised', 'Material Purchasing', 'Kick Off Meeting Required',
  'Formes Ordered', 'Plates Ordered'
];

const STATUS_COLORS = {
  'In Progress': 'bg-blue-50 dark:bg-blue-950 dark:bg-blue-950 text-blue-700 dark:text-blue-300 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  'Complete': 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  'Deleted': 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 dark:text-red-300 border-red-200 dark:border-red-800',
  'On Hold': 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300',
  'Urgent': 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300'
};

export default function App() {
  const [auth, setAuth] = useState(false);
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
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
  const [validationFilter, setValidationFilter] = useState('all'); // all, materialpurchasing, pending
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [toast, setToast] = useState(null); // {message, type: 'success'|'error'|'info'}
  const [isLoadingFromSheets, setIsLoadingFromSheets] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [useGoogleSheets, setUseGoogleSheets] = useState(false); // Disabled - using Firebase now
  const [machines, setMachines] = useState(DEFAULT_MACHINES); // Dynamic machines from Firebase
  const [showMigrateButton, setShowMigrateButton] = useState(false); // Show migrate from Sheets button

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // For backward compatibility - MACHINES references the dynamic machines state
  const MACHINES = machines;

  // Capacity warning - recomputes live as user fills in machine/date/quantity
  const _nomid = newOrder ? newOrder.machineId : null;
  const _nopdate = newOrder ? newOrder.planningDate : '';
  const _noqty = newOrder ? newOrder.quantity : '';

  const capacityWarning = useMemo(() => {
    if (!_nomid || !_nopdate || !_noqty) return null;
    const machine = machines.find(m => m.id === _nomid);
    if (!machine) return null;
    const newQty = parseInt(String(_noqty).replace(/,/g, '')) || 0;
    if (newQty === 0) return null;
    const existingOrders = orders.filter(o =>
      o.machineId === _nomid &&
      o.planningDate === _nopdate &&
      o.status !== 'Complete' &&
      o.status !== 'Deleted'
    );
    const existingQty = existingOrders.reduce((sum, o) =>
      sum + (parseInt(String(o.quantity || '0').replace(/,/g, '')) || 0), 0
    );
    const totalAfterAdd = existingQty + newQty;
    const availableCapacity = machine.availableCapacity;
    const utilisationPct = Math.round((totalAfterAdd / availableCapacity) * 100);
    const isOver = totalAfterAdd > availableCapacity * 1.05;
    const isNear = totalAfterAdd >= availableCapacity * 0.9 && !isOver;
    const suggestedDates = [];
    for (let i = 1; i <= 28; i++) {
      const d = new Date(_nopdate + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      const dateStr = d.toISOString().split('T')[0];
      const usedOnDay = orders
        .filter(o => o.machineId === _nomid && o.planningDate === dateStr && o.status !== 'Complete' && o.status !== 'Deleted')
        .reduce((sum, o) => sum + (parseInt(String(o.quantity || '0').replace(/,/g, '')) || 0), 0);
      if (usedOnDay + newQty <= availableCapacity) {
        suggestedDates.push({
          date: dateStr,
          remaining: availableCapacity - usedOnDay,
          dayName: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        });
        if (suggestedDates.length >= 3) break;
      }
    }
    return {
      machine, existingQty, newQty, totalAfterAdd, availableCapacity,
      remaining: Math.max(0, availableCapacity - totalAfterAdd),
      utilisationPct, isOver, isNear, existingOrders, suggestedDates
    };
  }, [_nomid, _nopdate, _noqty, orders, machines]);

  // Add animation styles
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slide-up {
        from {
          transform: translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .animate-slide-up {
        animation: slide-up 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  
  // Load data from Firebase with real-time sync
  useEffect(() => {
    if (!auth) return;
    
    console.log('🔥 Setting up Firebase real-time sync...');
    
    // Subscribe to real-time order updates
    const unsubscribeOrders = firebaseService.subscribeToOrders((ordersData) => {
      console.log(`🔥 Real-time update: ${ordersData.length} orders`);
      setOrders(ordersData);
      setLastSyncTime(new Date());
      
      // If Firebase is empty, check if we have Google Sheets data to migrate
      if (ordersData.length === 0) {
        // Check localStorage for Google Sheets data
        try {
          const stored = localStorage.getItem('orders-final');
          if (stored) {
            const localOrders = JSON.parse(stored);
            if (localOrders.length > 0) {
              console.log(`💡 Found ${localOrders.length} orders in localStorage - showing migrate button`);
              setShowMigrateButton(true);
            }
          }
        } catch (e) {
          console.error('Error checking localStorage:', e);
        }
      }
      
      // Also save to localStorage as backup
      localStorage.setItem('orders-final', JSON.stringify(ordersData));
    });
    
    // Subscribe to real-time machine updates
    const unsubscribeMachines = firebaseService.subscribeToMachines((machinesData) => {
      console.log(`🔥 Real-time update: ${machinesData.length} machines`, machinesData);
      if (machinesData.length > 0) {
        setMachines(machinesData);
      } else {
        // No machines in Firebase - show initialize button
        console.log('⚠️ No machines in Firebase - using defaults');
        setMachines(DEFAULT_MACHINES);
      }
    });
    
    showToast('🔥 Connected to Firebase - Real-time sync active!', 'success');
    
    // Cleanup subscriptions when component unmounts
    return () => {
      console.log('🔥 Cleaning up Firebase subscriptions');
      if (unsubscribeOrders) unsubscribeOrders();
      if (unsubscribeMachines) unsubscribeMachines();
    };
  }, [auth]);

  // Auto-sync with Google Sheets every 30 seconds
  // DISABLED: Since we can't write to Google Sheets (401 error), auto-sync would
  // overwrite local changes. Users should manually click Refresh when needed.
  useEffect(() => {
    if (!auth || !useGoogleSheets) return;

    // Auto-sync disabled - use manual Refresh button instead
    // Uncomment below to re-enable auto-sync when OAuth 2.0 is implemented
    
    /*
    const syncInterval = setInterval(async () => {
      try {
        const data = await googleSheetsService.fetchOrders();
        setOrders(data);
        setLastSyncTime(new Date());
        localStorage.setItem('orders-final', JSON.stringify(data));
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(syncInterval);
    */
  }, [auth, useGoogleSheets]);

  const save = async (data) => {
    try {
      console.log(`💾 Attempting to save ${data.length} orders...`);
      
      // DON'T use saveOrders (batch) - it overwrites everything
      // Instead, save each order individually to preserve multi-user data
      for (const order of data) {
        await firebaseService.saveOrder(order);
      }
      
      console.log(`✅ Saved ${data.length} orders individually to Firebase`);
      
      // Local state will update automatically via Firebase subscription
      // No need to manually setOrders - the real-time listener handles it
      setLastSyncTime(new Date());
      
      // Backup to localStorage
      localStorage.setItem('orders-final', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving to Firebase:', error);
      showToast('Failed to save data to Firebase', 'error');
      
      // Even if Firebase fails, save locally
      localStorage.setItem('orders-final', JSON.stringify(data));
      setOrders(data);
    }
  };

  // Initialize Firebase machines (run once)
  const initializeFirebase = async () => {
    setIsLoadingFromSheets(true);
    try {
      // Initialize default machines in Firebase
      await firebaseService.initializeDefaultMachines();
      showToast('✅ Firebase initialized with default machines', 'success');
    } catch (error) {
      console.error('Error initializing Firebase:', error);
      showToast('Failed to initialize Firebase', 'error');
    } finally {
      setIsLoadingFromSheets(false);
    }
  };

  // Migrate data from Google Sheets to Firebase (one-time migration)
  const migrateFromGoogleSheets = async () => {
    setIsLoadingFromSheets(true);
    try {
      showToast('Migrating data from Google Sheets to Firebase...', 'info');
      
      // Import googleSheetsService temporarily
      const { googleSheetsService } = await import('./google-sheets-service.js');
      
      // Fetch from Google Sheets
      const sheetsData = await googleSheetsService.fetchOrders();
      
      // Save to Firebase
      await firebaseService.importFromGoogleSheets(sheetsData);
      
      showToast(`✅ Migrated ${sheetsData.length} orders to Firebase!`, 'success');
      setShowMigrateButton(false);
    } catch (error) {
      console.error('Error migrating from Google Sheets:', error);
      showToast('Failed to migrate from Google Sheets', 'error');
    } finally {
      setIsLoadingFromSheets(false);
    }
  };

  const deleteOrder = async (id) => {
    const order = orders.find(o => o.id === id);
    const confirmed = window.confirm(`DELETE ORDER?\n\nCustomer: ${order?.customer}\n\nThis cannot be undone!`);
    if (confirmed) {
      try {
        await firebaseService.deleteOrder(id);
        // State updates automatically via Firebase subscription
        showToast('Order deleted', 'success');
      } catch (error) {
        console.error('Error deleting order:', error);
        showToast('Failed to delete order', 'error');
      }
    }
  };

  const toggleVal = async (id, key) => {
    const order = orders.find(o => o.id === id);
    if (order) {
      const updatedOrder = {
        ...order,
        validations: {
          ...order.validations,
          [key]: !order.validations[key]
        }
      };
      try {
        await firebaseService.saveOrder(updatedOrder);
        // State updates automatically via Firebase subscription
      } catch (error) {
        console.error('Error toggling validation:', error);
        showToast('Failed to update checkbox', 'error');
      }
    }
  };

  const updateOrder = async (id, updates) => {
    const order = orders.find(o => o.id === id);
    if (order) {
      const updatedOrder = { ...order, ...updates };
      try {
        await firebaseService.saveOrder(updatedOrder);
        // State updates automatically via Firebase subscription
      } catch (error) {
        console.error('Error updating order:', error);
        showToast('Failed to update order', 'error');
      }
    }
  };

  const updateEditingOrder = (id, field, value) => {
    setEditingOrder(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const saveEditingOrder = (id) => {
    if (editingOrder[id]) {
      updateOrder(id, editingOrder[id]);
      setEditingOrder(prev => {
        const newState = {...prev};
        delete newState[id];
        return newState;
      });
    }
  };

  const initNewOrder = () => {
    const order = {
      id: `new-${Date.now()}`,
      customer: '',
      worksOrder: '',
      description: '',
      spec: '',
      quantity: '',
      status: 'In Progress',
      planningDate: '',
      shipsDate: '',
      machineId: null,
      validations: Object.fromEntries(VALIDATIONS.map(v => [v.toLowerCase().replace(/\s+/g, ''), false])),
      notes: '',
      created: new Date().toISOString()
    };
    setNewOrder(order);
  };

  const saveNewOrder = async () => {
    if (newOrder && newOrder.customer) {
      const orderToSave = {
        ...newOrder, 
        id: `${Date.now()}`,
        created: new Date().toISOString()
      };
      
      try {
        // Save single order to Firebase (more efficient than saving all)
        await firebaseService.saveOrder(orderToSave);
        
        // Local state updates automatically via Firebase subscription
        setNewOrder(null);
        setView('active');
        showToast('✅ Order created and synced!', 'success');
      } catch (error) {
        console.error('Error saving new order:', error);
        showToast('Failed to save order', 'error');
      }
    } else {
      showToast('Please enter at least a customer name before saving.', 'error');
    }
  };

  const cancelNewOrder = () => {
    if (newOrder && (newOrder.customer || newOrder.description)) {
      if (window.confirm('Discard this order? Any entered information will be lost.')) {
        setNewOrder(null);
      }
    } else {
      setNewOrder(null);
    }
  };

  // PREDICTIVE ANALYTICS
  const analytics = useMemo(() => {
    const active = orders.filter(o => o.status !== 'Deleted');
    
    // Calculate validation completion rate
    const validationStats = {};
    VALIDATIONS.forEach(v => {
      const key = v.toLowerCase().replace(/\s+/g, '');
      const completed = active.filter(o => o.validations?.[key]).length;
      validationStats[v] = {
        completed,
        total: active.length,
        percentage: active.length > 0 ? Math.round((completed / active.length) * 100) : 0
      };
    });

    // Find bottlenecks (least completed validations)
    const bottlenecks = Object.entries(validationStats)
      .filter(([validation, _]) => validation !== 'Kick Off Meeting Required') // Exclude - not required for all orders
      .sort((a, b) => a[1].percentage - b[1].percentage)
      .slice(0, 3)
      .filter(([_, stats]) => stats.percentage < 80 && stats.total > 0);
    // Capacity forecasting for next 14 days
    const today = new Date();
    const forecast = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      MACHINES.forEach(machine => {
        const ordersOnDate = active.filter(o => 
          o.machineId === machine.id && 
          o.planningDate === dateStr
        );
        
        const nonStockUsed = ordersOnDate.reduce((sum, o) => {
          const qty = parseInt(String(o.quantity || '0').replace(/,/g, '')) || 0;
          return sum + qty;
        }, 0);
        
        const stockReserved = Math.round(machine.capacity * (machine.stockPercentage / 100));
        
        if (nonStockUsed > 0) {
          forecast.push({
            date: dateStr,
            machine: machine.name,
            machineId: machine.id,
            nonStockUsed,
            stockReserved,
            totalCapacity: machine.capacity,
            availableCapacity: machine.availableCapacity,
            percentageOfAvailable: Math.round((nonStockUsed / machine.availableCapacity) * 100),
            percentageOfTotal: Math.round(((nonStockUsed + stockReserved) / machine.capacity) * 100),
            isOver: nonStockUsed > machine.availableCapacity * 1.05, // 5% tolerance
            isNear: nonStockUsed >= machine.availableCapacity * 0.9 && nonStockUsed <= machine.availableCapacity * 1.05
          });
        }
      });
    }

    // Risk assessment
    const overCapacityDays = forecast.filter(f => f.isOver).length;
    const nearCapacityDays = forecast.filter(f => f.isNear && !f.isOver).length;
    
    // Lead time analysis
    const ordersWithDates = active.filter(o => o.planningDate && o.created);
    const avgLeadTime = ordersWithDates.length > 0
      ? ordersWithDates.reduce((sum, o) => {
          const created = new Date(o.created);
          const planned = new Date(o.planningDate);
          const days = Math.max(0, Math.ceil((planned - created) / (1000 * 60 * 60 * 24)));
          return sum + days;
        }, 0) / ordersWithDates.length
      : 0;

    // Machine utilisation (future/today orders only)
    const todayStr = new Date().toISOString().split('T')[0];
    const machineUtil = MACHINES.map(machine => {
      const machineOrders = active.filter(o => 
        o.machineId === machine.id && 
        o.planningDate &&
        o.planningDate >= todayStr // Only today or future
      );
      const totalQty = machineOrders.reduce((sum, o) => {
        const qty = parseInt(String(o.quantity || '0').replace(/,/g, '')) || 0;
        return sum + qty;
      }, 0);
      
      // Count unique planning dates to get actual days utilisation
      const uniqueDates = new Set(machineOrders.map(o => o.planningDate)).size;
      const avgPerDay = uniqueDates > 0 ? totalQty / uniqueDates : 0;
      
      return {
        machine: machine.name,
        fullName: machine.fullName,
        orders: machineOrders.length,
        totalQuantity: totalQty,
        scheduledDays: uniqueDates,
        avgPerDay: Math.round(avgPerDay),
        availableCapacity: machine.availableCapacity,
        utilisationPercent: Math.round((avgPerDay / machine.availableCapacity) * 100)
      };
    });

    // Find orders requiring kick-off meetings
    const kickOffRequired = active.filter(o => {
      const key = 'kickoffmeetingrequired';
      return o.validations?.[key] === true; // Checkbox is ticked = meeting needed
    });

    return {
      validationStats,
      bottlenecks,
      forecast: forecast.sort((a, b) => new Date(a.date) - new Date(b.date)),
      overCapacityDays,
      nearCapacityDays,
      avgLeadTime: Math.round(avgLeadTime),
      machineUtil,
      kickOffRequired,
      totalActive: active.length,
      totalCompleted: orders.filter(o => o.status === 'Complete').length
    };
  }, [orders]);

  const importData = () => {
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;top:10%;left:10%;width:80%;height:70%;z-index:9999;padding:20px;border:3px solid #10b981;font-family:monospace;';
    ta.placeholder = 'Paste Excel data here (Ctrl+V), then click Import below';
    document.body.appendChild(ta);
    
    const btn = document.createElement('button');
    btn.textContent = 'Import Data';
    btn.style.cssText = 'position:fixed;bottom:10%;left:50%;transform:translateX(-50%);z-index:10000;padding:15px 30px;background:#10b981;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;';
    btn.onclick = () => {
      const lines = ta.value.split('\n').map(l => l.split('\t').map(c => c.trim()));
      const h = lines[0].map(x => x.toLowerCase().trim());
      
      const newOrders = [];
      for (let i = 1; i < lines.length; i++) {
        const r = lines[i];
        const customer = r[h.indexOf('customer')] || '';
        if (!customer) continue;
        
        const validations = {};
        VALIDATIONS.forEach(v => {
          const searchTerms = v.toLowerCase().split(' ');
          const colIdx = h.findIndex(header => {
            const headerLower = header.toLowerCase();
            return searchTerms.every(term => headerLower.includes(term));
          });
          
          const key = v.toLowerCase().replace(/\s+/g, '');
          if (colIdx !== -1 && r[colIdx]) {
            const val = String(r[colIdx]).toLowerCase().trim();
            validations[key] = val === 'x' || val === 'y' || val === 'yes';
          } else {
            validations[key] = false;
          }
        });
        
        // Get PLANNING date from "Production Agreed Date" column
        console.log('=== DATE IMPORT DEBUG FOR ROW', i, '===');
        console.log('All headers:', h);
        
        // Look for Production Agreed Date column first (this is the planning date)
        // Try multiple variations to match common column names
        const productionDateIdx = h.findIndex(x => 
          x.includes('production agreed') ||
          x.includes('prod agreed') ||
          (x.includes('production') && x.includes('date')) ||
          x.includes('planning date') ||
          x.includes('planning') ||
          x.includes('prod date')
        );
        console.log('Production Agreed Date column index:', productionDateIdx);
        if (productionDateIdx !== -1) {
          console.log('✓ Production date column header:', h[productionDateIdx]);
          console.log('✓ Raw Production date value:', r[productionDateIdx]);
          console.log('✓ Type:', typeof r[productionDateIdx]);
        } else {
          console.log('❌ NO Production date column found!');
          console.log('❌ Available headers:', h);
        }
        
        let planningDate = '';
        
        if (productionDateIdx !== -1) {
          const rawDate = r[productionDateIdx];
          console.log('✓ Found Production Agreed Date column!');
          
          // Handle different date formats
          if (rawDate) {
            if (typeof rawDate === 'string' && rawDate.trim() !== '') {
              const dateStr = rawDate.trim();
              console.log('Processing date string:', dateStr);
              
              // Handle DD/MM/YY or DD/MM/YYYY format (e.g., "6/10/25" or "09/09/2025")
              // Also handles M/D/YY format by assuming UK date format (day first)
              if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                  // Assume UK format: Day/Month/Year
                  let day = parts[0].padStart(2, '0');
                  let month = parts[1].padStart(2, '0');
                  let year = parts[2];
                  
                  // Convert 2-digit year to 4-digit (25 -> 2025, 26 -> 2026)
                  if (year.length === 2) {
                    const yearNum = parseInt(year);
                    // If year is 00-49, assume 2000-2049; if 50-99, assume 1950-1999
                    if (yearNum < 50) {
                      year = '20' + year;
                    } else {
                      year = '19' + year;
                    }
                  } else if (year.length === 4) {
                    // Already 4 digits
                    year = year;
                  }
                  
                  // Validate the date parts are reasonable
                  const dayNum = parseInt(day);
                  const monthNum = parseInt(month);
                  
                  if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
                    // Convert to YYYY-MM-DD format for HTML date input
                    planningDate = `${year}-${month}-${day}`;
                    console.log(`Converted ${dateStr} (D/M/Y) to:`, planningDate);
                  } else {
                    console.warn(`Invalid date parts: day=${day}, month=${month}, year=${year}`);
                    planningDate = ''; // Leave blank if invalid
                  }
                }
              } 
              // Handle YYYY-MM-DD format (already correct)
              else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                planningDate = dateStr;
                console.log('Already in YYYY-MM-DD format:', planningDate);
              }
              // Handle other formats - just use as-is
              else {
                planningDate = dateStr;
                console.log('Using date as-is:', planningDate);
              }
            } 
            // Handle Excel serial date numbers
            else if (typeof rawDate === 'number') {
              const excelEpoch = new Date(1900, 0, 1);
              const date = new Date(excelEpoch.getTime() + (rawDate - 2) * 24 * 60 * 60 * 1000);
              planningDate = date.toISOString().split('T')[0];
              console.log('Converted Excel serial number to:', planningDate);
            }
          }
        } else {
          console.log('⚠️ No Production Agreed Date column found');
        }
        
        // Get SHIP date from "Ship Date" column
        const shipDateIdx = h.findIndex(x => 
          (x.includes('ship') && x.includes('date')) ||
          x.includes('shipdate') ||
          x === 'ship date'
        );
        console.log('Ship Date column index:', shipDateIdx);
        
        let shipsDate = '';
        
        if (shipDateIdx !== -1) {
          const rawDate = r[shipDateIdx];
          console.log('Ship Date column header:', h[shipDateIdx]);
          console.log('Raw Ship Date value:', r[shipDateIdx]);
          
          // Handle different date formats
          if (rawDate) {
            if (typeof rawDate === 'string' && rawDate.trim() !== '') {
              const dateStr = rawDate.trim();
              console.log('Processing ship date string:', dateStr);
              
              // Handle DD/MM/YY or DD/MM/YYYY format (e.g., "6/10/25" or "09/09/2025")
              // Also handles M/D/YY format by assuming UK date format (day first)
              if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                  // Assume UK format: Day/Month/Year
                  let day = parts[0].padStart(2, '0');
                  let month = parts[1].padStart(2, '0');
                  let year = parts[2];
                  
                  // Convert 2-digit year to 4-digit (25 -> 2025, 26 -> 2026)
                  if (year.length === 2) {
                    const yearNum = parseInt(year);
                    if (yearNum < 50) {
                      year = '20' + year;
                    } else {
                      year = '19' + year;
                    }
                  } else if (year.length === 4) {
                    year = year;
                  }
                  
                  // Validate the date parts
                  const dayNum = parseInt(day);
                  const monthNum = parseInt(month);
                  
                  if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
                    // Convert to YYYY-MM-DD format for HTML date input
                    shipsDate = `${year}-${month}-${day}`;
                    console.log(`Converted ship date ${dateStr} (D/M/Y) to:`, shipsDate);
                  } else {
                    console.warn(`Invalid ship date parts: day=${day}, month=${month}, year=${year}`);
                    shipsDate = '';
                  }
                }
              } 
              // Handle YYYY-MM-DD format (already correct)
              else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                shipsDate = dateStr;
                console.log('Ship date already in YYYY-MM-DD format:', shipsDate);
              }
              // Handle other formats - just use as-is
              else {
                shipsDate = dateStr;
                console.log('Using ship date as-is:', shipsDate);
              }
            } 
            // Handle Excel serial date numbers
            else if (typeof rawDate === 'number') {
              const excelEpoch = new Date(1900, 0, 1);
              const date = new Date(excelEpoch.getTime() + (rawDate - 2) * 24 * 60 * 60 * 1000);
              shipsDate = date.toISOString().split('T')[0];
              console.log('Converted Excel serial ship date to:', shipsDate);
            }
          }
        } else {
          console.log('⚠️ No Ship Date column found');
        }
        
        console.log('📅 Final PLANNING date:', planningDate);
        console.log('📅 Final SHIP date:', shipsDate);
        console.log('======================');
        
        // Get machine assignment
        const machineIdx = h.indexOf('machine');
        let machineId = null;
        if (machineIdx !== -1 && r[machineIdx]) {
          const machineStr = String(r[machineIdx]).toLowerCase().trim();
          // Match by short code (KO1, KO3, BO1, JC1) or full name (Klett 1, Century, etc.)
          const machine = MACHINES.find(m => 
            m.name.toLowerCase() === machineStr || 
            m.fullName.toLowerCase() === machineStr ||
            machineStr.includes(m.name.toLowerCase()) ||
            machineStr.includes(m.fullName.toLowerCase())
          );
          if (machine) {
            machineId = machine.id;
          }
        }
        
        newOrders.push({
          id: `${Date.now()}-${i}`,
          customer,
          worksOrder: r[h.findIndex(x => 
            x.includes('works ord') || 
            (x.includes('works') && x.includes('order')) ||
            x.includes('worksorder') ||
            x === 'works order'
          )] || '',
          description: r[h.indexOf('description')] || '',
          spec: r[h.indexOf('spec')] || '',
          quantity: r[h.indexOf('quantity')] || '',
          status: r[h.indexOf('status')] || 'In Progress',
          planningDate: planningDate,
          shipsDate: shipsDate,
          machineId: machineId,
          validations,
          notes: 'Imported from Excel',
          created: new Date().toISOString()
        });
      }
      
      save([...orders, ...newOrders]);
      showToast(`Imported ${newOrders.length} orders successfully!`, 'success');
      document.body.removeChild(ta);
      document.body.removeChild(btn);
    };
    document.body.appendChild(btn);
    ta.focus();
  };

  const exportData = () => {
    const csv = [
      ['Customer', 'Works Order', 'Description', 'Spec', 'Quantity', 'Status', 'Machine', 'Planning Date', 'Ship Date', ...VALIDATIONS, 'Notes'],
      ...orders.map(o => [
        o.customer, o.worksOrder || '', o.description, o.spec, o.quantity, o.status,
        MACHINES.find(m => m.id === o.machineId)?.name || '',
        o.planningDate, o.shipsDate,
        ...VALIDATIONS.map(v => o.validations?.[v.toLowerCase().replace(/\s+/g, '')] ? 'x' : ''),
        o.notes || ''
      ])
    ].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (!auth) {
    return (
      <div className="min-h-screen bg-slate-950 dark:bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-yellow-400 rounded-xl mb-5">
              <Lock size={22} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Production Tracker</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Weedon Corrugated Products</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
            <div className="relative mb-4">
              <input
                type={showPwd ? 'text' : 'password'}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && pwd === 'CorrugatedTracker2026!' && setAuth(true)}
                placeholder="Enter password"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 pr-12 focus:border-yellow-400 focus:outline-none transition-colors placeholder-slate-500 text-sm"
              />
              <button
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-300 transition-colors">
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <button
              onClick={() => pwd === 'CorrugatedTracker2026!' ? setAuth(true) : alert('Incorrect password')}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-slate-950 py-3 rounded-xl font-semibold transition-all text-sm tracking-wide"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  const active = orders.filter(o => o.status !== 'Complete' && o.status !== 'Deleted');
  const completed = orders.filter(o => o.status === 'Complete');
  const deleted = orders.filter(o => o.status === 'Deleted');
  const materialNeeded = active.filter(o => !o.validations?.materialpurchasing);
  
  let display = view === 'active' ? active : 
                view === 'completed' ? completed : 
                view === 'deleted' ? deleted : 
                view === 'materialneeded' ? materialNeeded :
                view === 'dashboard' ? [] : orders;
  
  // Apply search filter
  if (searchFilter && view !== 'dashboard') {
    const search = searchFilter.toLowerCase();
    display = display.filter(o => 
      o.customer?.toLowerCase().includes(search) ||
      o.spec?.toLowerCase().includes(search) ||
      o.worksOrder?.toLowerCase().includes(search) ||
      o.description?.toLowerCase().includes(search)
    );
  }

  // Apply validation filter (only on active view)
  if (view === 'active' && validationFilter !== 'all') {
    if (validationFilter === 'materialpurchasing') {
      display = display.filter(o => !o.validations?.materialpurchasing);
    } else if (validationFilter === 'pending') {
      // Show orders with any unchecked validations
      display = display.filter(o => {
        const validations = o.validations || {};
        return VALIDATIONS.some(v => {
          const key = v.toLowerCase().replace(/\s+/g, '');
          return !validations[key];
        });
      });
    }
  }

  // Apply sorting
  if (view !== 'dashboard') {
    display = [...display].sort((a, b) => {
      let aVal = a[sortBy] || '';
      let bVal = b[sortBy] || '';
      
      if (sortBy === 'planningDate') {
        aVal = new Date(aVal || '9999-12-31');
        bVal = new Date(bVal || '9999-12-31');
      }
      
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortDesc ? -comparison : comparison;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-slate-950 dark:bg-black text-white border-b border-slate-800 dark:border-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-slate-950 font-black text-xs">PT</span>
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight leading-none">Production Tracker</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-none mt-0.5">Corrugated Sheet Plant</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {lastSyncTime && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950 border border-emerald-900 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                  Live
                </div>
              )}
              {showMigrateButton && (
                <button onClick={migrateFromGoogleSheets} disabled={isLoadingFromSheets}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 text-xs">
                  <Upload size={13} />
                  {isLoadingFromSheets ? 'Migrating...' : 'Migrate from Sheets'}
                </button>
              )}
              {orders.length === 0 && machines.length === DEFAULT_MACHINES.length && (
                <button onClick={initializeFirebase}
                  className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-9500 hover:bg-yellow-400 px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold">
                  Initialise
                </button>
              )}
              <button onClick={() => { initNewOrder(); setView('neworder'); }}
                className="flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 px-4 py-2 rounded-lg transition-colors font-semibold text-sm">
                <Plus size={15} />New Order
              </button>
              <button onClick={importData}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-lg transition-colors text-sm">
                <Upload size={15} />Import
              </button>
              <button onClick={exportData}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-lg transition-colors text-sm">
                <Download size={15} />Export
              </button>
              <button onClick={() => setShowClearModal(true)}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-red-900 border border-slate-700 hover:border-red-800 px-3 py-2 rounded-lg transition-colors text-sm text-slate-400 hover:text-red-400">
                <X size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0.5 py-1.5">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
              { id: 'active', label: `Active`, count: active.length, icon: Package },
              { id: 'materialneeded', label: `Materials`, count: active.filter(o => !o.validations?.materialpurchasing).length, icon: null, alert: true },
              { id: 'capacity', label: 'Capacity', icon: Calendar },
              { id: 'completed', label: `Completed`, count: completed.length, icon: null },
              { id: 'all', label: 'All Orders', icon: null },
              { id: 'neworder', label: 'New Order', icon: Plus },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'neworder' && !newOrder) initNewOrder();
                  setView(tab.id);
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === tab.id
                    ? 'bg-slate-950 dark:bg-yellow-50 dark:bg-yellow-9500 text-white dark:text-slate-900 dark:text-white'
                    : tab.alert && tab.count > 0
                    ? 'text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950 hover:bg-yellow-100 dark:bg-yellow-900'
                    : 'text-slate-600 dark:text-slate-300 dark:text-slate-300 hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-700 hover:text-slate-900 dark:text-white dark:hover:text-white'
                }`}
              >
                {tab.icon && <tab.icon size={14} />}
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    view === tab.id ? 'bg-white/20 text-white' :
                    tab.alert && tab.count > 0 ? 'bg-yellow-200 text-yellow-800 dark:text-yellow-200' :
                    'bg-slate-200 text-slate-600 dark:text-slate-300'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-4">
        {/* NEW ORDER VIEW */}
        {view === 'neworder' && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create New Order</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Fill in the order details below</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveNewOrder}
                    className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors text-sm"
                  >
                    Save Order
                  </button>
                  <button
                    onClick={cancelNewOrder}
                    className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-5 py-2.5 rounded-lg font-semibold transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {newOrder && (
                <div className="p-6 space-y-5">
                  {/* Basic Information */}
                  <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">Basic Information</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                          Customer Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newOrder.customer}
                          onChange={e => setNewOrder({...newOrder, customer: e.target.value})}
                          placeholder="Enter customer name"
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none text-lg"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Works Order Number</label>
                        <input
                          type="text"
                          value={newOrder.worksOrder || ''}
                          onChange={e => setNewOrder({...newOrder, worksOrder: e.target.value})}
                          placeholder="e.g., WO-2024-001"
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Description</label>
                        <input
                          type="text"
                          value={newOrder.description}
                          onChange={e => setNewOrder({...newOrder, description: e.target.value})}
                          placeholder="Order description"
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Specification</label>
                        <input
                          type="text"
                          value={newOrder.spec}
                          onChange={e => setNewOrder({...newOrder, spec: e.target.value})}
                          placeholder="e.g., C-Flute, 200gsm"
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Quantity (feeds)</label>
                        <input
                          type="text"
                          value={newOrder.quantity}
                          onChange={e => setNewOrder({...newOrder, quantity: e.target.value})}
                          placeholder="e.g., 50000"
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Production Details */}
                  <div className="border border-slate-200 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">Production Details</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Machine Assignment</label>
                        <select
                          value={newOrder.machineId || ''}
                          onChange={e => setNewOrder({...newOrder, machineId: parseInt(e.target.value) || null})}
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                        >
                          <option value="">Select Machine</option>
                          {MACHINES.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.capacity.toLocaleString()} feeds/day)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Planning Date</label>
                        <input
                          type="date"
                          value={newOrder.planningDate}
                          onChange={e => setNewOrder({...newOrder, planningDate: e.target.value})}
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Ship Date</label>
                        <input
                          type="date"
                          value={newOrder.shipsDate}
                          onChange={e => setNewOrder({...newOrder, shipsDate: e.target.value})}
                          className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* ── CAPACITY WARNING ── */}
                    {capacityWarning && (
                      <div className={`mt-4 rounded-xl border-2 overflow-hidden ${
                        capacityWarning.isOver ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950' :
                        capacityWarning.isNear ? 'border-yellow-400 dark:border-yellow-500 bg-yellow-50 dark:bg-yellow-950 dark:bg-yellow-950' :
                        'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950'
                      }`}>
                        {/* Header */}
                        <div className={`px-5 py-3 flex items-center justify-between ${
                          capacityWarning.isOver ? 'bg-red-500' :
                          capacityWarning.isNear ? 'bg-yellow-50 dark:bg-yellow-9500' :
                          'bg-green-500'
                        } text-white`}>
                          <div className="flex items-center gap-2 font-bold">
                            {capacityWarning.isOver ? '⚠️ OVER CAPACITY' :
                             capacityWarning.isNear ? '⚡ NEAR CAPACITY' :
                             '✓ CAPACITY OK'}
                            <span className="font-normal text-sm opacity-90">
                              — {capacityWarning.machine.name} on {new Date(newOrder.planningDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <div className="text-2xl font-black">{capacityWarning.utilisationPct}%</div>
                        </div>

                        {/* Capacity bar */}
                        <div className="px-5 pt-4 pb-2">
                          <div className="w-full h-7 bg-slate-200 rounded-lg overflow-hidden flex mb-2">
                            {/* Existing orders */}
                            <div
                              className="h-full bg-slate-50 dark:bg-slate-8000 flex items-center justify-center text-xs text-white font-semibold"
                              style={{ width: `${Math.min((capacityWarning.existingQty / capacityWarning.availableCapacity) * 100, 100)}%` }}
                            >
                              {(capacityWarning.existingQty / capacityWarning.availableCapacity) * 100 > 10 && 'Existing'}
                            </div>
                            {/* New order being added */}
                            <div
                              className={`h-full flex items-center justify-center text-xs text-white font-semibold ${
                                capacityWarning.isOver ? 'bg-red-500' :
                                capacityWarning.isNear ? 'bg-orange-400' :
                                'bg-blue-50 dark:bg-blue-9500'
                              }`}
                              style={{ width: `${Math.min((capacityWarning.newQty / capacityWarning.availableCapacity) * 100, 100 - Math.min((capacityWarning.existingQty / capacityWarning.availableCapacity) * 100, 100))}%` }}
                            >
                              {(capacityWarning.newQty / capacityWarning.availableCapacity) * 100 > 8 && 'This Order'}
                            </div>
                            {/* Remaining */}
                            {!capacityWarning.isOver && (
                              <div className="h-full bg-green-200 flex-1 flex items-center justify-center text-xs text-green-700 dark:text-green-300 font-semibold">
                                {(100 - (capacityWarning.totalAfterAdd / capacityWarning.availableCapacity) * 100) > 8 &&
                                  `${(capacityWarning.availableCapacity - capacityWarning.totalAfterAdd).toLocaleString()} remaining`}
                              </div>
                            )}
                          </div>

                          {/* Numbers row */}
                          <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-300 mb-3">
                            <span className="flex items-center gap-1">
                              <span className="w-2.5 h-2.5 bg-slate-50 dark:bg-slate-8000 rounded-sm inline-block"></span>
                              Existing: <b>{capacityWarning.existingQty.toLocaleString()}</b>
                            </span>
                            <span className={`flex items-center gap-1`}>
                              <span className={`w-2.5 h-2.5 rounded-sm inline-block ${capacityWarning.isOver ? 'bg-red-500' : capacityWarning.isNear ? 'bg-orange-400' : 'bg-blue-50 dark:bg-blue-9500'}`}></span>
                              This order: <b>{capacityWarning.newQty.toLocaleString()}</b>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2.5 h-2.5 bg-green-400 rounded-sm inline-block"></span>
                              Available: <b>{capacityWarning.availableCapacity.toLocaleString()}</b>
                            </span>
                            <span className="ml-auto font-semibold">
                              Total after: <b className={capacityWarning.isOver ? 'text-red-600 dark:text-red-400' : ''}>{capacityWarning.totalAfterAdd.toLocaleString()}</b>
                            </span>
                          </div>

                          {/* Over capacity detail */}
                          {capacityWarning.isOver && (
                            <div className="bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg px-4 py-2.5 mb-3 text-sm text-red-800 dark:text-red-200">
                              <b>Over by {(capacityWarning.totalAfterAdd - Math.round(capacityWarning.availableCapacity * 1.05)).toLocaleString()} feeds</b>
                              {' '}after 5% tolerance — this order will exceed {capacityWarning.machine.name}'s available capacity on this date.
                            </div>
                          )}

                          {/* Suggested alternative dates */}
                          {(capacityWarning.isOver || capacityWarning.isNear) && capacityWarning.suggestedDates.length > 0 && (
                            <div className="mb-3">
                              <div className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-2">
                                💡 Alternative dates with capacity available:
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {capacityWarning.suggestedDates.map(s => (
                                  <button
                                    key={s.date}
                                    type="button"
                                    onClick={() => setNewOrder({...newOrder, planningDate: s.date})}
                                    className="flex items-center gap-2 bg-white border-2 border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:bg-blue-950 rounded-lg px-3 py-2 text-sm transition-all"
                                  >
                                    <span className="font-bold text-blue-700 dark:text-blue-300">{s.dayName}</span>
                                    <span className="text-slate-500 dark:text-slate-400 text-xs">{s.remaining.toLocaleString()} available</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Existing orders on this date */}
                          {capacityWarning.existingOrders.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 font-semibold mb-1">
                                {capacityWarning.existingOrders.length} existing order{capacityWarning.existingOrders.length !== 1 ? 's' : ''} on this date
                              </summary>
                              <div className="mt-2 space-y-1 pl-2">
                                {capacityWarning.existingOrders.map(o => (
                                  <div key={o.id} className="flex justify-between text-slate-600 dark:text-slate-300 bg-white rounded px-3 py-1.5 border border-slate-200">
                                    <span>{o.customer}{o.description ? ` — ${o.description}` : ''}</span>
                                    <span className="font-bold ml-4">{parseInt(String(o.quantity||'0').replace(/,/g,'')).toLocaleString()} feeds</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Validations */}
                  <div className="border border-slate-200 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">Validation Checklist</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {VALIDATIONS.map(v => {
                        const key = v.toLowerCase().replace(/\s+/g, '');
                        const checked = newOrder.validations?.[key] || false;
                        return (
                          <label
                            key={v}
                            className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                              checked 
                                ? 'border-green-500 bg-green-50 shadow-sm' 
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setNewOrder({
                                ...newOrder,
                                validations: {
                                  ...newOrder.validations,
                                  [key]: !checked
                                }
                              })}
                              className="w-5 h-5 text-green-600 dark:text-green-400 rounded focus:ring-2 focus:ring-green-500"
                            />
                            <span className={`text-sm ${checked ? 'font-semibold text-green-900' : 'text-slate-700 dark:text-slate-200'}`}>
                              {v}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="border border-slate-200 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">Additional Notes</h3>
                    <textarea
                      value={newOrder.notes}
                      onChange={e => setNewOrder({...newOrder, notes: e.target.value})}
                      placeholder="Add any additional notes or special instructions for this order..."
                      rows={4}
                      className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Action Buttons (Bottom) */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={saveNewOrder}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-lg font-semibold transition-colors shadow-sm text-lg"
                    >
                      ✓ Save Order
                    </button>
                    <button
                      onClick={cancelNewOrder}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 dark:text-slate-200 px-6 py-4 rounded-lg font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 border-l-blue-500 p-4">
                <div className="text-sm text-slate-600 dark:text-slate-300 font-semibold mb-1">Active Orders</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.totalActive}</div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 border-l-emerald-500 p-4">
                <div className="text-sm text-slate-600 dark:text-slate-300 font-semibold mb-1">Completed</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.totalCompleted}</div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 border-l-yellow-400 p-4">
                <div className="text-sm text-slate-600 dark:text-slate-300 font-semibold mb-1">Avg Lead Time</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.avgLeadTime} <span className="text-lg text-slate-600 dark:text-slate-300">days</span></div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 border-l-red-500 p-4">
                <div className="text-sm text-slate-600 dark:text-slate-300 font-semibold mb-1">Capacity Alerts</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.overCapacityDays}</div>
              </div>
            </div>

            {/* Alerts Section */}
            {(analytics.overCapacityDays > 0 || analytics.bottlenecks.length > 0 || analytics.kickOffRequired?.length > 0) && (
              <div className="bg-red-50 dark:bg-red-950 border-2 border-red-200 dark:border-red-800 rounded-xl p-6">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="text-red-600 dark:text-red-400 mt-1" size={24} />
                  <div>
                    <h3 className="text-lg font-bold text-red-900 dark:text-red-100">Production Alerts</h3>
                    <p className="text-sm text-red-700 dark:text-red-300">Issues requiring immediate attention</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {analytics.overCapacityDays > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border-l-4 border-red-500 dark:border-red-400">
                      <div className="font-semibold text-red-900 dark:text-red-100">
                        ⚠️ {analytics.overCapacityDays} day(s) over capacity in next 14 days
                      </div>
                      <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                        Review capacity planning tab to redistribute workload
                      </div>
                    </div>
                  )}
                  {analytics.bottlenecks.map(([validation, stats]) => (
                    <div key={validation} className="bg-white dark:bg-slate-800 rounded-lg p-4 border-l-4 border-orange-500 dark:border-orange-400 dark:border-orange-600">
                      <div className="font-semibold text-yellow-900 dark:text-yellow-100">
                        📋 {validation}: Only {stats.percentage}% complete ({stats.completed}/{stats.total} orders)
                      </div>
                      <div className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        This validation is blocking progress on multiple orders
                      </div>
                    </div>
                  ))}
                  {analytics.kickOffRequired && analytics.kickOffRequired.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border-l-4 border-blue-500 dark:border-blue-400">
                      <div className="font-semibold text-blue-900 dark:text-blue-100">
                        📅 {analytics.kickOffRequired.length} order{analytics.kickOffRequired.length !== 1 ? 's' : ''} requiring kick-off meeting
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        {analytics.kickOffRequired.slice(0, 3).map(o => o.customer).join(', ')}
                        {analytics.kickOffRequired.length > 3 && ` and ${analytics.kickOffRequired.length - 3} more`}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 14-Day Forecast */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">14-Day Capacity Forecast</h3>
              {analytics.forecast.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  No scheduled production in the next 14 days
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.forecast.slice(0, 7).map((f, idx) => (
                    <div key={idx} className={`p-4 rounded-lg border-2 ${
                      f.isOver ? 'border-red-500 dark:border-red-600 bg-red-50 dark:bg-red-950' : 
                      f.isNear ? 'border-orange-500 dark:border-orange-600 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:bg-yellow-950' : 
                      'border-slate-200 bg-slate-50 dark:bg-slate-800'
                    }`}>
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="font-bold">
                            {new Date(f.date).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="ml-3 text-slate-600 dark:text-slate-300">{f.machine}</span>
                        </div>
                        <div className={`font-bold text-right ${f.isOver ? 'text-red-600 dark:text-red-400' : f.isNear ? 'text-yellow-600 dark:text-yellow-400' : 'text-slate-700 dark:text-slate-200'}`}>
                          <div>{f.nonStockUsed.toLocaleString()} / {f.availableCapacity.toLocaleString()} available</div>
                          <div className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            ({f.percentageOfAvailable}% of available • {f.percentageOfTotal}% of total)
                          </div>
                        </div>
                      </div>
                      
                      {/* Dual-capacity progress bar */}
                      <div className="relative w-full bg-slate-200 rounded-full h-4 mb-1">
                        {/* Stock reserved (baseline) */}
                        <div 
                          className="absolute h-4 bg-slate-400 rounded-full"
                          style={{ width: `${(f.stockReserved / f.totalCapacity) * 100}%` }}
                          title={`Stock Reserved: ${f.stockReserved.toLocaleString()}`}
                        />
                        {/* Non-stock orders (on top of stock) */}
                        <div 
                          className={`absolute h-4 rounded-full transition-all ${
                            f.isOver ? 'bg-red-600' : f.isNear ? 'bg-yellow-50 dark:bg-yellow-9500' : 'bg-blue-50 dark:bg-blue-9500'
                          }`}
                          style={{ 
                            left: `${(f.stockReserved / f.totalCapacity) * 100}%`,
                            width: `${Math.min((f.nonStockUsed / f.totalCapacity) * 100, 100 - (f.stockReserved / f.totalCapacity) * 100)}%`
                          }}
                          title={`Non-Stock Orders: ${f.nonStockUsed.toLocaleString()}`}
                        />
                      </div>
                      
                      {/* Legend */}
                      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300 mb-2">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-slate-400 rounded"></div>
                            <span>Stock: {f.stockReserved.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className={`w-3 h-3 rounded ${f.isOver ? 'bg-red-600' : f.isNear ? 'bg-yellow-50 dark:bg-yellow-9500' : 'bg-blue-50 dark:bg-blue-9500'}`}></div>
                            <span>Non-Stock: {f.nonStockUsed.toLocaleString()}</span>
                          </div>
                        </div>
                        <span className="font-semibold">Total: {f.totalCapacity.toLocaleString()}</span>
                      </div>

                      {f.isOver && (
                        <div className="bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg p-3">
                          <div className="font-semibold text-red-900 dark:text-red-100">
                            ⚠️ OVER AVAILABLE CAPACITY (exceeds 105% tolerance)
                          </div>
                          <div className="text-sm text-red-700 dark:text-red-300 mt-1">
                            Non-stock orders exceed available capacity after stock reservation
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Machine Utilisation */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">Machine Utilisation (All Orders)</h3>
              <div className="grid grid-cols-2 gap-4">
                {analytics.machineUtil.map(m => {
                  const utilisationColor = m.utilisationPercent >= 100 ? 'text-red-600 dark:text-red-400' : 
                                          m.utilisationPercent >= 90 ? 'text-yellow-600 dark:text-yellow-400' : 
                                          'text-slate-900 dark:text-white';
                  return (
                    <div key={m.machine} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-lg text-slate-900 dark:text-white">{m.machine}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{m.fullName}</div>
                        </div>
                        <div className={`text-2xl font-bold ${utilisationColor}`}>
                          {m.utilisationPercent}%
                        </div>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-300 mt-2 space-y-1">
                        <div>{m.orders} order{m.orders !== 1 ? 's' : ''} across {m.scheduledDays} day{m.scheduledDays !== 1 ? 's' : ''}</div>
                        <div className="font-semibold">
                          Avg {m.avgPerDay.toLocaleString()}/day · Cap {m.availableCapacity.toLocaleString()}/day
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 mt-3">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            m.utilisationPercent >= 100 ? 'bg-red-600' : 
                            m.utilisationPercent >= 90 ? 'bg-yellow-50 dark:bg-yellow-9500' : 
                            'bg-blue-50 dark:bg-blue-9500'
                          }`}
                          style={{ width: `${Math.min(m.utilisationPercent, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CAPACITY PLANNING VIEW */}
        {view === 'capacity' && (
          <div className="space-y-5">

            {/* TOP SUMMARY STRIP - at-a-glance for all machines */}
            <div className="grid grid-cols-4 gap-3">
              {MACHINES.map(machine => {
                const todayStr = new Date().toISOString().split('T')[0];
                const machineActiveOrders = active.filter(o => o.machineId === machine.id && o.planningDate && o.planningDate >= todayStr);
                const totalScheduled = machineActiveOrders.reduce((sum, o) => sum + (parseInt(String(o.quantity||'0').replace(/,/g,''))||0), 0);
                const scheduledDays = new Set(machineActiveOrders.map(o => o.planningDate)).size;
                const avgPerDay = scheduledDays > 0 ? totalScheduled / scheduledDays : 0;
                const utilPct = Math.round((avgPerDay / machine.availableCapacity) * 100);
                const stockReserved = Math.round(machine.capacity * (machine.stockPercentage / 100));
                const isOver = utilPct > 105;
                const isNear = utilPct >= 90 && utilPct <= 105;
                return (
                  <div key={machine.id} className={`rounded-xl p-4 border-2 ${
                    isOver ? 'bg-red-50 dark:bg-red-950 border-red-400 dark:border-red-600' :
                    isNear ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-400' :
                    'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white">{machine.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{machine.fullName}</div>
                      </div>
                      <div className={`text-2xl font-black ${isOver ? 'text-red-600 dark:text-red-400' : isNear ? 'text-orange-500' : 'text-blue-600 dark:text-blue-400'}`}>
                        {utilPct}%
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 mb-3">
                      <div className={`h-3 rounded-full transition-all ${isOver ? 'bg-red-500' : isNear ? 'bg-yellow-50 dark:bg-yellow-9500' : 'bg-blue-50 dark:bg-blue-9500'}`}
                        style={{ width: `${Math.min(utilPct, 100)}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white rounded-lg p-2 border border-slate-100">
                        <div className="text-slate-400 mb-0.5">Avg/Day</div>
                        <div className="font-bold text-slate-800 dark:text-slate-100">{Math.round(avgPerDay).toLocaleString()}</div>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-100">
                        <div className="text-slate-400 mb-0.5">Available</div>
                        <div className="font-bold text-blue-700 dark:text-blue-300">{machine.availableCapacity.toLocaleString()}</div>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-100">
                        <div className="text-slate-400 mb-0.5">Stock Alloc.</div>
                        <div className="font-bold text-slate-600 dark:text-slate-300">{stockReserved.toLocaleString()}</div>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-100">
                        <div className="text-slate-400 mb-0.5">Days Booked</div>
                        <div className="font-bold text-slate-800 dark:text-slate-100">{scheduledDays}</div>
                      </div>
                    </div>
                    {isOver && <div className="mt-2 text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 rounded-lg px-2 py-1 text-center">⚠️ OVER CAPACITY</div>}
                    {isNear && !isOver && <div className="mt-2 text-xs font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900 rounded-lg px-2 py-1 text-center">⚡ NEAR CAPACITY</div>}
                    {!isOver && !isNear && <div className="mt-2 text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900 rounded-lg px-2 py-1 text-center">✓ OK</div>}
                  </div>
                );
              })}
            </div>

            {/* FILTERS */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Filter by Machine</label>
                  <select 
                    value={filterMachine} 
                    onChange={e => setFilterMachine(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-yellow-400 focus:outline-none text-sm"
                  >
                    <option value="All">All Machines</option>
                    {MACHINES.map(m => <option key={m.id} value={m.id}>{m.name} — {m.fullName}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Filter by Date</label>
                  <div className="flex gap-2">
                    <input 
                      type="date" 
                      value={filterDate} 
                      onChange={e => setFilterDate(e.target.value)}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 focus:border-yellow-400 focus:outline-none text-sm"
                    />
                    {filterDate && (
                      <button onClick={() => setFilterDate('')} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-lg transition-colors text-sm">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 border-l border-slate-200 pl-4">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-slate-400 rounded-sm"></div>Stock</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-50 dark:bg-blue-9500 rounded-sm"></div>Non-Stock</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-400 rounded-sm"></div>Available</div>
                </div>
              </div>
            </div>

            {/* PER-MACHINE DAILY BREAKDOWN */}
            {MACHINES.filter(m => filterMachine === 'All' || m.id === parseInt(filterMachine)).map(machine => {
              const dates = Array.from(new Set(
                orders
                  .filter(o => o.planningDate && o.status !== 'Complete' && o.status !== 'Deleted' && (!filterDate || o.planningDate === filterDate))
                  .map(o => o.planningDate)
              )).sort();

              const stockReserved = Math.round(machine.capacity * (machine.stockPercentage / 100));

              const machineOrders = dates.map(date => {
                const ordersOnDate = orders.filter(o => 
                  o.machineId === machine.id && 
                  o.planningDate === date &&
                  o.status !== 'Complete' &&
                  o.status !== 'Deleted'
                );
                const nonStockUsed = ordersOnDate.reduce((sum, o) => {
                  const qty = parseInt(String(o.quantity || '0').replace(/,/g, '')) || 0;
                  return sum + qty;
                }, 0);
                const totalUsed = stockReserved + nonStockUsed;
                return {
                  date, orders: ordersOnDate, nonStockUsed, stockReserved, totalUsed,
                  totalCapacity: machine.capacity,
                  availableCapacity: machine.availableCapacity,
                  remaining: Math.max(0, machine.availableCapacity - nonStockUsed),
                  percentageOfAvailable: Math.round((nonStockUsed / machine.availableCapacity) * 100),
                  percentageOfTotal: Math.round((totalUsed / machine.capacity) * 100),
                  isOver: nonStockUsed > machine.availableCapacity * 1.05,
                  isNear: nonStockUsed >= machine.availableCapacity * 0.9 && nonStockUsed <= machine.availableCapacity * 1.05
                };
              }).filter(d => d.orders.length > 0);

              if (machineOrders.length === 0 && filterMachine !== 'All') return (
                <div key={machine.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
                  No scheduled orders for {machine.name}
                </div>
              );
              if (machineOrders.length === 0) return null;

              return (
                <div key={machine.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  
                  {/* Machine Header */}
                  <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center font-black text-slate-900 dark:text-white text-sm">{machine.name}</div>
                      <div>
                        <div className="font-bold text-white text-lg">{machine.fullName}</div>
                        <div className="text-slate-400 text-xs">
                          Total: {machine.capacity.toLocaleString()} feeds · Stock: {stockReserved.toLocaleString()} ({machine.stockPercentage}%) · Available: {machine.availableCapacity.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-xs mb-0.5">{machineOrders.length} day{machineOrders.length !== 1 ? 's' : ''} scheduled</div>
                      <div className="text-white font-bold">{machineOrders.reduce((s,d) => s + d.orders.length, 0)} orders</div>
                    </div>
                  </div>

                  {/* Daily rows */}
                  <div className="divide-y divide-slate-100">
                    {machineOrders.map(day => {
                      const dateObj = new Date(day.date + 'T00:00:00');
                      const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
                      const dayNum = dateObj.toLocaleDateString('en-GB', { day: 'numeric' });
                      const monthName = dateObj.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                      const stockPct = (day.stockReserved / day.totalCapacity) * 100;
                      const nonStockPct = Math.min((day.nonStockUsed / day.totalCapacity) * 100, 100 - stockPct);
                      const remainPct = Math.max(0, 100 - stockPct - nonStockPct);

                      return (
                        <div key={day.date} className={`p-5 ${day.isOver ? 'bg-red-50' : day.isNear ? 'bg-yellow-50 dark:bg-yellow-950' : 'bg-white'}`}>
                          
                          {/* Row top: date + capacity bar + numbers */}
                          <div className="flex gap-4 items-center mb-3">
                            
                            {/* Date badge */}
                            <div className={`flex-shrink-0 w-16 text-center rounded-lg py-2 border-2 ${
                              day.isOver ? 'bg-red-100 border-red-300' :
                              day.isNear ? 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300' :
                              'bg-slate-50 dark:bg-slate-800 border-slate-200'
                            }`}>
                              <div className={`text-xs font-bold uppercase tracking-wide ${day.isOver ? 'text-red-500' : day.isNear ? 'text-orange-500' : 'text-slate-400'}`}>{dayName}</div>
                              <div className={`text-2xl font-black leading-none ${day.isOver ? 'text-red-700 dark:text-red-300' : day.isNear ? 'text-yellow-700 dark:text-yellow-300' : 'text-slate-800 dark:text-slate-100'}`}>{dayNum}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{monthName}</div>
                            </div>

                            {/* Capacity bar area */}
                            <div className="flex-1">
                              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                                <span>{day.orders.length} order{day.orders.length !== 1 ? 's' : ''}</span>
                                <span className={`font-bold ${day.isOver ? 'text-red-600 dark:text-red-400' : day.isNear ? 'text-yellow-600 dark:text-yellow-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                  {day.percentageOfAvailable}% of available
                                </span>
                              </div>
                              {/* Stacked capacity bar */}
                              <div className="w-full h-8 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden flex">
                                <div className="h-full bg-slate-400 flex items-center justify-center text-xs text-white font-semibold" style={{ width: `${stockPct}%` }}>
                                  {stockPct > 8 && 'Stock'}
                                </div>
                                <div className={`h-full flex items-center justify-center text-xs text-white font-semibold ${day.isOver ? 'bg-red-500' : day.isNear ? 'bg-yellow-50 dark:bg-yellow-9500' : 'bg-blue-50 dark:bg-blue-9500'}`} style={{ width: `${nonStockPct}%` }}>
                                  {nonStockPct > 8 && day.nonStockUsed.toLocaleString()}
                                </div>
                                <div className="h-full bg-green-200 flex items-center justify-center text-xs text-green-700 dark:text-green-300 font-semibold" style={{ width: `${remainPct}%` }}>
                                  {remainPct > 8 && day.remaining.toLocaleString()}
                                </div>
                              </div>
                              {/* Numbers below bar */}
                              <div className="flex gap-3 mt-1.5 text-xs">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-slate-400 rounded-sm inline-block"></span>Stock: <b>{day.stockReserved.toLocaleString()}</b></span>
                                <span className={`flex items-center gap-1`}><span className={`w-2 h-2 rounded-sm inline-block ${day.isOver ? 'bg-red-500' : day.isNear ? 'bg-yellow-50 dark:bg-yellow-9500' : 'bg-blue-50 dark:bg-blue-9500'}`}></span>Orders: <b>{day.nonStockUsed.toLocaleString()}</b></span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-sm inline-block"></span>Remaining: <b className="text-green-700 dark:text-green-300">{day.remaining.toLocaleString()}</b></span>
                                <span className="ml-auto text-slate-400">Total: <b className="text-slate-700 dark:text-slate-200">{day.totalCapacity.toLocaleString()}</b></span>
                              </div>
                            </div>

                            {/* Status badge */}
                            <div className={`flex-shrink-0 w-20 text-center rounded-lg py-3 ${
                              day.isOver ? 'bg-red-500 text-white' :
                              day.isNear ? 'bg-yellow-50 dark:bg-yellow-9500 text-white' :
                              'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            }`}>
                              <div className="text-xl font-black">{day.percentageOfAvailable}%</div>
                              <div className="text-xs font-semibold leading-tight">{day.isOver ? 'OVER' : day.isNear ? 'NEAR' : 'OK'}</div>
                            </div>
                          </div>

                          {/* Over capacity warning */}
                          {day.isOver && (
                            <div className="flex items-center gap-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg px-4 py-2 mb-3 text-sm">
                              <span className="text-red-600 dark:text-red-400 font-bold text-base">⚠️</span>
                              <span className="text-red-800 dark:text-red-200">
                                <b>Over capacity by {(day.nonStockUsed - Math.round(day.availableCapacity * 1.05)).toLocaleString()} feeds</b>
                                {' '}— Consider rescheduling or reallocating orders
                              </span>
                            </div>
                          )}

                          {/* Orders list - compact */}
                          <div className="grid grid-cols-1 gap-1.5 pl-20">
                            {day.orders.map(o => (
                              <div key={o.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${day.isOver ? 'bg-red-400' : day.isNear ? 'bg-orange-400' : 'bg-blue-400'}`}></div>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-900 dark:text-white truncate">{o.customer}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{o.description}{o.worksOrder && ` · ${o.worksOrder}`}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                                  {o.spec && <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono">{o.spec}</span>}
                                  <div className="text-right">
                                    <div className="font-bold text-slate-900 dark:text-white">{parseInt(String(o.quantity||'0').replace(/,/g,'')).toLocaleString()}</div>
                                    <div className="text-xs text-slate-400">feeds</div>
                                  </div>
                                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[o.status] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{o.status}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ORDERS LIST VIEW (Active, Completed, All, Material Needed) */}
        {(view === 'active' || view === 'completed' || view === 'all' || view === 'materialneeded') && (
          <div className="space-y-4">
            {/* Material Needed Info Banner */}
            {view === 'materialneeded' && (
              <div className="bg-yellow-50 dark:bg-yellow-950 border-2 border-yellow-300 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="text-3xl">📦</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-amber-900 mb-1">Material Purchasing Queue</h3>
                    <p className="text-yellow-800 dark:text-yellow-200 mb-3">
                      These orders need materials to be purchased. Check the "Material Purchasing" box when materials have been ordered.
                    </p>
                    <div className="bg-white rounded-lg p-3 border border-yellow-200">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">Showing {materialNeeded.length} order{materialNeeded.length !== 1 ? 's' : ''} requiring material purchasing</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search, Sort, and Filter Controls */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className={`grid ${view === 'active' ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search by customer, works order, or spec..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-lg focus:border-yellow-400 focus:outline-none"
                  />
                  {searchFilter && (
                    <button 
                      onClick={() => setSearchFilter('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-300">
                      <X size={20} />
                    </button>
                  )}
                </div>

                {/* Sort */}
                <div>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:border-yellow-400 focus:outline-none"
                  >
                    <option value="planningDate">Sort by Planning Date</option>
                    <option value="customer">Sort by Customer</option>
                    <option value="status">Sort by Status</option>
                  </select>
                </div>

                {/* Validation Filter (Active view only) */}
                {view === 'active' && (
                  <div>
                    <select
                      value={validationFilter}
                      onChange={e => setValidationFilter(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:border-yellow-400 focus:outline-none font-semibold"
                    >
                      <option value="all">All Orders ({active.length})</option>
                      <option value="materialpurchasing">
                        Material Purchasing Needed ({active.filter(o => !o.validations?.materialpurchasing).length})
                      </option>
                      <option value="pending">
                        Any Validations Pending ({active.filter(o => {
                          const validations = o.validations || {};
                          return VALIDATIONS.some(v => !validations[v.toLowerCase().replace(/\s+/g, '')]);
                        }).length})
                      </option>
                    </select>
                  </div>
                )}
              </div>

              {/* Active filter indicators */}
              {(searchFilter || validationFilter !== 'all') && view === 'active' && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {searchFilter && (
                    <div className="flex items-center gap-2 bg-blue-100 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-semibold">
                      Search: "{searchFilter}"
                      <button onClick={() => setSearchFilter('')} className="hover:text-blue-900 dark:text-blue-100">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {validationFilter === 'materialpurchasing' && (
                    <div className="flex items-center gap-2 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-3 py-1 rounded-full text-sm font-semibold">
                      📦 Material Purchasing Needed
                      <button onClick={() => setValidationFilter('all')} className="hover:text-amber-900">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {validationFilter === 'pending' && (
                    <div className="flex items-center gap-2 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-3 py-1 rounded-full text-sm font-semibold">
                      ⏳ Pending Validations
                      <button onClick={() => setValidationFilter('all')} className="hover:text-yellow-900 dark:text-yellow-100">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={() => {
                      setSearchFilter('');
                      setValidationFilter('all');
                    }}
                    className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:text-white text-sm font-semibold underline">
                    Clear all filters
                  </button>
                </div>
              )}
            </div>

            {display.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
                <Package size={48} className="mx-auto text-slate-300 mb-4" />
                <div className="text-xl font-semibold text-slate-600 dark:text-slate-300">No orders found</div>
                <div className="text-slate-500 dark:text-slate-400 mt-2">
                  {searchFilter ? 'Try adjusting your search' : 'Create a new order to get started'}
                </div>
              </div>
            ) : (
              display.map(order => (
                <div key={order.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:shadow-sm transition-all">
                  {/* Order Header - Always Visible */}
                  <div 
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    className="p-5 cursor-pointer hover:bg-slate-50 dark:bg-slate-800 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 grid grid-cols-5 gap-4">
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">CUSTOMER</div>
                          <input
                            type="text"
                            value={editingOrder[order.id]?.customer ?? order.customer ?? ''}
                            onChange={e => {
                              e.stopPropagation();
                              updateEditingOrder(order.id, 'customer', e.target.value);
                            }}
                            onBlur={() => saveEditingOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                            placeholder="Customer name"
                            className="font-bold text-slate-900 dark:text-white w-full border-b-2 border-transparent hover:border-slate-200 focus:border-yellow-400 focus:outline-none px-1 py-1"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">WORKS ORDER</div>
                          <input
                            type="text"
                            value={editingOrder[order.id]?.worksOrder ?? order.worksOrder ?? ''}
                            onChange={e => {
                              e.stopPropagation();
                              updateEditingOrder(order.id, 'worksOrder', e.target.value);
                            }}
                            onBlur={() => saveEditingOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                            placeholder="Works order #"
                            className="text-slate-700 dark:text-slate-200 w-full border-b-2 border-transparent hover:border-slate-200 focus:border-yellow-400 focus:outline-none px-1 py-1"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">DESCRIPTION</div>
                          <input
                            type="text"
                            value={editingOrder[order.id]?.description ?? order.description ?? ''}
                            onChange={e => {
                              e.stopPropagation();
                              updateEditingOrder(order.id, 'description', e.target.value);
                            }}
                            onBlur={() => saveEditingOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                            placeholder="Order description"
                            className="text-slate-700 dark:text-slate-200 w-full border-b-2 border-transparent hover:border-slate-200 focus:border-yellow-400 focus:outline-none px-1 py-1"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">PLANNING DATE</div>
                          <input
                            type="date"
                            value={editingOrder[order.id]?.planningDate ?? order.planningDate ?? ''}
                            onChange={e => {
                              e.stopPropagation();
                              updateEditingOrder(order.id, 'planningDate', e.target.value);
                            }}
                            onBlur={() => saveEditingOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                            className="text-slate-700 dark:text-slate-200 w-full border-b-2 border-transparent hover:border-slate-200 focus:border-yellow-400 focus:outline-none px-1 py-1"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">STATUS</div>
                          <select
                            value={order.status || 'In Progress'}
                            onChange={e => {
                              e.stopPropagation();
                              updateOrder(order.id, { status: e.target.value });
                            }}
                            onClick={e => e.stopPropagation()}
                            className={`w-full px-3 py-1 rounded-lg border-2 font-semibold text-sm ${STATUS_COLORS[order.status] || STATUS_COLORS['In Progress']}`}
                          >
                            <option value="In Progress">In Progress</option>
                            <option value="Urgent">Urgent</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Complete">Complete</option>
                            <option value="Deleted">🗑️ Delete</option>
                          </select>
                        </div>
                      </div>
                      
                      {/* Expand Button */}
                      <button className="ml-4 text-slate-400 hover:text-slate-600 dark:text-slate-300">
                        {expandedOrder === order.id ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedOrder === order.id && (
                    <div className="border-t-2 border-slate-200 bg-slate-50 dark:bg-slate-800 p-5 space-y-5">
                      {/* Additional Fields */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">SPEC</label>
                          <input
                            type="text"
                            value={editingOrder[order.id]?.spec ?? order.spec ?? ''}
                            onChange={e => updateEditingOrder(order.id, 'spec', e.target.value)}
                            onBlur={() => saveEditingOrder(order.id)}
                            placeholder="Specification"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-yellow-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">QUANTITY</label>
                          <input
                            type="text"
                            value={editingOrder[order.id]?.quantity ?? order.quantity ?? ''}
                            onChange={e => updateEditingOrder(order.id, 'quantity', e.target.value)}
                            onBlur={() => saveEditingOrder(order.id)}
                            placeholder="0"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-yellow-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">MACHINE</label>
                          <select
                            value={order.machineId || ''}
                            onChange={e => updateOrder(order.id, { machineId: parseInt(e.target.value) || null })}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-yellow-400 focus:outline-none"
                          >
                            <option value="">Not Assigned</option>
                            {MACHINES.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.capacity.toLocaleString()} feeds/day)</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Validations */}
                      <div>
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">VALIDATION CHECKLIST</div>
                        <div className="grid grid-cols-4 gap-3">
                          {VALIDATIONS.map(v => {
                            const key = v.toLowerCase().replace(/\s+/g, '');
                            const checked = order.validations?.[key] || false;
                            const isMaterialPurchasing = key === 'materialpurchasing';
                            const highlightMaterial = view === 'materialneeded' && isMaterialPurchasing;
                            
                            return (
                              <label
                                key={v}
                                className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                  checked 
                                    ? 'border-green-500 bg-green-50 shadow-sm' 
                                    : highlightMaterial
                                    ? 'border-yellow-400 dark:border-yellow-500 bg-yellow-50 dark:bg-yellow-950 dark:bg-yellow-950 shadow-sm ring-2 ring-amber-300'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleVal(order.id, key)}
                                  className="w-5 h-5 text-green-600 dark:text-green-400 rounded focus:ring-2 focus:ring-green-500"
                                />
                                <span className={`text-sm ${
                                  checked 
                                    ? 'font-semibold text-green-900' 
                                    : highlightMaterial
                                    ? 'font-bold text-amber-900'
                                    : 'text-slate-700 dark:text-slate-200'
                                }`}>
                                  {highlightMaterial && '📦 '}
                                  {v}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2">NOTES</label>
                        <textarea
                          value={editingOrder[order.id]?.notes ?? order.notes ?? ''}
                          onChange={e => updateEditingOrder(order.id, 'notes', e.target.value)}
                          onBlur={() => saveEditingOrder(order.id)}
                          placeholder="Add notes about this order..."
                          rows={3}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-yellow-400 focus:outline-none resize-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className={`rounded-xl shadow-sm p-4 min-w-[300px] max-w-md border-2 ${
            toast.type === 'success' ? 'bg-green-50 border-green-500 text-green-900' :
            toast.type === 'error' ? 'bg-red-50 border-red-500 text-red-900 dark:text-red-100' :
            'bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-900 dark:text-blue-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`text-2xl ${
                toast.type === 'success' ? 'text-green-600 dark:text-green-400' :
                toast.type === 'error' ? 'text-red-600 dark:text-red-400' :
                'text-blue-600 dark:text-blue-400'
              }`}>
                {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'ℹ'}
              </div>
              <div className="flex-1 font-semibold">
                {toast.message}
              </div>
              <button 
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-300">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Orders Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-3 rounded-full">
                <AlertTriangle className="text-red-600 dark:text-red-400" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-red-900 dark:text-red-100">Delete All Orders?</h2>
                <p className="text-red-700 dark:text-red-300">This action cannot be undone!</p>
              </div>
            </div>
            
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-900 dark:text-red-100 font-semibold mb-2">
                You are about to permanently delete:
              </p>
              <ul className="text-red-800 dark:text-red-200 space-y-1 ml-4">
                <li>• <span className="font-bold">{orders.length}</span> total orders</li>
                <li>• <span className="font-bold">{active.length}</span> active orders</li>
                <li>• <span className="font-bold">{completed.length}</span> completed orders</li>
              </ul>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-900 dark:text-white mb-2">
                Type <span className="bg-red-100 text-red-900 dark:text-red-100 px-2 py-1 rounded font-mono">DELETE ALL</span> to confirm:
              </label>
              <input
                type="text"
                value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                placeholder="Type DELETE ALL"
                className="w-full border border-slate-200 rounded-lg px-4 py-3 focus:border-red-500 focus:outline-none text-lg font-mono"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (clearConfirmText === 'DELETE ALL') {
                    try {
                      await firebaseService.clearAllOrders();
                      setShowClearModal(false);
                      setClearConfirmText('');
                      showToast('All orders have been deleted.', 'success');
                    } catch (error) {
                      console.error('Error clearing all orders:', error);
                      showToast('Failed to delete all orders', 'error');
                    }
                  } else {
                    showToast('Please type DELETE ALL exactly to confirm.', 'error');
                  }
                }}
                disabled={clearConfirmText !== 'DELETE ALL'}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                  clearConfirmText === 'DELETE ALL'
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                Delete All Orders
              </button>
              <button
                onClick={() => {
                  setShowClearModal(false);
                  setClearConfirmText('');
                }}
                className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
