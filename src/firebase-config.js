// Firebase Configuration
// INSTRUCTIONS: Replace these values with your Firebase project credentials

export const FIREBASE_CONFIG = {
  // Get these from Firebase Console > Project Settings > General
  apiKey: "AIzaSyB9u_1v-_2S2ovRZgEbU_HgmoaCDAfPnwo",
  authDomain: "production-tracker-ea9c5.firebaseapp.com",
  projectId: "production-tracker-ea9c5",
  storageBucket: "production-tracker-ea9c5.firebasestorage.app",
  messagingSenderId: "949532992733",
  appId: "1:949532992733:web:84d2c48485d13b72ade734",
  
  // Optional: Realtime Database URL (if using Realtime Database instead of Firestore)
  databaseURL: "https://docs.google.com/spreadsheets/d/1JI2Tp5epzEKE9bo1VvXDa8aE_gA_Vu2_jsiI57_VcNM/edit?gid=24401925#gid=24401925"
};

// Collection names
export const COLLECTIONS = {
  orders: 'orders',
  machines: 'machines',
  config: 'config'
};
