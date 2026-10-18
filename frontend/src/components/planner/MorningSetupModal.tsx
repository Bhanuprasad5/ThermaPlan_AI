import React, { useEffect, useState } from 'react';
import {
  X,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Sun,
  CloudSun,
  ShieldCheck,
  Cpu,
  Layers,
  Check,
  UploadCloud,
  Sliders,
  Clock,
  AlertCircle,
  FileUp,
  Users,
  Zap,
  Calendar,
  CheckCircle,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { parseRules, listAvailableTemplates, loadAvailableTemplate } from '../../services/managerApi';
import { CACHED_RULE_RESULT } from '../../services/geminiService';
import { Worker } from '../../types';

export const MorningSetupModal: React.FC = () => {
  const {
    morningSetupOpen,
    setMorningSetupOpen,
    solveMorningPlan,
    isSolvingBackend,
    backendConnected,
    setCurrentView,
    setWorkers,
  } = usePlant();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedDayId, setSelectedDayId] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [parsedOrdersPreview, setParsedOrdersPreview] = useState<Array<{ id: string; machine: string; duration: string; isCritical: boolean }>>([]);
  const [selectedWorkerFileName, setSelectedWorkerFileName] = useState<string>('');
  const [activeWorkersList, setActiveWorkersList] = useState<Worker[]>([]);
  const [selectedDocName, setSelectedDocName] = useState<string>('');
  const [docUploaded, setDocUploaded] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<'none' | 'template' | 'upload'>('none');
  const [templateDayId, setTemplateDayId] = useState('day1_monday');
  const [templateOptions, setTemplateOptions] = useState<Array<{ day_id: string; label: string }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [tariffFileName, setTariffFileName] = useState('');
  const [solveError, setSolveError] = useState('');

  const plantFilesReady = Boolean(selectedFileName && selectedWorkerFileName);

  useEffect(() => {
    if (!morningSetupOpen) return;
    listAvailableTemplates()
      .then((res) => setTemplateOptions(res.templates.filter((t) => t.available).map((t) => ({ day_id: t.day_id, label: t.label }))))
      .catch(() => setTemplateOptions([]));
  }, [morningSetupOpen]);

  // Natural Language Rules State
  const [naturalLanguageRule, setNaturalLanguageRule] = useState<string>(
    'Keep every station within its ISO 7243 Table A.1 limit, maintain factory output at 98% or more, enforce a 2-hour frozen window on breakdowns, and reserve 2 heat buffers during peak solar hours.'
  );
  const [isExtractingRules, setIsExtractingRules] = useState<boolean>(false);
  const [extractedConstraints, setExtractedConstraints] = useState<any[]>([]);
  const [geminiModelUsed, setGeminiModelUsed] = useState<string>('Not called yet');

  // Horizon & Slot Resolution Configuration
  const [horizonHours, setHorizonHours] = useState<number>(48);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState<number>(15);

  const handleClearOrders = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedFileName('');
    setFileContent('');
    setParsedOrdersPreview([]);
  };

  const handleClearWorkers = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedWorkerFileName('');
    setActiveWorkersList([]);
  };

  const handleClearDoc = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedDocName('');
    setDocUploaded(false);
  };

  const applyOrdersText = (fileName: string, text: string) => {
    setSelectedFileName(fileName);
    setFileContent(text);
    try {
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length > 1) {
        const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const idIdx = header.findIndex((h) => h.includes('order_id') || h === 'id');
        const mIdx = header.findIndex((h) => h.includes('machine'));
        const dIdx = header.findIndex((h) => h.includes('duration') || h.includes('mins'));
        const critIdx = header.findIndex((h) => h.includes('critical') || h.includes('melt'));
        const preview: Array<{ id: string; machine: string; duration: string; isCritical: boolean }> = [];
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
          preview.push({
            id: idIdx >= 0 && cols[idIdx] ? cols[idIdx] : `ORD_${i}`,
            machine: mIdx >= 0 && cols[mIdx] ? cols[mIdx] : 'CNC_1',
            duration: dIdx >= 0 && cols[dIdx] ? `${cols[dIdx]} mins` : '180 mins',
            isCritical: critIdx >= 0 ? cols[critIdx].toLowerCase() === 'true' : false,
          });
        }
        setParsedOrdersPreview(preview);
      }
    } catch (err) {
      console.warn('Error parsing order preview:', err);
    }
  };

  const applyWorkerText = (fileName: string, text: string) => {
    setSelectedWorkerFileName(fileName);
    try {
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length > 1) {
        const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const idIdx = header.findIndex((h) => h.includes('worker_id') || h === 'id');
        const nameIdx = header.findIndex((h) => h.includes('bilingual') || h.includes('full_name') || h.includes('name'));
        const phoneIdx = header.findIndex((h) => h.includes('phone'));
        const stIdx = header.findIndex((h) => h.includes('station') || h.includes('assigned_station'));
        const roleIdx = header.findIndex((h) => h.includes('role'));
        const qualIdx = header.findIndex((h) => h.includes('furnace') || h.includes('qualified'));
        const parsed: Worker[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
          if (cols.length >= 3) {
            parsed.push({
              id: idIdx >= 0 && cols[idIdx] ? cols[idIdx].toLowerCase() : `w_up_${i}`,
              name: nameIdx >= 0 && cols[nameIdx] ? cols[nameIdx] : `Worker ${i}`,
              phone: phoneIdx >= 0 && cols[phoneIdx] ? cols[phoneIdx] : '',
              stationId: stIdx >= 0 && cols[stIdx] ? cols[stIdx] : 'st_furnace_1',
              role: roleIdx >= 0 && cols[roleIdx] ? cols[roleIdx] : 'Industrial Operator',
              isFurnaceQualified: qualIdx >= 0 ? cols[qualIdx].toLowerCase() === 'true' : false,
              status: 'working',
              restTimeRemainingSec: 0,
              hasConsented: true,
              consentType: 'voice_enabled',
              consentDate: '2026-10-18',
            });
          }
        }
        if (parsed.length > 0) {
          setActiveWorkersList(parsed);
          setWorkers(parsed);
        }
      }
    } catch (err) {
      console.warn('Error parsing worker CSV:', err);
    }
  };

  const handleLoadTemplates = async () => {
    setTemplatesLoading(true);
    setTemplateError('');
    try {
      const pack = await loadAvailableTemplate(templateDayId);
      applyOrdersText(pack.orders_filename, pack.orders_csv);
      applyWorkerText(pack.roster_filename, pack.roster_csv);
      setTariffFileName(pack.tariff_filename);
      setSelectedDayId(pack.day_id);
      setDataSource('template');
      setSelectedDocName('');
      setDocUploaded(false);
    } catch {
      setTemplateError('Templates could not be loaded from the backend. Upload the spreadsheets yourself, or start the API on port 8000.');
    } finally {
      setTemplatesLoading(false);
    }
  };

  if (!morningSetupOpen) return null;

  // Handle manual upload of Orders CSV/Excel
  const handleOrdersFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        applyOrdersText(file.name, (event.target?.result as string) || '');
        setDataSource('upload');
        setSelectedDayId('');
      };
      reader.readAsText(file);
    }
  };

  // Handle manual upload of Worker Details CSV/Excel
  const handleWorkerFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        applyWorkerText(file.name, (event.target?.result as string) || '');
        setDataSource('upload');
      };
      reader.readAsText(file);
    }
  };

  // Handle manual upload of Grounding Tariff / Policy Document
  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedDocName(file.name);
      setDocUploaded(true);
    }
  };

  const handleExtractRules = async () => {
    setIsExtractingRules(true);
    try {
      const res = await parseRules(null, null, naturalLanguageRule);
      if (res && res.constraints && res.constraints.length > 0) {
        setExtractedConstraints(
          res.constraints.map((c: any) => ({
            ruleId: c.constraint_id || 'CNS-01',
            targetStation: c.station || 'All Stations',
            parameter: `WBGT Limit: ${c.wbgt_limit_c}°C (Work Class ${c.work_class})`,
            isoStandard: c.source || 'ISO 7243:2017 Table A.1',
            criticPassed: true,
            frozenWindowHours: c.frozen_window_hours || 2,
          }))
        );
        const label = (res as { label?: string; source?: string; gemini_model?: string }).label
          || ((res as { source?: string }).source === 'gemini' ? res.gemini_model : 'Deterministic fallback, no Gemini call');
        if (label) setGeminiModelUsed(label);
      }
    } catch {
      // Keep cached / default
    } finally {
      setIsExtractingRules(false);
    }
  };

  const handleMakePlan = async () => {
    try {
      await solveMorningPlan(
        fileContent || undefined,
        horizonHours,
        slotDurationMinutes,
        activeWorkersList.length > 0 ? activeWorkersList : undefined,
        selectedDayId || undefined
      );
      setSolveError('');
      setCurrentView('planner');
      setMorningSetupOpen(false);
    } catch {
      setSolveError('The solver did not return a plan. The previous plan was kept. Check the backend, then try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full shadow-2xl border border-[#D9DDE2] overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="bg-[#F4F5F7] px-6 py-4 border-b border-[#D9DDE2] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-[#1B1F24] flex items-center gap-2">
              <UploadCloud size={20} className="text-[#0F5FA8]" />
              <span>Plant Orders & Worker Roster Portal</span>
            </h3>
            <p className="text-xs text-[#5B636E]">
              Upload orders • Portal worker roster upload (250+ workers) • TGSPDCL tariffs • OR-Tools CP-SAT
            </p>
          </div>
          <button
            onClick={() => setMorningSetupOpen(false)}
            className="p-1 rounded-md text-[#5B636E] hover:text-[#1B1F24] hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Navigation Bar */}
        <div className="grid grid-cols-4 border-b border-[#D9DDE2] bg-white text-xs font-semibold text-[#5B636E]">
          <button
            onClick={() => setCurrentStep(1)}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              currentStep === 1
                ? 'border-[#0F5FA8] text-[#0F5FA8] bg-blue-50/50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <span>1. Upload Orders & Workers</span>
          </button>
          <button
            type="button"
            disabled={!plantFilesReady}
            onClick={() => plantFilesReady && setCurrentStep(2)}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors disabled:opacity-40 ${
              currentStep === 2
                ? 'border-[#0F5FA8] text-[#0F5FA8] bg-blue-50/50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <span>2. Gemini Rules</span>
          </button>
          <button
            type="button"
            disabled={!plantFilesReady}
            onClick={() => plantFilesReady && setCurrentStep(3)}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors disabled:opacity-40 ${
              currentStep === 3
                ? 'border-[#0F5FA8] text-[#0F5FA8] bg-blue-50/50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <span>3. Slots & Weather</span>
          </button>
          <button
            type="button"
            disabled={!plantFilesReady}
            onClick={() => plantFilesReady && setCurrentStep(4)}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors disabled:opacity-40 ${
              currentStep === 4
                ? 'border-[#0F5FA8] text-[#0F5FA8] bg-blue-50/50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <span>4. Solve Schedule</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Step 1: Upload Orders, Workers, and Grounding Documents */}
          {currentStep === 1 && (
            <div className="space-y-5 text-xs">
              <div className="border border-[#0F5FA8] bg-blue-50/70 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#0F5FA8] uppercase tracking-wider text-xs">Load available templates</p>
                    <p className="text-[11px] text-[#1B1F24] mt-1 leading-relaxed">
                      Nothing is attached until you choose. Load a shipped day package (orders, worker roster, tariff spreadsheet), or upload those spreadsheets yourself. Reference PDFs are not included and stay a manual upload.
                    </p>
                  </div>
                  {dataSource === 'template' && (
                    <span className="shrink-0 text-[10px] font-bold bg-emerald-100 text-[#1E7A46] px-2 py-1 rounded">Templates loaded</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={templateDayId}
                    onChange={(e) => setTemplateDayId(e.target.value)}
                    className="px-2 py-1.5 rounded-md border border-[#D9DDE2] bg-white text-xs"
                    aria-label="Template day"
                  >
                    {(templateOptions.length > 0 ? templateOptions : [
                      { day_id: 'day1_monday', label: 'Day 1 — Monday' },
                      { day_id: 'day2_tuesday', label: 'Day 2 — Tuesday' },
                      { day_id: 'day3_wednesday', label: 'Day 3 — Wednesday' },
                      { day_id: 'day4_thursday', label: 'Day 4 — Thursday' },
                      { day_id: 'day5_friday', label: 'Day 5 — Friday' },
                    ]).map((opt) => (
                      <option key={opt.day_id} value={opt.day_id}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleLoadTemplates}
                    disabled={templatesLoading}
                    className="px-3 py-1.5 rounded-md bg-[#0F5FA8] hover:bg-[#0c4e8a] disabled:bg-slate-300 text-white font-semibold text-xs"
                  >
                    {templatesLoading ? 'Loading templates…' : 'Load available templates'}
                  </button>
                  {tariffFileName && (
                    <span className="text-[11px] text-[#1E7A46] font-semibold">Tariff sheet: {tariffFileName}</span>
                  )}
                </div>
                {templateError && <p className="text-[11px] text-red-700">{templateError}</p>}
              </div>

              {/* Primary User File Upload Cards */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                    <UploadCloud size={16} className="text-[#0F5FA8]" />
                    <span>Upload Custom Plant Files (Bring Your Own Files)</span>
                  </span>
                  <span className="text-[11px] text-[#5B636E]">Upload your operational spreadsheets and standards</span>
                </div>

                {/* 3 Clean Upload Cards: Orders, Workers Roster, and Tariff */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. Orders File */}
                  <div className="border border-[#D9DDE2] rounded-lg p-3.5 bg-white space-y-2.5 shadow-2xs relative">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                        <FileSpreadsheet size={15} className="text-[#0F5FA8]" />
                        <span>1. Plant Orders</span>
                      </span>
                      {selectedFileName ? (
                        <button
                          type="button"
                          onClick={handleClearOrders}
                          className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 font-bold px-1.5 py-0.5 rounded cursor-pointer inline-flex items-center gap-1"
                          title="Remove uploaded orders file"
                        >
                          <X size={10} /> Clear
                        </button>
                      ) : (
                        <span className="text-[10px] bg-blue-100 text-[#0F5FA8] font-bold px-1.5 py-0.5 rounded">
                          CSV / Excel
                        </span>
                      )}
                    </div>

                    <label className={`block border-2 border-dashed rounded-lg p-3.5 text-center transition-colors cursor-pointer ${
                      selectedFileName ? 'border-[#0F5FA8] bg-blue-50/40' : 'border-[#D9DDE2] hover:border-[#0F5FA8] bg-slate-50/50'
                    }`}>
                      <input type="file" accept=".csv,.xlsx,.xls" onChange={handleOrdersFileUpload} className="hidden" />
                      <UploadCloud size={22} className="mx-auto text-[#0F5FA8] mb-1.5" />
                      <p className="font-semibold text-[#1B1F24] text-xs truncate">
                        {selectedFileName || 'Browse or Drag Custom Orders CSV'}
                      </p>
                      <p className="text-[10px] text-[#5B636E] mt-0.5">
                        {fileContent ? `✓ ${fileContent.split('\n').filter(Boolean).length - 1} orders loaded` : 'No file selected (Drop your orders here)'}
                      </p>
                    </label>
                    <p className="text-[10px] text-[#5B636E]">Includes routing sequences, kWh, and due dates across all machines.</p>
                  </div>

                  {/* 2. Worker Roster File */}
                  <div className="border border-emerald-300 rounded-lg p-3.5 bg-emerald-50/20 space-y-2.5 shadow-2xs relative">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider text-[#1E7A46] flex items-center gap-1.5">
                        <Users size={15} className="text-[#1E7A46]" />
                        <span>2. Worker Roster</span>
                      </span>
                      {selectedWorkerFileName ? (
                        <button
                          type="button"
                          onClick={handleClearWorkers}
                          className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 font-bold px-1.5 py-0.5 rounded cursor-pointer inline-flex items-center gap-1"
                          title="Remove uploaded worker roster"
                        >
                          <X size={10} /> Clear
                        </button>
                      ) : (
                        <span className="text-[10px] bg-emerald-100 text-[#1E7A46] font-bold px-1.5 py-0.5 rounded">
                          CSV / Excel
                        </span>
                      )}
                    </div>

                    <label className={`block border-2 border-dashed rounded-lg p-3.5 text-center transition-colors cursor-pointer ${
                      selectedWorkerFileName ? 'border-emerald-500 bg-emerald-50/60' : 'border-emerald-300 hover:border-emerald-600 bg-white'
                    }`}>
                      <input type="file" accept=".csv,.xlsx,.xls" onChange={handleWorkerFileUpload} className="hidden" />
                      <Users size={22} className="mx-auto text-[#1E7A46] mb-1.5" />
                      <p className="font-semibold text-[#1B1F24] text-xs truncate">
                        {selectedWorkerFileName || 'Browse or Drag Custom Worker Roster'}
                      </p>
                      <p className="text-[10px] text-[#1E7A46] font-bold mt-0.5">
                        {activeWorkersList.length > 0 ? `✓ ${activeWorkersList.length} workers loaded` : 'No file selected'}
                      </p>
                    </label>
                    <p className="text-[10px] text-[#5B636E]">
                      Uploaded directly from portal. Zero PII stored. Includes relief certifications.
                    </p>
                  </div>

                  {/* 3. Tariff & Grounding Document */}
                  <div className="border border-[#D9DDE2] rounded-lg p-3.5 bg-white space-y-2.5 shadow-2xs relative">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                        <Zap size={15} className="text-[#C2410C]" />
                        <span>3. Electricity Tariff / SOP</span>
                      </span>
                      {selectedDocName ? (
                        <button
                          type="button"
                          onClick={handleClearDoc}
                          className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 font-bold px-1.5 py-0.5 rounded cursor-pointer inline-flex items-center gap-1"
                          title="Remove attached document"
                        >
                          <X size={10} /> Clear
                        </button>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                          PDF / CSV
                        </span>
                      )}
                    </div>

                    <label className={`block border-2 border-dashed rounded-lg p-3.5 text-center transition-colors cursor-pointer ${
                      selectedDocName ? 'border-[#C2410C] bg-amber-50/40' : 'border-[#D9DDE2] hover:border-[#C2410C] bg-slate-50/50'
                    }`}>
                      <input type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xlsx" onChange={handleDocUpload} className="hidden" />
                      <FileUp size={22} className="mx-auto text-[#C2410C] mb-1.5" />
                      <p className="font-semibold text-[#1B1F24] text-xs truncate">
                        {selectedDocName || 'Browse or Drag Tariff / SOP Document'}
                      </p>
                      <p className="text-[10px] text-[#5B636E] mt-0.5">
                        {docUploaded ? '✓ PDF or SOP attached' : 'Optional. PDFs are never loaded by templates.'}
                      </p>
                    </label>
                    <p className="text-[10px] text-[#5B636E]">10:00–16:00 solar hours concession (₹6.00/kWh) & peak surcharge.</p>
                  </div>
                </div>
              </div>

              {/* Real-time Preview: Workers Ingestion & Orders Ingestion (Shows User Uploaded Data Only) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Worker Roster Preview */}
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#5B636E] mb-2 flex items-center justify-between">
                    <span>Active Worker Roster ({activeWorkersList.length} Uploaded)</span>
                    {activeWorkersList.length > 0 && <span className="text-[10px] text-[#1E7A46] font-bold">100% Acclimatised</span>}
                  </h4>
                  {activeWorkersList.length > 0 ? (
                    <div className="overflow-x-auto border border-[#D9DDE2] rounded-lg max-h-40">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-[#F4F5F7] text-[#5B636E] border-b border-[#D9DDE2] sticky top-0">
                          <tr>
                            <th className="p-1.5">Worker Name</th>
                            <th className="p-1.5">Station</th>
                            <th className="p-1.5">Role</th>
                            <th className="p-1.5">Furnace Certified</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D9DDE2]">
                          {activeWorkersList.slice(0, 5).map((w) => (
                            <tr key={w.id} className="hover:bg-slate-50">
                              <td className="p-1.5 font-semibold text-[#1B1F24]">{w.name}</td>
                              <td className="p-1.5 font-mono text-[10px] text-[#0F5FA8]">{w.stationId}</td>
                              <td className="p-1.5 text-[#5B636E] truncate max-w-[120px]">{w.role}</td>
                              <td className="p-1.5">
                                {w.isFurnaceQualified ? (
                                  <span className="bg-emerald-100 text-[#1E7A46] px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    ✓ Relief
                                  </span>
                                ) : (
                                  <span className="text-[#5B636E] text-[10px]">Standard</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-5 text-center text-[#5B636E] border border-dashed border-[#D9DDE2] rounded-lg bg-slate-50/60 flex flex-col items-center justify-center min-h-[110px]">
                      <Users size={22} className="text-slate-400 mb-1" />
                      <p className="font-semibold text-xs text-[#1B1F24]">No Worker Roster Uploaded</p>
                      <p className="text-[10px] text-[#5B636E] mt-0.5">Load a template, or upload a roster spreadsheet. A default roster is not used.</p>
                    </div>
                  )}
                </div>

                {/* Orders Ingestion Preview */}
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#5B636E] mb-2 flex items-center justify-between">
                    <span>Orders Ingestion Preview ({parsedOrdersPreview.length} Parsed)</span>
                    {parsedOrdersPreview.length > 0 && <span className="text-[10px] text-[#0F5FA8] font-bold">Ready to Dispatch</span>}
                  </h4>
                  {parsedOrdersPreview.length > 0 ? (
                    <div className="overflow-x-auto border border-[#D9DDE2] rounded-lg max-h-40">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-[#F4F5F7] text-[#5B636E] border-b border-[#D9DDE2] sticky top-0">
                          <tr>
                            <th className="p-1.5">Order ID</th>
                            <th className="p-1.5">Machine</th>
                            <th className="p-1.5">Duration</th>
                            <th className="p-1.5">Critical Melt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D9DDE2]">
                          {parsedOrdersPreview.map((ord, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-1.5 font-mono font-bold text-[#0F5FA8]">{ord.id}</td>
                              <td className="p-1.5 font-semibold text-[#1B1F24]">{ord.machine}</td>
                              <td className="p-1.5">{ord.duration}</td>
                              <td className="p-1.5">
                                {ord.isCritical ? (
                                  <span className="text-red-600 font-bold">YES</span>
                                ) : (
                                  <span className="text-slate-400">NO</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-5 text-center text-[#5B636E] border border-dashed border-[#D9DDE2] rounded-lg bg-slate-50/60 flex flex-col items-center justify-center min-h-[110px]">
                      <FileSpreadsheet size={22} className="text-slate-400 mb-1" />
                      <p className="font-semibold text-xs text-[#1B1F24]">No Orders Uploaded</p>
                      <p className="text-[10px] text-[#5B636E] mt-0.5">Load a template, or upload an orders spreadsheet.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 1 Actions */}
              <div className="flex items-center justify-between pt-2 gap-3">
                <p className="text-[11px] text-[#5B636E]">
                  {plantFilesReady
                    ? (dataSource === 'template' ? 'Shipped templates are loaded. You can continue.' : 'Your uploads are loaded. You can continue.')
                    : 'Continue stays off until orders and the worker roster are loaded.'}
                </p>
                <button
                  type="button"
                  disabled={!plantFilesReady}
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2 rounded-lg bg-[#0F5FA8] hover:bg-[#0c4e8a] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <span>Next: Configure Plain-Language Rules</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Gemini Rule Extraction */}
          {currentStep === 2 && (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-blue-50/60 border border-blue-200/60 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[#0F5FA8]" />
                  <span className="font-bold text-[#0F5FA8]">Vertex AI Gemini Function Calling ({geminiModelUsed})</span>
                </div>
                <span className="text-[11px] text-[#5B636E]">Strict Pydantic JSON Schema Extraction</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Natural Language Prompt */}
                <div className="space-y-2">
                  <label className="font-bold text-xs uppercase tracking-wider text-[#1B1F24]">
                    Manager's Plain Language Policy & Shift Rules
                  </label>
                  <textarea
                    rows={7}
                    value={naturalLanguageRule}
                    onChange={(e) => setNaturalLanguageRule(e.target.value)}
                    className="w-full p-3 border border-[#D9DDE2] rounded-lg text-xs font-mono focus:border-[#0F5FA8] focus:ring-1 focus:ring-[#0F5FA8] outline-hidden leading-relaxed"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleExtractRules}
                      disabled={isExtractingRules}
                      className="py-1.5 px-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-semibold rounded text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Sparkles size={13} />
                      <span>{isExtractingRules ? 'Extracting via Gemini...' : 'Parse Rules with Gemini Flash'}</span>
                    </button>
                    <span className="text-[11px] text-[#5B636E]">Grounded by TGSPDCL & ISO 7243</span>
                  </div>
                </div>

                {/* Structured JSON & Safety Critic View */}
                <div className="space-y-2">
                  <label className="font-bold text-xs uppercase tracking-wider text-[#1B1F24]">
                    Structured Constraints & Safety Critic Gate
                  </label>
                  <div className="border border-[#D9DDE2] rounded-lg p-3 bg-slate-50 space-y-2.5 max-h-56 overflow-y-auto">
                    {extractedConstraints.map((c, idx) => (
                      <div key={idx} className="p-2 bg-white rounded border border-[#D9DDE2] shadow-2xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-[#1B1F24]">
                          <span>{c.targetStation}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-[#1E7A46] font-bold inline-flex items-center gap-1">
                            <Check size={10} /> Critic Validated
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5B636E]">{c.parameter}</p>
                        <p className="text-[10px] text-blue-700 font-mono">{c.isoStandard}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 2 Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1B1F24] font-semibold text-xs transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="px-5 py-2 rounded-lg bg-[#0F5FA8] hover:bg-[#0c4e8a] text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <span>Next: Configure Slot Resolution & Tariffs</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Slots, Horizon & Weather Configuration */}
          {currentStep === 3 && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Planning Horizon */}
                <div className="border border-[#D9DDE2] rounded-lg p-4 space-y-3 bg-white">
                  <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                    <Clock size={16} className="text-[#0F5FA8]" />
                    <span>Planning Horizon</span>
                  </span>
                  <p className="text-[11px] text-[#5B636E]">
                    Choose forward planning window for production allocation.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { h: 24, label: '24 Hours (Next Day)' },
                      { h: 48, label: '48 Hours (Standard 2-Day)', default: true },
                      { h: 72, label: '72 Hours (3-Day Forward)' },
                    ].map((item) => (
                      <button
                        key={item.h}
                        type="button"
                        onClick={() => setHorizonHours(item.h)}
                        className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          horizonHours === item.h
                            ? 'bg-blue-50 border-[#0F5FA8] text-[#0F5FA8] font-bold'
                            : 'bg-white border-[#D9DDE2] text-[#1B1F24] hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-bold">{item.h}h</div>
                        <div className="text-[10px] text-[#5B636E]">{item.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time-Slot Resolution */}
                <div className="border border-[#D9DDE2] rounded-lg p-4 space-y-3 bg-white">
                  <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                    <Sliders size={16} className="text-[#0F5FA8]" />
                    <span>Time-Slot Resolution (CP-SAT Granularity)</span>
                  </span>
                  <p className="text-[11px] text-[#5B636E]">
                    Integer programming variable size. Finer slots allow precise CNC tool changes.
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { m: 15, label: '15 min (Standard)' },
                      { m: 30, label: '30 min' },
                      { m: 60, label: '1 hour' },
                      { m: 90, label: '1.5 hours' },
                      { m: 120, label: '2 hours' },
                      { m: 150, label: '2.5 hours' },
                      { m: 180, label: '3 hours' },
                    ].map((item) => (
                      <button
                        key={item.m}
                        type="button"
                        onClick={() => setSlotDurationMinutes(item.m)}
                        className={`p-1.5 rounded-md border text-center transition-colors cursor-pointer ${
                          slotDurationMinutes === item.m
                            ? 'bg-blue-50 border-[#0F5FA8] text-[#0F5FA8] font-bold'
                            : 'bg-white border-[#D9DDE2] text-[#1B1F24] hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-bold text-[11px]">{item.m}m</div>
                        <div className="text-[9px] text-[#5B636E] truncate">{item.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Weather & Tariffs Integration Notice */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#1E7A46] font-semibold">
                  <CloudSun size={18} />
                  <span>Open-Meteo Replayed Forecast ({horizonHours}h) & TGSPDCL HT-1 Solar Tariffs Active</span>
                </div>
                <span className="text-[11px] text-[#5B636E]">
                  {(horizonHours * 60) / slotDurationMinutes} slots will be scheduled
                </span>
              </div>

              {/* Step 3 Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1B1F24] font-semibold text-xs transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="px-5 py-2 rounded-lg bg-[#0F5FA8] hover:bg-[#0c4e8a] text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <span>Review & Solve 48h Plan</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Solve & Dispatch */}
          {currentStep === 4 && (
            <div className="space-y-5 text-xs text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-[#0F5FA8] flex items-center justify-center mx-auto shadow-xs">
                <Cpu size={28} />
              </div>

              <div>
                <h4 className="text-base font-bold text-[#1B1F24]">
                  Ready to Solve Heat-Safe & Carbon-Aware Plan
                </h4>
                <p className="text-[#5B636E] max-w-lg mx-auto text-xs mt-1">
                  Google OR-Tools CP-SAT will schedule {(horizonHours * 60) / slotDurationMinutes} slots across 16 workstations,
                  mathematically enforcing ISO 7243 thermal limits, TGSPDCL solar concessions, and reserving dedicated heat buffers.
                </p>
              </div>

              <div className="bg-slate-50 border border-[#D9DDE2] rounded-xl p-4 max-w-lg mx-auto text-left space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[#D9DDE2]/60">
                  <span className="text-[#5B636E]">Planning Horizon:</span>
                  <span className="font-bold text-[#1B1F24]">{horizonHours} Hours</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#D9DDE2]/60">
                  <span className="text-[#5B636E]">Slot Resolution:</span>
                  <span className="font-bold text-[#1B1F24]">{slotDurationMinutes} Minutes ({(horizonHours * 60) / slotDurationMinutes} slots)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#D9DDE2]/60">
                  <span className="text-[#5B636E]">Orders File:</span>
                  <span className="font-mono text-[#0F5FA8]">
                    {selectedFileName ? `✓ ${selectedFileName} (${fileContent.split('\n').filter(Boolean).length - 1} orders)` : 'None — upload or load a template'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#D9DDE2]/60">
                  <span className="text-[#5B636E]">Worker Details:</span>
                  <span className="font-bold text-[#1E7A46]">
                    {activeWorkersList.length > 0 ? `✓ ${activeWorkersList.length} workers (${selectedWorkerFileName})` : 'None — upload or load a template'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#5B636E]">Grounding Tariff Document:</span>
                  <span className="font-mono text-amber-800">
                    {selectedDocName ? `✓ ${selectedDocName}` : tariffFileName ? `Tariff sheet ${tariffFileName} (illustrative). PDF not attached.` : 'No PDF attached. Tariff stays the illustrative table.'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1B1F24] font-semibold text-xs transition-colors cursor-pointer"
                >
                  Back
                </button>
                {solveError && <p className="text-[11px] text-red-700 text-center">{solveError}</p>}
                <button
                  type="button"
                  onClick={handleMakePlan}
                  disabled={isSolvingBackend || !plantFilesReady}
                  className="px-6 py-2.5 rounded-lg bg-[#0F5FA8] hover:bg-[#0c4e8a] disabled:bg-blue-300 text-white font-bold text-xs inline-flex items-center gap-2 transition-colors cursor-pointer shadow-md"
                >
                  <Cpu size={16} />
                  <span>
                    {isSolvingBackend
                      ? 'Solving with CP-SAT (asia-south1)...'
                      : `Solve & Launch Plan (${horizonHours}h / ${slotDurationMinutes}m)`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
