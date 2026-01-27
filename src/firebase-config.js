// Firebase Configuration
// INSTRUCTIONS: Replace these values with your Firebase project credentials

export const FIREBASE_CONFIG = {
  // Get these from Firebase Console > Project Settings > General
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID",
  
  // Optional: Realtime Database URL (if using Realtime Database instead of Firestore)
  databaseURL: "https://REPLACE_WITH_YOUR_PROJECT_ID-default-rtdb.firebaseio.com"
};

// Collection names
export const COLLECTIONS = {
  orders: 'orders',
  machines: 'machines',
  config: 'config'
};
