import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, CheckCircle2, Download, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { generateSampleTemplate, cleanHeader } from '../utils/leadImport';

interface LeadUploadProps {
  onUpload: (leads: any[], autoEnqueue: boolean) => void;
  onClose: () => void;
  initialAutoEnqueue?: boolean;
}

export default function LeadUpload({ onUpload, onClose, initialAutoEnqueue = false }: LeadUploadProps) {
  const [autoEnqueue, setAutoEnqueue] = React.useState(initialAutoEnqueue);
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" }).filter((row: any) => 
          Object.values(row).some(v => v !== null && v !== undefined && v !== "")
        );
        
        if (json.length === 0) {
          toast.error("The file appears to be empty.");
          return;
        }

        // Basic header check
        let finalJson = json;
        let firstRow = json[0] as any;
        let rawHeaders = Object.keys(firstRow);

        // Check for "one big header" case (delimiter issue)
        // This happens when the parser fails to split columns correctly
        if (rawHeaders.length === 1) {
          const headerStr = rawHeaders[0];
          const delimiters = [',', ';', '\t', '|'];
          const detectedDelimiter = delimiters.find(d => headerStr.includes(d));

          if (detectedDelimiter) {
            console.warn(`[LeadUpload] Delimiter issue detected. Attempting recovery with: "${detectedDelimiter}"`);
            
            // Attempt to re-parse manually if it's a simple CSV-like structure
            // This is a fallback for when XLSX.read fails to detect the delimiter
            try {
              const recoveredJson = json.map(row => {
                const values = String(Object.values(row)[0]).split(detectedDelimiter);
                const headers = headerStr.split(detectedDelimiter);
                const newRow: any = {};
                headers.forEach((h, i) => {
                  newRow[h.trim()] = values[i]?.trim() || "";
                });
                return newRow;
              });

              if (recoveredJson.length > 0) {
                finalJson = recoveredJson;
                firstRow = recoveredJson[0];
                rawHeaders = Object.keys(firstRow);
                console.log("[LeadUpload] Recovery successful. New headers:", rawHeaders);
              }
            } catch (err) {
              console.error("[LeadUpload] Recovery failed:", err);
            }
          }
        }

        const normalizedHeaders = rawHeaders.map(h => cleanHeader(h));
        
        console.log("Raw Headers detected:", rawHeaders);
        console.log("Normalized Headers:", normalizedHeaders);

        const hasName = normalizedHeaders.some(h => ['name', 'fullname', 'leadname', 'customername', 'clientname', 'contactname'].includes(h));
        const hasPhone = normalizedHeaders.some(h => ['phone', 'phonenumber', 'mobile', 'contact', 'mobilenumber', 'phone#', 'mobile#', 'contact#'].includes(h));

        if (!hasName || !hasPhone) {
          const missing = [];
          if (!hasName) missing.push("Name");
          if (!hasPhone) missing.push("Phone");
          toast.error(`Missing required headers: ${missing.join(' and ')}. Found: ${rawHeaders.join(', ')}`);
          return;
        }

        onUpload(finalJson, autoEnqueue);
        onClose();
      } catch (error) {
        console.error("Error parsing file:", error);
        toast.error("Failed to parse file. Please ensure it's a valid CSV or Excel file.");
      }
    };

    reader.readAsArrayBuffer(file);
  }, [onUpload, onClose]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  } as any);

  return (
    <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-xl font-bold text-zinc-900">Import Leads</h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-8">
          <div 
            {...getRootProps()} 
            className={cn(
              "border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer",
              isDragActive ? "border-orange-500 bg-orange-50" : "border-zinc-200 hover:border-orange-400 hover:bg-zinc-50"
            )}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mb-4">
              <Upload size={32} />
            </div>
            <h4 className="text-lg font-bold text-zinc-900">
              {isDragActive ? "Drop the file here" : "Click or drag file to upload"}
            </h4>
            <p className="text-sm text-zinc-500 mt-2 max-w-xs">
              Supported formats: CSV, XLSX, XLS
            </p>
          </div>

          <div className="mt-8 space-y-6">
            <div className="flex items-center justify-between p-4 bg-orange-50/50 border border-orange-100 rounded-xl">
              <div className="space-y-0.5">
                <h5 className="text-sm font-bold text-zinc-900">Auto-enqueue Leads</h5>
                <p className="text-[10px] text-zinc-500">Automatically add these leads to the calling queue.</p>
              </div>
              <button
                onClick={() => setAutoEnqueue(!autoEnqueue)}
                className={cn(
                  "w-10 h-5 rounded-full transition-colors relative",
                  autoEnqueue ? "bg-orange-500" : "bg-zinc-200"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
                  autoEnqueue ? "left-5.5" : "left-0.5"
                )} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Expected Format</h5>
              <button 
                onClick={generateSampleTemplate}
                className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors"
              >
                <Download size={14} />
                Download Template
              </button>
            </div>
            
            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-3">
              <div className="flex items-start gap-3 text-sm text-zinc-600">
                <CheckCircle2 size={16} className="text-green-500 mt-0.5" />
                <div>
                  <span className="font-bold text-zinc-900">Required:</span> Name, Phone
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm text-zinc-600">
                <CheckCircle2 size={16} className="text-green-500 mt-0.5" />
                <div>
                  <span className="font-bold text-zinc-900">Optional:</span> Email, Location, Notes
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm text-zinc-600">
                <AlertCircle size={16} className="text-orange-500 mt-0.5" />
                <p className="text-xs">Phone numbers will be normalized to 10 digits.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2 text-sm font-bold text-zinc-600 hover:text-zinc-900 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
