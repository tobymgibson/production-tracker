// Google Sheets Configuration
// INSTRUCTIONS: Replace these values with your own

export const GOOGLE_SHEETS_CONFIG = {
  apiKey: 'AIzaSyAdyKUWV-v-Laxah4aQ0QWHnyoVXLG-m9g',
  spreadsheetId: '1JI2Tp5epzEKE9bo1VvXDa8aE_gA_Vu2_jsiI57_VcNM',
  
  // Sheet names (these should match your Google Sheet tabs)
  sheets: {
    orders: 'Orders',
    config: 'Config'
  },
  
  // Auto-refresh interval (milliseconds) - 30 seconds by default
  refreshInterval: 30000
};

// Column mapping for Google Sheets
// This maps your data structure to Google Sheets columns
export const COLUMN_MAPPING = {
  id: 'A',
  customer: 'B',
  worksOrder: 'C',
  description: 'D',
  spec: 'E',
  quantity: 'F',
  status: 'G',
  planningDate: 'H',
  shipsDate: 'I',
  machineId: 'J',
  notes: 'K',
  created: 'L',
  // Validations start at column M
  existingtooling: 'M',
  designbrief: 'N',
  artworkbrief: 'O',
  creditcheck: 'P',
  designapproval: 'Q',
  artworkapproval: 'R',
  colourapproval: 'S',
  customerorder: 'T',
  preproduction: 'U',
  jobraised: 'V',
  materialpurchasing: 'W',
  kickoffmeetingrequired: 'X',
  formesordered: 'Y',
  platesordered: 'Z'
};
