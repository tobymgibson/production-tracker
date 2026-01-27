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
  'In Progress': 'bg-blue-100 text-blue-800 border-blue-300',
  'Complete': 'bg-green-100 text-green-800 border-green-300',
  'Deleted': 'bg-red-100 text-red-800 border-red-300',
  'On Hold': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Urgent': 'bg-orange-100 text-orange-800 border-orange-300'
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
      
      // Also save to localStorage as backup
      localStorage.setItem('orders-final', JSON.stringify(ordersData));
    });
    
    // Subscribe to real-time machine updates
    const unsubscribeMachines = firebaseService.subscribeToMachines((machinesData) => {
      console.log(`🔥 Real-time update: ${machinesData.length} machines`);
      if (machinesData.length > 0) {
        setMachines(machinesData);
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
      // Save to Firebase - all users will see the update in real-time!
      await firebaseService.saveOrders(data);
      
      // Also update local state
      setOrders(data);
      setLastSyncTime(new Date());
      
      // Backup to localStorage
      localStorage.setItem('orders-final', JSON.stringify(data));
      
      console.log(`✅ Saved ${data.length} orders to Firebase`);
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

  const deleteOrder = (id) => {
    const order = orders.find(o => o.id === id);
    const confirmed = window.confirm(`DELETE ORDER?\n\nCustomer: ${order?.customer}\n\nThis cannot be undone!`);
    if (confirmed) {
      const filtered = orders.filter(o => o.id !== id);
      save(filtered);
    }
  };

  const toggleVal = (id, key) => {
    save(orders.map(o => o.id === id ? {...o, validations: {...o.validations, [key]: !o.validations[key]}} : o));
  };

  const updateOrder = (id, updates) => {
    save(orders.map(o => o.id === id ? {...o, ...updates} : o));
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
      await save([{...newOrder, id: `${Date.now()}`}, ...orders]);
      setNewOrder(null);
      setView('active');
      showToast('Order created successfully!', 'success');
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
    const active = orders.filter(o => o.status !== 'Complete' && o.status !== 'Deleted');
    
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

    // Machine utilization
    const machineUtil = MACHINES.map(machine => {
      const machineOrders = active.filter(o => o.machineId === machine.id);
      const totalQty = machineOrders.reduce((sum, o) => {
        const qty = parseInt(String(o.quantity || '0').replace(/,/g, '')) || 0;
        return sum + qty;
      }, 0);
      
      return {
        machine: machine.name,
        fullName: machine.fullName,
        orders: machineOrders.length,
        totalQuantity: totalQty,
        availableCapacity: machine.availableCapacity,
        utilizationPercent: Math.round((totalQty / machine.availableCapacity) * 100)
      };
    });

    return {
      validationStats,
      bottlenecks,
      forecast: forecast.sort((a, b) => new Date(a.date) - new Date(b.date)),
      overCapacityDays,
      nearCapacityDays,
      avgLeadTime: Math.round(avgLeadTime),
      machineUtil,
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md">
          <div className="flex justify-center mb-6">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-4 rounded-xl">
              <Lock size={40} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center mb-2 text-slate-900">Production Tracker</h1>
          <p className="text-center text-slate-600 mb-8 text-sm">Corrugated Sheet Plant Planning System</p>
          <div className="relative mb-6">
            <input
              type={showPwd ? 'text' : 'password'}
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && pwd === 'corrugated2025' && setAuth(true)}
              placeholder="Enter password"
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 pr-12 focus:border-amber-500 focus:outline-none transition-colors"
            />
            <button 
              onClick={() => setShowPwd(!showPwd)} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <button
            onClick={() => pwd === 'corrugated2025' ? setAuth(true) : alert('Incorrect password')}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white py-3 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl"
          >
            Access System
          </button>
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Production Tracker</h1>
              <p className="text-sm text-slate-300">Corrugated Sheet Plant Planning</p>
            </div>
            <div className="flex gap-3 items-center">
              {/* Firebase Real-Time Status */}
              {lastSyncTime && (
                <div className="flex items-center gap-2 text-sm bg-green-500/20 text-green-300 px-3 py-1 rounded-full">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  🔥 Live
                </div>
              )}
              
              {/* Migrate from Google Sheets Button */}
              {showMigrateButton && (
                <button 
                  onClick={migrateFromGoogleSheets}
                  disabled={isLoadingFromSheets}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                  <Upload size={18} />
                  {isLoadingFromSheets ? 'Migrating...' : 'Migrate from Sheets'}
                </button>
              )}
              
              {/* Initialize Firebase Button (for first-time setup) */}
              {orders.length === 0 && machines.length === DEFAULT_MACHINES.length && (
                <button 
                  onClick={initializeFirebase}
                  className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg transition-colors">
                  🔥 Initialize Firebase
                </button>
              )}
              
              <button onClick={() => {
                initNewOrder();
                setView('neworder');
              }} 
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors font-semibold">
                <Plus size={18} />New Order
              </button>
              <button onClick={importData} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
                <Upload size={18} />Import
              </button>
              <button onClick={exportData} 
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-lg transition-colors">
                <Download size={18} />Export
              </button>
              <button 
                onClick={() => setShowClearModal(true)}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors">
                <X size={18} />Clear All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 py-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
              { id: 'neworder', label: 'New Order', icon: Plus },
              { id: 'active', label: `Active (${active.length})`, icon: Package },
              { id: 'materialneeded', label: `Material Needed (${active.filter(o => !o.validations?.materialpurchasing).length})`, icon: null },
              { id: 'capacity', label: 'Capacity Planning', icon: Calendar },
              { id: 'completed', label: `Completed (${completed.length})`, icon: null },
              { id: 'all', label: 'All Orders', icon: null }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'neworder' && !newOrder) {
                    initNewOrder();
                  }
                  setView(tab.id);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  view === tab.id 
                    ? 'bg-amber-500 text-white shadow-md' 
                    : tab.id === 'materialneeded' && active.filter(o => !o.validations?.materialpurchasing).length > 0
                    ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.icon && <tab.icon size={16} />}
                {tab.id === 'materialneeded' && '📦 '}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* NEW ORDER VIEW */}
        {view === 'neworder' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Create New Order</h2>
                  <p className="text-slate-600 mt-1">Fill in the order details below</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={saveNewOrder}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md"
                  >
                    Save Order
                  </button>
                  <button
                    onClick={cancelNewOrder}
                    className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {newOrder && (
                <div className="space-y-6">
                  {/* Basic Information */}
                  <div className="border-2 border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Basic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Customer Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newOrder.customer}
                          onChange={e => setNewOrder({...newOrder, customer: e.target.value})}
                          placeholder="Enter customer name"
                          className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none text-lg"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Works Order Number</label>
                        <input
                          type="text"
                          value={newOrder.worksOrder || ''}
                          onChange={e => setNewOrder({...newOrder, worksOrder: e.target.value})}
                          placeholder="e.g., WO-2024-001"
                          className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                        <input
                          type="text"
                          value={newOrder.description}
                          onChange={e => setNewOrder({...newOrder, description: e.target.value})}
                          placeholder="Order description"
                          className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Specification</label>
                        <input
                          type="text"
                          value={newOrder.spec}
                          onChange={e => setNewOrder({...newOrder, spec: e.target.value})}
                          placeholder="e.g., C-Flute, 200gsm"
                          className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Quantity (feeds)</label>
                        <input
                          type="text"
                          value={newOrder.quantity}
                          onChange={e => setNewOrder({...newOrder, quantity: e.target.value})}
                          placeholder="e.g., 50000"
                          className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Production Details */}
                  <div className="border-2 border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Production Details</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Machine Assignment</label>
                        <select
                          value={newOrder.machineId || ''}
                          onChange={e => setNewOrder({...newOrder, machineId: parseInt(e.target.value) || null})}
                          className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none"
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
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Planning Date</label>
                        <input
                          type="date"
                          value={newOrder.planningDate}
                          onChange={e => setNewOrder({...newOrder, planningDate: e.target.value})}
                          className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Ship Date</label>
                        <input
                          type="date"
                          value={newOrder.shipsDate}
                          onChange={e => setNewOrder({...newOrder, shipsDate: e.target.value})}
                          className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Validations */}
                  <div className="border-2 border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Validation Checklist</h3>
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
                              className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                            />
                            <span className={`text-sm ${checked ? 'font-semibold text-green-900' : 'text-slate-700'}`}>
                              {v}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="border-2 border-slate-200 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">Additional Notes</h3>
                    <textarea
                      value={newOrder.notes}
                      onChange={e => setNewOrder({...newOrder, notes: e.target.value})}
                      placeholder="Add any additional notes or special instructions for this order..."
                      rows={4}
                      className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-amber-500 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Action Buttons (Bottom) */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={saveNewOrder}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-lg font-semibold transition-colors shadow-md text-lg"
                    >
                      ✓ Save Order
                    </button>
                    <button
                      onClick={cancelNewOrder}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-4 rounded-lg font-semibold transition-colors"
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
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
                <div className="text-sm text-slate-600 font-semibold mb-1">Active Orders</div>
                <div className="text-3xl font-bold text-slate-900">{analytics.totalActive}</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
                <div className="text-sm text-slate-600 font-semibold mb-1">Completed</div>
                <div className="text-3xl font-bold text-slate-900">{analytics.totalCompleted}</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-amber-500">
                <div className="text-sm text-slate-600 font-semibold mb-1">Avg Lead Time</div>
                <div className="text-3xl font-bold text-slate-900">{analytics.avgLeadTime} <span className="text-lg text-slate-600">days</span></div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500">
                <div className="text-sm text-slate-600 font-semibold mb-1">Capacity Alerts</div>
                <div className="text-3xl font-bold text-slate-900">{analytics.overCapacityDays}</div>
              </div>
            </div>

            {/* Alerts Section */}
            {(analytics.overCapacityDays > 0 || analytics.bottlenecks.length > 0) && (
              <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-6">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="text-red-600 mt-1" size={24} />
                  <div>
                    <h3 className="text-lg font-bold text-red-900">Production Alerts</h3>
                    <p className="text-sm text-red-700">Issues requiring immediate attention</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {analytics.overCapacityDays > 0 && (
                    <div className="bg-white rounded-lg p-4 border-l-4 border-red-500">
                      <div className="font-semibold text-red-900">
                        ⚠️ {analytics.overCapacityDays} day(s) over capacity in next 14 days
                      </div>
                      <div className="text-sm text-red-700 mt-1">
                        Review capacity planning tab to redistribute workload
                      </div>
                    </div>
                  )}
                  {analytics.bottlenecks.map(([validation, stats]) => (
                    <div key={validation} className="bg-white rounded-lg p-4 border-l-4 border-orange-500">
                      <div className="font-semibold text-orange-900">
                        📋 {validation}: Only {stats.percentage}% complete ({stats.completed}/{stats.total} orders)
                      </div>
                      <div className="text-sm text-orange-700 mt-1">
                        This validation is blocking progress on multiple orders
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 14-Day Forecast */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">14-Day Capacity Forecast</h3>
              {analytics.forecast.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No scheduled production in the next 14 days
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics.forecast.slice(0, 7).map((f, idx) => (
                    <div key={idx} className={`p-4 rounded-lg border-2 ${
                      f.isOver ? 'border-red-500 bg-red-50' : 
                      f.isNear ? 'border-orange-500 bg-orange-50' : 
                      'border-slate-200 bg-slate-50'
                    }`}>
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="font-bold">
                            {new Date(f.date).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="ml-3 text-slate-600">{f.machine}</span>
                        </div>
                        <div className={`font-bold text-right ${f.isOver ? 'text-red-600' : f.isNear ? 'text-orange-600' : 'text-slate-700'}`}>
                          <div>{f.nonStockUsed.toLocaleString()} / {f.availableCapacity.toLocaleString()} available</div>
                          <div className="text-xs font-normal text-slate-500">
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
                            f.isOver ? 'bg-red-600' : f.isNear ? 'bg-orange-500' : 'bg-blue-500'
                          }`}
                          style={{ 
                            left: `${(f.stockReserved / f.totalCapacity) * 100}%`,
                            width: `${Math.min((f.nonStockUsed / f.totalCapacity) * 100, 100 - (f.stockReserved / f.totalCapacity) * 100)}%`
                          }}
                          title={`Non-Stock Orders: ${f.nonStockUsed.toLocaleString()}`}
                        />
                      </div>
                      
                      {/* Legend */}
                      <div className="flex justify-between text-xs text-slate-600 mb-2">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-slate-400 rounded"></div>
                            <span>Stock: {f.stockReserved.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className={`w-3 h-3 rounded ${f.isOver ? 'bg-red-600' : f.isNear ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                            <span>Non-Stock: {f.nonStockUsed.toLocaleString()}</span>
                          </div>
                        </div>
                        <span className="font-semibold">Total: {f.totalCapacity.toLocaleString()}</span>
                      </div>

                      {f.isOver && (
                        <div className="bg-red-100 border border-red-300 rounded-lg p-3">
                          <div className="font-semibold text-red-900">
                            ⚠️ OVER AVAILABLE CAPACITY (exceeds 105% tolerance)
                          </div>
                          <div className="text-sm text-red-700 mt-1">
                            Non-stock orders exceed available capacity after stock reservation
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Machine Utilization */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Machine Utilization (Active Orders)</h3>
              <div className="grid grid-cols-2 gap-4">
                {analytics.machineUtil.map(m => {
                  const utilizationColor = m.utilizationPercent >= 100 ? 'text-red-600' : 
                                          m.utilizationPercent >= 90 ? 'text-orange-600' : 
                                          'text-slate-900';
                  return (
                    <div key={m.machine} className="bg-slate-50 rounded-lg p-4 border-2 border-slate-200">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-lg text-slate-900">{m.machine}</div>
                          <div className="text-xs text-slate-500">{m.fullName}</div>
                        </div>
                        <div className={`text-2xl font-bold ${utilizationColor}`}>
                          {m.utilizationPercent}%
                        </div>
                      </div>
                      <div className="text-sm text-slate-600 mt-2 space-y-1">
                        <div>{m.orders} active order{m.orders !== 1 ? 's' : ''}</div>
                        <div className="font-semibold">
                          {m.totalQuantity.toLocaleString()} / {m.availableCapacity.toLocaleString()} available
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 mt-3">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            m.utilizationPercent >= 100 ? 'bg-red-600' : 
                            m.utilizationPercent >= 90 ? 'bg-orange-500' : 
                            'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(m.utilizationPercent, 100)}%` }}
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
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-md p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-700">Filter by Machine</label>
                  <select 
                    value={filterMachine} 
                    onChange={e => setFilterMachine(e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="All">All Machines</option>
                    {MACHINES.map(m => <option key={m.id} value={m.id}>{m.name} - {m.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-700">Filter by Date</label>
                  <div className="flex gap-2">
                    <input 
                      type="date" 
                      value={filterDate} 
                      onChange={e => setFilterDate(e.target.value)}
                      className="flex-1 border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none"
                    />
                    {filterDate && (
                      <button 
                        onClick={() => setFilterDate('')} 
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Capacity Legend */}
            <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-xl shadow-md p-4 border-2 border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-slate-400 rounded"></div>
                    <span className="text-sm font-semibold text-slate-700">Stock Customer Allocation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded"></div>
                    <span className="text-sm font-semibold text-slate-700">Non-Stock Orders (This System)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded"></div>
                    <span className="text-sm font-semibold text-slate-700">Available Capacity</span>
                  </div>
                </div>
                <div className="text-sm text-slate-600">
                  Alerts based on available capacity after stock allocation
                </div>
              </div>
            </div>

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
                  date,
                  orders: ordersOnDate,
                  nonStockUsed,
                  stockReserved,
                  totalUsed,
                  totalCapacity: machine.capacity,
                  availableCapacity: machine.availableCapacity,
                  percentageOfAvailable: Math.round((nonStockUsed / machine.availableCapacity) * 100),
                  percentageOfTotal: Math.round((totalUsed / machine.capacity) * 100),
                  isOver: nonStockUsed > machine.availableCapacity * 1.05, // 5% tolerance
                  isNear: nonStockUsed >= machine.availableCapacity * 0.9 && nonStockUsed <= machine.availableCapacity * 1.05
                };
              }).filter(d => d.orders.length > 0);

              return (
                <div key={machine.id} className="bg-white rounded-xl shadow-md p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{machine.name} - {machine.fullName}</h3>
                      <div className="text-sm text-slate-600 mt-2 space-y-1">
                        <div>Total Capacity: <span className="font-semibold">{machine.capacity.toLocaleString()}</span> feeds/day</div>
                        <div>Stock Allocation: <span className="font-semibold">{stockReserved.toLocaleString()}</span> feeds ({machine.stockPercentage}%)</div>
                        <div>Available for Non-Stock: <span className="font-semibold text-blue-600">{machine.availableCapacity.toLocaleString()}</span> feeds</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-600">Total Scheduled Days</div>
                      <div className="text-2xl font-bold text-slate-900">{machineOrders.length}</div>
                    </div>
                  </div>

                  {machineOrders.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                      No scheduled orders for this machine
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {machineOrders.map(day => (
                        <div key={day.date} className={`p-5 border-2 rounded-xl ${
                          day.isOver ? 'border-red-500 bg-red-50' : 
                          day.isNear ? 'border-orange-500 bg-orange-50' : 
                          'border-slate-200 bg-slate-50'
                        }`}>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="font-bold text-lg text-slate-900">
                                {new Date(day.date).toLocaleDateString('en-GB', {
                                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                })}
                              </div>
                              <div className="text-sm text-slate-600 mt-1">
                                {day.orders.length} non-stock order{day.orders.length !== 1 ? 's' : ''} scheduled
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-2xl font-bold ${
                                day.isOver ? 'text-red-600' : day.isNear ? 'text-orange-600' : 'text-slate-900'
                              }`}>
                                {day.percentageOfAvailable}%
                              </div>
                              <div className="text-sm text-slate-600">
                                of available capacity
                              </div>
                            </div>
                          </div>
                          
                          {/* Dual-capacity progress bar */}
                          <div className="relative w-full bg-slate-200 rounded-full h-6 mb-3">
                            {/* Stock reserved (baseline) */}
                            <div 
                              className="absolute h-6 bg-slate-400 rounded-l-full flex items-center justify-center text-xs text-white font-semibold"
                              style={{ width: `${(day.stockReserved / day.totalCapacity) * 100}%` }}
                            >
                              {(day.stockReserved / day.totalCapacity) * 100 > 10 && 'Stock'}
                            </div>
                            {/* Non-stock orders */}
                            <div 
                              className={`absolute h-6 flex items-center justify-center text-xs text-white font-semibold ${
                                day.isOver ? 'bg-red-600' : day.isNear ? 'bg-orange-500' : 'bg-blue-500'
                              }`}
                              style={{ 
                                left: `${(day.stockReserved / day.totalCapacity) * 100}%`,
                                width: `${Math.min((day.nonStockUsed / day.totalCapacity) * 100, 100 - (day.stockReserved / day.totalCapacity) * 100)}%`
                              }}
                            >
                              {(day.nonStockUsed / day.totalCapacity) * 100 > 10 && 'Non-Stock'}
                            </div>
                            {/* Remaining capacity visualization */}
                            {!day.isOver && (
                              <div 
                                className="absolute h-6 bg-green-50 border-2 border-dashed border-green-500 rounded-r-full flex items-center justify-center text-xs text-green-700 font-semibold"
                                style={{ 
                                  left: `${((day.stockReserved + day.nonStockUsed) / day.totalCapacity) * 100}%`,
                                  width: `${100 - ((day.stockReserved + day.nonStockUsed) / day.totalCapacity) * 100}%`
                                }}
                              >
                                {100 - ((day.stockReserved + day.nonStockUsed) / day.totalCapacity) * 100 > 10 && 'Available'}
                              </div>
                            )}
                          </div>

                          {/* Capacity breakdown */}
                          <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
                            <div className="bg-white rounded-lg p-3 border border-slate-300">
                              <div className="text-xs text-slate-500 mb-1">Stock Reserved</div>
                              <div className="font-bold text-slate-700">{day.stockReserved.toLocaleString()}</div>
                            </div>
                            <div className={`rounded-lg p-3 border ${
                              day.isOver ? 'bg-red-100 border-red-300' : day.isNear ? 'bg-orange-100 border-orange-300' : 'bg-blue-50 border-blue-300'
                            }`}>
                              <div className="text-xs text-slate-600 mb-1">Non-Stock Orders</div>
                              <div className={`font-bold ${day.isOver ? 'text-red-700' : day.isNear ? 'text-orange-700' : 'text-blue-700'}`}>
                                {day.nonStockUsed.toLocaleString()}
                              </div>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-slate-300">
                              <div className="text-xs text-slate-500 mb-1">Total Used</div>
                              <div className="font-bold text-slate-700">{day.totalUsed.toLocaleString()}</div>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-slate-300">
                              <div className="text-xs text-slate-500 mb-1">Total Capacity</div>
                              <div className="font-bold text-slate-900">{day.totalCapacity.toLocaleString()}</div>
                            </div>
                          </div>

                          {day.isOver && (
                            <div className="bg-red-100 border-2 border-red-400 rounded-lg p-4 mb-4">
                              <div className="font-bold text-red-900 text-lg mb-2">
                                ⚠️ OVER AVAILABLE CAPACITY (105% tolerance exceeded)
                              </div>
                              <div className="text-sm text-red-800 space-y-1">
                                <div>Non-stock orders: <span className="font-semibold">{day.nonStockUsed.toLocaleString()}</span> feeds</div>
                                <div>Available capacity: <span className="font-semibold">{day.availableCapacity.toLocaleString()}</span> feeds</div>
                                <div>Tolerance limit (105%): <span className="font-semibold">{Math.round(day.availableCapacity * 1.05).toLocaleString()}</span> feeds</div>
                                <div className="font-bold pt-2">Over by: <span className="text-lg">{(day.nonStockUsed - Math.round(day.availableCapacity * 1.05)).toLocaleString()}</span> feeds</div>
                              </div>
                              <div className="text-sm text-red-700 mt-3 p-3 bg-red-50 rounded border border-red-300">
                                💡 Consider rescheduling orders or reallocating to another machine
                              </div>
                            </div>
                          )}

                          {/* Order details */}
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-600 mb-2">NON-STOCK ORDERS:</div>
                            {day.orders.map(o => (
                              <div key={o.id} className="bg-white rounded-lg p-3 border border-slate-200 hover:border-blue-400 transition-colors">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="font-semibold text-slate-900">{o.customer}</div>
                                    <div className="text-sm text-slate-600">{o.description}</div>
                                    {o.spec && <div className="text-xs text-slate-500 mt-1">{o.spec}</div>}
                                  </div>
                                  <div className="text-right ml-4">
                                    <div className="font-bold text-slate-900 text-lg">
                                      {parseInt(String(o.quantity || '0').replace(/,/g, '')).toLocaleString()}
                                    </div>
                                    <div className="text-xs text-slate-500">feeds</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="text-3xl">📦</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-amber-900 mb-1">Material Purchasing Queue</h3>
                    <p className="text-amber-800 mb-3">
                      These orders need materials to be purchased. Check the "Material Purchasing" box when materials have been ordered.
                    </p>
                    <div className="bg-white rounded-lg p-3 border border-amber-200">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                          <span className="font-semibold text-slate-700">Showing {materialNeeded.length} order{materialNeeded.length !== 1 ? 's' : ''} requiring material purchasing</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search, Sort, and Filter Controls */}
            <div className="bg-white rounded-xl shadow-md p-4">
              <div className={`grid ${view === 'active' ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search by customer, works order, or spec..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 border-2 border-slate-200 rounded-lg focus:border-amber-500 focus:outline-none"
                  />
                  {searchFilter && (
                    <button 
                      onClick={() => setSearchFilter('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={20} />
                    </button>
                  )}
                </div>

                {/* Sort */}
                <div>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none"
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
                      className="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-amber-500 focus:outline-none font-semibold"
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
                    <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                      Search: "{searchFilter}"
                      <button onClick={() => setSearchFilter('')} className="hover:text-blue-900">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {validationFilter === 'materialpurchasing' && (
                    <div className="flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-semibold">
                      📦 Material Purchasing Needed
                      <button onClick={() => setValidationFilter('all')} className="hover:text-amber-900">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {validationFilter === 'pending' && (
                    <div className="flex items-center gap-2 bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-semibold">
                      ⏳ Pending Validations
                      <button onClick={() => setValidationFilter('all')} className="hover:text-orange-900">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={() => {
                      setSearchFilter('');
                      setValidationFilter('all');
                    }}
                    className="text-slate-600 hover:text-slate-900 text-sm font-semibold underline">
                    Clear all filters
                  </button>
                </div>
              )}
            </div>

            {display.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <Package size={48} className="mx-auto text-slate-300 mb-4" />
                <div className="text-xl font-semibold text-slate-600">No orders found</div>
                <div className="text-slate-500 mt-2">
                  {searchFilter ? 'Try adjusting your search' : 'Create a new order to get started'}
                </div>
              </div>
            ) : (
              display.map(order => (
                <div key={order.id} className="bg-white rounded-xl shadow-md overflow-hidden border-2 border-slate-200 hover:border-amber-500 transition-colors">
                  {/* Order Header - Always Visible */}
                  <div 
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    className="p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 grid grid-cols-5 gap-4">
                        <div>
                          <div className="text-xs text-slate-500 font-semibold mb-1">CUSTOMER</div>
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
                            className="font-bold text-slate-900 w-full border-b-2 border-transparent hover:border-slate-200 focus:border-amber-500 focus:outline-none px-1 py-1"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 font-semibold mb-1">WORKS ORDER</div>
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
                            className="text-slate-700 w-full border-b-2 border-transparent hover:border-slate-200 focus:border-amber-500 focus:outline-none px-1 py-1"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 font-semibold mb-1">DESCRIPTION</div>
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
                            className="text-slate-700 w-full border-b-2 border-transparent hover:border-slate-200 focus:border-amber-500 focus:outline-none px-1 py-1"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 font-semibold mb-1">PLANNING DATE</div>
                          <input
                            type="date"
                            value={editingOrder[order.id]?.planningDate ?? order.planningDate ?? ''}
                            onChange={e => {
                              e.stopPropagation();
                              updateEditingOrder(order.id, 'planningDate', e.target.value);
                            }}
                            onBlur={() => saveEditingOrder(order.id)}
                            onClick={e => e.stopPropagation()}
                            className="text-slate-700 w-full border-b-2 border-transparent hover:border-slate-200 focus:border-amber-500 focus:outline-none px-1 py-1"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 font-semibold mb-1">STATUS</div>
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
                      <button className="ml-4 text-slate-400 hover:text-slate-600">
                        {expandedOrder === order.id ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedOrder === order.id && (
                    <div className="border-t-2 border-slate-200 bg-slate-50 p-5 space-y-5">
                      {/* Additional Fields */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs text-slate-500 font-semibold mb-2">SPEC</label>
                          <input
                            type="text"
                            value={editingOrder[order.id]?.spec ?? order.spec ?? ''}
                            onChange={e => updateEditingOrder(order.id, 'spec', e.target.value)}
                            onBlur={() => saveEditingOrder(order.id)}
                            placeholder="Specification"
                            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 font-semibold mb-2">QUANTITY</label>
                          <input
                            type="text"
                            value={editingOrder[order.id]?.quantity ?? order.quantity ?? ''}
                            onChange={e => updateEditingOrder(order.id, 'quantity', e.target.value)}
                            onBlur={() => saveEditingOrder(order.id)}
                            placeholder="0"
                            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 font-semibold mb-2">MACHINE</label>
                          <select
                            value={order.machineId || ''}
                            onChange={e => updateOrder(order.id, { machineId: parseInt(e.target.value) || null })}
                            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
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
                        <div className="text-sm font-bold text-slate-700 mb-3">VALIDATION CHECKLIST</div>
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
                                    ? 'border-amber-500 bg-amber-50 shadow-md ring-2 ring-amber-300'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleVal(order.id, key)}
                                  className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                                />
                                <span className={`text-sm ${
                                  checked 
                                    ? 'font-semibold text-green-900' 
                                    : highlightMaterial
                                    ? 'font-bold text-amber-900'
                                    : 'text-slate-700'
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
                        <label className="block text-xs text-slate-500 font-semibold mb-2">NOTES</label>
                        <textarea
                          value={editingOrder[order.id]?.notes ?? order.notes ?? ''}
                          onChange={e => updateEditingOrder(order.id, 'notes', e.target.value)}
                          onBlur={() => saveEditingOrder(order.id)}
                          placeholder="Add notes about this order..."
                          rows={3}
                          className="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none resize-none"
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
          <div className={`rounded-xl shadow-2xl p-4 min-w-[300px] max-w-md border-2 ${
            toast.type === 'success' ? 'bg-green-50 border-green-500 text-green-900' :
            toast.type === 'error' ? 'bg-red-50 border-red-500 text-red-900' :
            'bg-blue-50 border-blue-500 text-blue-900'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`text-2xl ${
                toast.type === 'success' ? 'text-green-600' :
                toast.type === 'error' ? 'text-red-600' :
                'text-blue-600'
              }`}>
                {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'ℹ'}
              </div>
              <div className="flex-1 font-semibold">
                {toast.message}
              </div>
              <button 
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Orders Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-3 rounded-full">
                <AlertTriangle className="text-red-600" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-red-900">Delete All Orders?</h2>
                <p className="text-red-700">This action cannot be undone!</p>
              </div>
            </div>
            
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-900 font-semibold mb-2">
                You are about to permanently delete:
              </p>
              <ul className="text-red-800 space-y-1 ml-4">
                <li>• <span className="font-bold">{orders.length}</span> total orders</li>
                <li>• <span className="font-bold">{active.length}</span> active orders</li>
                <li>• <span className="font-bold">{completed.length}</span> completed orders</li>
              </ul>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-900 mb-2">
                Type <span className="bg-red-100 text-red-900 px-2 py-1 rounded font-mono">DELETE ALL</span> to confirm:
              </label>
              <input
                type="text"
                value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                placeholder="Type DELETE ALL"
                className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 focus:border-red-500 focus:outline-none text-lg font-mono"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (clearConfirmText === 'DELETE ALL') {
                    save([]);
                    setShowClearModal(false);
                    setClearConfirmText('');
                    showToast('All orders have been deleted.', 'success');
                  } else {
                    showToast('Please type DELETE ALL exactly to confirm.', 'error');
                  }
                }}
                disabled={clearConfirmText !== 'DELETE ALL'}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                  clearConfirmText === 'DELETE ALL'
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg cursor-pointer'
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
                className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-semibold transition-colors"
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
