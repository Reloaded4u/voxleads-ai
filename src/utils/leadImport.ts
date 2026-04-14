import { Lead } from '../types';

export interface ImportResult {
  total: number;
  success: number;
  duplicates: number;
  failed: number;
  errors: string[];
}

export const normalizePhone = (phone: string): string => {
  return String(phone).replace(/\D/g, '').slice(-10); // Take last 10 digits for standard Indian numbers
};

export const cleanHeader = (header: string): string => {
  if (!header) return '';
  return String(header)
    .replace(/[^\x20-\x7E]/g, '') // Remove non-printable characters including BOM
    .replace(/["']/g, '')         // Remove quotes that might be in CSV
    .trim()
    .toLowerCase()
    .replace(/[\s\._-]/g, '');    // Remove spaces, dots, underscores, hyphens for fuzzy matching
};

export const isValidEmail = (email: string): boolean => {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const mapHeaders = (row: any): Partial<Lead> => {
  const mapped: any = {};
  const keys = Object.keys(row);

  const findValue = (variations: string[]) => {
    const key = keys.find(k => variations.includes(cleanHeader(k)));
    return key ? String(row[key]).trim() : '';
  };

  mapped.name = findValue(['name', 'fullname', 'leadname', 'customername', 'clientname', 'contactname']);
  mapped.phone = findValue(['phone', 'phonenumber', 'mobile', 'contact', 'mobilenumber', 'phone#', 'mobile#', 'contact#']);
  mapped.email = findValue(['email', 'emailaddress', 'mail', 'emailid']);
  mapped.location = findValue(['location', 'city', 'address', 'area', 'region']);
  mapped.notes = findValue(['notes', 'remark', 'remarks', 'comment', 'description', 'message', 'msg']);

  return mapped;
};

export const validateRow = (lead: Partial<Lead>, existingPhones: Set<string>): { isValid: boolean; reason?: string } => {
  if (!lead.name) return { isValid: false, reason: 'Missing Name' };
  if (!lead.phone) return { isValid: false, reason: 'Missing Phone' };
  
  const normalized = normalizePhone(lead.phone);
  if (normalized.length < 10) return { isValid: false, reason: 'Invalid Phone (must be at least 10 digits)' };
  
  if (existingPhones.has(normalized)) return { isValid: false, reason: 'Duplicate Phone' };
  
  if (lead.email && !isValidEmail(lead.email)) return { isValid: false, reason: 'Invalid Email Format' };

  return { isValid: true };
};

export const generateSampleTemplate = () => {
  const headers = ['Name', 'Phone', 'Email', 'Location', 'Notes'];
  const data = [
    ['John Doe', '9876543210', 'john@example.com', 'Mumbai', 'Interested in 2BHK'],
    ['Jane Smith', '9123456789', 'jane@example.com', 'Delhi', 'Follow up next week']
  ];
  
  const csvContent = [headers, ...data].map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'leads_template.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
