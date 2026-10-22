/**
 * Google Sheets Integration Utility
 */
import { Utils } from './utils';

export const GoogleSheetsAPI = {
  /**
   * Parse a Google Sheet URL to extract spreadsheetId and gid
   */
  parseSheetUrl(url) {
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/');
      
      // Typical URL: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
      const dIndex = pathParts.indexOf('d');
      if (dIndex === -1 || dIndex + 1 >= pathParts.length) {
        return null;
      }
      
      const spreadsheetId = pathParts[dIndex + 1];
      let gid = '0'; // Default to first sheet
      
      if (parsedUrl.searchParams.has('gid')) {
        gid = parsedUrl.searchParams.get('gid');
      } else if (parsedUrl.hash) {
        const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
        if (hashParams.has('gid')) {
          gid = hashParams.get('gid');
        }
      }
      
      return { spreadsheetId, gid };
    } catch (e) {
      return null;
    }
  },

  /**
   * Extract clean company name from Google Sheet tab title
   * e.g. "IPE Production Worker IV" -> "IPE", "PSA IV List 2026" -> "PSA"
   */
  extractCompanyFromTab(tabName) {
    if (!tabName) return '';
    const clean = String(tabName).trim();
    const sub = clean.replace(
      /\s+(iv\s*list.*|open\s*iv.*|production\s*worker.*|operator.*|technician.*|worker.*|record.*|interview.*|list.*|jul\d*|aug\d*|sep\d*|oct\d*|nov\d*|dec\d*|\d{4})\b.*$/i,
      ''
    ).trim();
    return sub || clean;
  },

  /**
   * Fetch spreadsheet metadata to get tab names and matching gid
   */
  async fetchSpreadsheetMetadata(spreadsheetId, accessToken) {
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title,index))`;
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      return (data.sheets || []).map(s => ({
        sheetId: String(s.properties?.sheetId),
        title: s.properties?.title,
        index: s.properties?.index
      }));
    } catch (e) {
      console.warn('Failed to fetch spreadsheet metadata:', e);
      return null;
    }
  },

  /**
   * Fetch public sheet data via CSV export URL
   * This is the easiest way and doesn't require OAuth if the sheet is "Anyone with the link can view"
   */
  async fetchPublicSheetCSV(spreadsheetId, gid) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch public sheet: ${response.status} ${response.statusText}`);
      }
      
      const text = await response.text();
      // Google Sheets returns HTML for login page if it's private but we try to access it via CSV export
      if (text.includes('<html') && text.includes('Sign in')) {
        throw new Error('PRIVATE_SHEET');
      }
      
      return this.parseCSV(text);
    } catch (error) {
      if (error.message === 'PRIVATE_SHEET') {
        throw error;
      }
      throw new Error('无法访问公开表格，请检查链接或尝试授权登录获取 / Cannot access public sheet. Check URL or authorize with Google.');
    }
  },

  /**
   * Fetch private sheet data using Google Sheets API v4
   * Requires OAuth access_token with 'https://www.googleapis.com/auth/spreadsheets.readonly' scope
   */
  async fetchPrivateSheetData(spreadsheetId, accessToken, range = 'A1:Z1000') {
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
      }
      
      const data = await response.json();
      return data.values || [];
    } catch (error) {
      throw new Error(`无法获取私有表格数据 / Failed to fetch private sheet: ${error.message}`);
    }
  },

  /**
   * Parse CSV string into 2D array
   * Handles basic quotes and commas inside fields
   */
  parseCSV(text) {
    const result = [];
    let row = [];
    let inQuotes = false;
    let field = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(field);
        field = '';
      } else if (char === '\n' && !inQuotes) {
        // Handle \r\n or just \n
        if (field.endsWith('\r')) {
          field = field.slice(0, -1);
        }
        row.push(field);
        result.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    
    // Add the last row if not empty
    if (field !== '' || row.length > 0) {
      if (field.endsWith('\r')) field = field.slice(0, -1);
      row.push(field);
      result.push(row);
    }
    
    return result;
  },

  /**
   * Map a single row array to a Candidate object based on fieldMapping
   * fieldMapping format: { 0: 'name', 1: 'phone', 2: 'school', 4: 'stage' ... }
   * where key is column index, value is system field key
   */
  mapRowToCandidate(row, fieldMapping) {
    const candidate = {};
    
    for (const colIndexStr in fieldMapping) {
      const colIndex = parseInt(colIndexStr, 10);
      const fieldKey = fieldMapping[colIndexStr];
      
      if (fieldKey && fieldKey !== 'skip' && colIndex < row.length) {
        const value = row[colIndex] ? String(row[colIndex]).trim() : '';
        if (value) {
          if (fieldKey === 'icNoAge') {
            candidate.icNoAge = value;
            // 提取身份证号 (支持马来西亚 12 位或带横线格式)
            const icMatch = value.match(/(\d{6}-\d{2}-\d{4}|\d{12})/);
            if (icMatch) {
              candidate.icNo = icMatch[1];
              const rest = value.replace(icMatch[1], '').trim();
              const ageMatch = rest.match(/\b(1[89]|[2-6]\d|7[0-5])\b/);
              if (ageMatch) candidate.age = ageMatch[1];
            } else {
              const ageMatch = value.match(/\b(1[89]|[2-6]\d|7[0-5])\b/);
              if (ageMatch) {
                candidate.age = ageMatch[1];
              } else {
                candidate.icNo = value;
              }
            }
          } else {
            candidate[fieldKey] = value;
          }
        }
      }
    }
    
    // 兼容互通键名
    if (candidate.candidateName && !candidate.name) candidate.name = candidate.candidateName;
    if (candidate.rawStatus && !candidate.remarks) candidate.remarks = candidate.rawStatus;
    if (candidate.qualification && !candidate.degree) candidate.degree = candidate.qualification;
    if (candidate.offered && !candidate.salary) candidate.salary = candidate.offered;

    // 智能提取标准化面试日期与面试时刻 (格式化为 YYYY-MM-DD 与 HH:mm)
    if (candidate.interviewDate) {
      const parsedDT = Utils.parseInterviewDateTime(candidate.interviewDate, candidate.interviewTime);
      if (parsedDT.dateStr && parsedDT.dateStr !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(parsedDT.dateStr)) {
        candidate.interviewDateRaw = candidate.interviewDate;
        candidate.interviewDate = parsedDT.dateStr;
      } else {
        // 非合规日期（如状态备注、月份说明）：保留至原始字段与备注，杜绝污染面试日期字段
        candidate.interviewDateRaw = candidate.interviewDate;
        if (!candidate.remarks) {
          candidate.remarks = candidate.interviewDate;
        } else if (!candidate.remarks.includes(candidate.interviewDate)) {
          candidate.remarks = `${candidate.remarks} | ${candidate.interviewDate}`;
        }
        delete candidate.interviewDate;
      }
      if (parsedDT.timeStr && !candidate.interviewTime) {
        candidate.interviewTime = parsedDT.timeStr;
      }
    }

    return candidate;
  },

  /**
   * Serialize sheet rows into a structured text format suitable for LLM parsing
   * @param {Array} headers - Row 0 (Headers array)
   * @param {Array} rows - Array of row arrays (Row 1 to N)
   * @returns {String} Formatted text
   */
  serializeRowsForAI(headers, rows) {
    let result = '';
    
    // Create header row
    const cleanHeaders = headers.map(h => String(h || '').replace(/\|/g, '-').replace(/\n/g, ' ').trim());
    result += '| ' + cleanHeaders.join(' | ') + ' |\n';
    
    // Create separator row
    result += '|' + cleanHeaders.map(() => '---').join('|') + '|\n';
    
    // Create data rows
    rows.forEach(row => {
      if (!row || row.length === 0) return;
      
      const rowData = [];
      for (let i = 0; i < cleanHeaders.length; i++) {
        let val = row[i] ? String(row[i]) : '';
        // Escape pipes and newlines to preserve markdown table structure
        val = val.replace(/\|/g, '、').replace(/\n/g, '<br>');
        rowData.push(val);
      }
      
      // Only add row if it has at least one non-empty value
      if (rowData.some(val => val.trim() !== '')) {
        result += '| ' + rowData.join(' | ') + ' |\n';
      }
    });
    
    return result;
  }
};
