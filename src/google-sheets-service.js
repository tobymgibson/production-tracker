import { GOOGLE_SHEETS_CONFIG, COLUMN_MAPPING } from './google-sheets-config.js';

const VALIDATIONS = [
  'Existing Tooling', 'Design Brief', 'Artwork Brief', 'Credit Check',
  'Design Approval', 'Artwork Approval', 'Colour Approval', 'Customer Order',
  'Pre-Production', 'Job Raised', 'Material Purchasing', 'Kick Off Meeting Required',
  'Formes Ordered', 'Plates Ordered'
];

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
      const range = `${GOOGLE_SHEETS_CONFIG.sheets.orders}!A2:Z1000`; // Skip header row
      const url = `${this.baseUrl}/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.statusText}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      // Convert rows to order objects
      return rows.map(row => this.rowToOrder(row)).filter(order => order.customer);
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
      validations[key] = row[colIndex]?.toLowerCase() === 'x';
    });

    return {
      id: row[0] || '',
      customer: row[1] || '',
      worksOrder: row[2] || '',
      description: row[3] || '',
      spec: row[4] || '',
      quantity: row[5] || '',
      status: row[6] || 'In Progress',
      planningDate: row[7] || '',
      shipsDate: row[8] || '',
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

      return await response.json();
    } catch (error) {
      console.error('Error saving orders:', error);
      throw error;
    }
  }

  // Clear all order data (keep header)
  async clearSheet() {
    try {
      const range = `${GOOGLE_SHEETS_CONFIG.sheets.orders}!A2:Z1000`;
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
