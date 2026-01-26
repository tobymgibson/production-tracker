import { GOOGLE_SHEETS_CONFIG, COLUMN_MAPPING } from './google-sheets-config.js';

const VALIDATIONS = [
  'Existing Tooling', 'Design Brief', 'Artwork Brief', 'Credit Check',
  'Design Approval', 'Artwork Approval', 'Colour Approval', 'Customer Order',
  'Pre-Production', 'Job Raised', 'Material Purchasing', 'Kick Off Meeting Required',
  'Formes Ordered', 'Plates Ordered'
];

// Helper function to parse dates from Google Sheets
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return '';
  
  const str = dateStr.trim();
  
  // Already in YYYY-MM-DD format
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return str;
  }
  
  // Handle D/M/YY or DD/MM/YYYY format (UK format)
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let day = parts[0].padStart(2, '0');
      let month = parts[1].padStart(2, '0');
      let year = parts[2];
      
      // Convert 2-digit year to 4-digit
      if (year.length === 2) {
        const yearNum = parseInt(year);
        year = yearNum < 50 ? '20' + year : '19' + year;
      }
      
      // Validate
      const dayNum = parseInt(day);
      const monthNum = parseInt(month);
      
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  
  // Try to parse as a Date object
  try {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.warn('Could not parse date:', str);
  }
  
  return ''; // Return empty if can't parse
}

// Google Sheets API Service
export class GoogleSheetsService {
  constructor() {
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    this.apiKey = GOOGLE_SHEETS_CONFIG.apiKey;
    this.spreadsheetId = GOOGLE_SHEETS_CONFIG.spreadsheetId;
  }

  // Fetch all orders from Google Sheets
  async fetchOrders() {
    try {
      const range = `${GOOGLE_SHEETS_CONFIG.sheets.orders}!A2:Z10000`; // Skip header row, support up to 10,000 orders
      const url = `${this.baseUrl}/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.statusText}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      console.log(`📊 Loaded ${rows.length} rows from Google Sheets`);
      
      // Convert rows to order objects
      const orders = rows.map(row => this.rowToOrder(row)).filter(order => order.customer);
      
      console.log(`✅ Parsed ${orders.length} valid orders (with customers)`);
      
      return orders;
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  // Convert spreadsheet row to order object
  rowToOrder(row) {
    const validations = {};
    VALIDATIONS.forEach((v, index) => {
      const key = v.toLowerCase().replace(/\s+/g, '');
      const colIndex = 12 + index; // Validations start at column 13 (M)
      const cellValue = row[colIndex];
      
      if (cellValue) {
        const val = String(cellValue).toLowerCase().trim();
        validations[key] = val === 'x' || val === 'y' || val === 'yes';
      } else {
        validations[key] = false;
      }
    });

    const planningDate = parseDate(row[7]);
    const shipsDate = parseDate(row[8]);
    
    // Debug logging for dates
    if (row[7] && !planningDate) {
      console.warn(`⚠️ Could not parse planning date: "${row[7]}" for customer: ${row[1]}`);
    }
    if (row[8] && !shipsDate) {
      console.warn(`⚠️ Could not parse ship date: "${row[8]}" for customer: ${row[1]}`);
    }

    return {
      id: row[0] || '',
      customer: row[1] || '',
      worksOrder: row[2] || '',
      description: row[3] || '',
      spec: row[4] || '',
      quantity: row[5] || '',
      status: row[6] || 'In Progress',
      planningDate: planningDate,
      shipsDate: shipsDate,
      machineId: row[9] ? parseInt(row[9]) : null,
      notes: row[10] || '',
      created: row[11] || new Date().toISOString(),
      validations
    };
  }

  // Convert order object to spreadsheet row
  orderToRow(order) {
    const validationValues = VALIDATIONS.map(v => {
      const key = v.toLowerCase().replace(/\s+/g, '');
      return order.validations?.[key] ? 'x' : '';
    });

    return [
      order.id || '',
      order.customer || '',
      order.worksOrder || '',
      order.description || '',
      order.spec || '',
      order.quantity || '',
      order.status || 'In Progress',
      order.planningDate || '',
      order.shipsDate || '',
      order.machineId || '',
      order.notes || '',
      order.created || new Date().toISOString(),
      ...validationValues
    ];
  }

  // Save all orders to Google Sheets (batch update)
  async saveOrders(orders) {
    try {
      // Convert orders to rows
      const rows = orders.map(order => this.orderToRow(order));
      
      console.log(`💾 Saving ${rows.length} orders to Google Sheets...`);
      
      // Clear existing data first (except header)
      await this.clearSheet();
      
      // Update with new data
      const range = `${GOOGLE_SHEETS_CONFIG.sheets.orders}!A2`;
      const url = `${this.baseUrl}/${this.spreadsheetId}/values/${range}:append?valueInputOption=RAW&key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rows
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save orders: ${response.statusText}`);
      }

      console.log(`✅ Successfully saved ${rows.length} orders to Google Sheets`);
      
      return await response.json();
    } catch (error) {
      console.error('Error saving orders:', error);
      throw error;
    }
  }

  // Clear all order data (keep header)
  async clearSheet() {
    try {
      const range = `${GOOGLE_SHEETS_CONFIG.sheets.orders}!A2:Z10000`;
      const url = `${this.baseUrl}/${this.spreadsheetId}/values/${range}:clear?key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to clear sheet: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error clearing sheet:', error);
      throw error;
    }
  }

  // Check if Google Sheets is accessible
  async testConnection() {
    try {
      const range = `${GOOGLE_SHEETS_CONFIG.sheets.orders}!A1:A1`;
      const url = `${this.baseUrl}/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
      
      const response = await fetch(url);
      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// Create singleton instance
export const googleSheetsService = new GoogleSheetsService();
