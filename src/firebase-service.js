import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { FIREBASE_CONFIG, COLLECTIONS } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

class FirebaseService {
  constructor() {
    this.db = db;
    this.unsubscribeOrders = null;
    this.unsubscribeMachines = null;
  }

  // ============================================
  // ORDERS - Real-time sync
  // ============================================

  /**
   * Subscribe to real-time order updates
   * Calls callback whenever orders change
   */
  subscribeToOrders(callback) {
    const ordersRef = collection(this.db, COLLECTIONS.orders);
    const q = query(ordersRef, orderBy('created', 'desc'));
    
    this.unsubscribeOrders = onSnapshot(q, (snapshot) => {
      const orders = [];
      snapshot.forEach((doc) => {
        orders.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      console.log(`🔥 Firebase: Loaded ${orders.length} orders`);
      callback(orders);
    }, (error) => {
      console.error('Error subscribing to orders:', error);
    });
    
    return this.unsubscribeOrders;
  }

  /**
   * Stop listening to order updates
   */
  unsubscribeFromOrders() {
    if (this.unsubscribeOrders) {
      this.unsubscribeOrders();
      this.unsubscribeOrders = null;
    }
  }

  /**
   * Save or update an order
   */
  async saveOrder(order) {
    try {
      const orderRef = doc(this.db, COLLECTIONS.orders, order.id);
      await setDoc(orderRef, {
        ...order,
        updated: new Date().toISOString()
      }, { merge: true });
      
      console.log(`✅ Saved order: ${order.id}`);
      return true;
    } catch (error) {
      console.error('Error saving order:', error);
      throw error;
    }
  }

  /**
   * Save multiple orders (batch)
   */
  async saveOrders(orders) {
    try {
      console.log(`💾 Saving ${orders.length} orders to Firebase...`);
      
      const promises = orders.map(order => this.saveOrder(order));
      await Promise.all(promises);
      
      console.log(`✅ Saved ${orders.length} orders to Firebase`);
      return true;
    } catch (error) {
      console.error('Error saving orders:', error);
      throw error;
    }
  }

  /**
   * Delete an order
   */
  async deleteOrder(orderId) {
    try {
      await deleteDoc(doc(this.db, COLLECTIONS.orders, orderId));
      console.log(`🗑️ Deleted order: ${orderId}`);
      return true;
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  }

  /**
   * Get all orders (one-time fetch, not real-time)
   */
  async getOrders() {
    try {
      const ordersRef = collection(this.db, COLLECTIONS.orders);
      const snapshot = await getDocs(ordersRef);
      
      const orders = [];
      snapshot.forEach((doc) => {
        orders.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      console.log(`📊 Fetched ${orders.length} orders from Firebase`);
      return orders;
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  // ============================================
  // MACHINES - Real-time sync
  // ============================================

  /**
   * Subscribe to real-time machine updates
   */
  subscribeToMachines(callback) {
    const machinesRef = collection(this.db, COLLECTIONS.machines);
    
    this.unsubscribeMachines = onSnapshot(machinesRef, (snapshot) => {
      const machines = [];
      snapshot.forEach((doc) => {
        machines.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort by id
      machines.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      
      console.log(`🔥 Firebase: Loaded ${machines.length} machines`);
      callback(machines);
    }, (error) => {
      console.error('Error subscribing to machines:', error);
    });
    
    return this.unsubscribeMachines;
  }

  /**
   * Stop listening to machine updates
   */
  unsubscribeFromMachines() {
    if (this.unsubscribeMachines) {
      this.unsubscribeMachines();
      this.unsubscribeMachines = null;
    }
  }

  /**
   * Save machine configuration
   */
  async saveMachine(machine) {
    try {
      const machineRef = doc(this.db, COLLECTIONS.machines, String(machine.id));
      await setDoc(machineRef, machine, { merge: true });
      
      console.log(`✅ Saved machine: ${machine.name}`);
      return true;
    } catch (error) {
      console.error('Error saving machine:', error);
      throw error;
    }
  }

  /**
   * Initialize default machines (run once)
   */
  async initializeDefaultMachines() {
    const defaultMachines = [
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

    try {
      for (const machine of defaultMachines) {
        await this.saveMachine(machine);
      }
      console.log('✅ Initialized default machines');
      return true;
    } catch (error) {
      console.error('Error initializing machines:', error);
      throw error;
    }
  }

  /**
   * Get all machines (one-time fetch)
   */
  async getMachines() {
    try {
      const machinesRef = collection(this.db, COLLECTIONS.machines);
      const snapshot = await getDocs(machinesRef);
      
      const machines = [];
      snapshot.forEach((doc) => {
        machines.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort by id
      machines.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      
      console.log(`📊 Fetched ${machines.length} machines from Firebase`);
      return machines;
    } catch (error) {
      console.error('Error fetching machines:', error);
      throw error;
    }
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Clear all orders (use carefully!)
   */
  async clearAllOrders() {
    try {
      const ordersRef = collection(this.db, COLLECTIONS.orders);
      const snapshot = await getDocs(ordersRef);
      
      const deletePromises = [];
      snapshot.forEach((doc) => {
        deletePromises.push(deleteDoc(doc.ref));
      });
      
      await Promise.all(deletePromises);
      console.log(`🗑️ Deleted ${snapshot.size} orders`);
      return true;
    } catch (error) {
      console.error('Error clearing orders:', error);
      throw error;
    }
  }

  /**
   * Import orders from Google Sheets data
   */
  async importFromGoogleSheets(googleSheetsOrders) {
    try {
      console.log(`📥 Importing ${googleSheetsOrders.length} orders from Google Sheets...`);
      
      for (const order of googleSheetsOrders) {
        // Ensure order has an ID
        if (!order.id) {
          order.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        await this.saveOrder(order);
      }
      
      console.log(`✅ Imported ${googleSheetsOrders.length} orders to Firebase`);
      return true;
    } catch (error) {
      console.error('Error importing from Google Sheets:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const firebaseService = new FirebaseService();
