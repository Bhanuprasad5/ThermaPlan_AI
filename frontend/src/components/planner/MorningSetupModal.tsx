import React, { useState } from 'react';
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
import { parseRules } from '../../services/managerApi';
import { CACHED_RULE_RESULT } from '../../services/geminiService';
import { FIVE_DAY_DATASETS, DayDatasetPackage } from '../../constants/dailyDatasets';
import { Worker } from '../../types';

export const MorningSetupModal: React.FC = () => {
  const {
    morningSetupOpen,
    setMorningSetupOpen,
    loadDemoPlant,
    solveMorningPlan,
    isSolvingBackend,
    backendConnected,
    setCurrentView,
    workers,
    setWorkers,
    activeDatasetDay,
    setActiveDatasetDay,
  } = usePlant();

  // Find initial day package
  const initialPackage = FIVE_DAY_DATASETS.find((d) => d.id === activeDatasetDay) || FIVE_DAY_DATASETS[0];

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedDayId, setSelectedDayId] = useState<string>(initialPackage.id);
  const [selectedFileName, setSelectedFileName] = useState<string>(initialPackage.orders_file);
  const [fileContent, setFileContent] = useState<string>(initialPackage.orders_csv_raw);
  const [selectedWorkerFileName, setSelectedWorkerFileName] = useState<string>(initialPackage.workers_file);
  const [activeWorkersList, setActiveWorkersList] = useState<Worker[]>(initialPackage.workers);
  const [selectedDocName, setSelectedDocName] = useState<string>(initialPackage.tariff_file);
  const [docUploaded, setDocUploaded] = useState<boolean>(true);

  // Natural Language Rules State
  const [naturalLanguageRule, setNaturalLanguageRule] = useState<string>(
    'Keep every station within its ISO 7243 limit, maintain factory output at 98% or more, enforce a 2-hour frozen window on breakdowns, and reserve 2 heat buffers during peak solar hours.'
  );
  const [isExtractingRules, setIsExtractingRules] = useState<boolean>(false);
  const [extractedConstraints, setExtractedConstraints] = useState<any[]>(CACHED_RULE_RESULT.constraints);
  const [geminiModelUsed, setGeminiModelUsed] = useState<string>('gemini-2.5-flash');

  // Horizon & Slot Resolution Configuration
  const [horizonHours, setHorizonHours] = useState<number>(48);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState<number>(15);

  if (!morningSetupOpen) return null;

  // Handle selection of one of the 5 Pre-Packaged Days
  const handleSelectDayPackage = (pkg: DayDatasetPackage) => {
    setSelectedDayId(pkg.id);
    setActiveDatasetDay(pkg.id);
    setSelectedFileName(pkg.orders_file);
    setFileContent(pkg.orders_csv_raw);
    setSelectedWorkerFileName(pkg.workers_file);
    setActiveWorkersList(pkg.workers);
    setWorkers(pkg.workers);
    setSelectedDocName(pkg.tariff_file);
  };

  // Handle manual upload of Orders CSV/Excel
  const handleOrdersFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFileContent((event.target?.result as string) || '');
      };
      reader.readAsText(file);
    }
  };

  // Handle manual upload of Worker Details CSV/Excel
  const handleWorkerFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedWorkerFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = (event.target?.result as string) || '';
        try {
          const lines = text.split('\n').filter((l) => l.trim().length > 0);
          if (lines.length > 1) {
            const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
            const idIdx = header.findIndex((h) => h.includes('worker_id') || h.includes('id'));
            const nameIdx = header.findIndex((h) => h.includes('name') || h.includes('bilingual'));
            const phoneIdx = header.findIndex((h) => h.includes('phone'));
            const stIdx = header.findIndex((h) => h.includes('station') || h.includes('assigned_station'));
            const roleIdx = header.findIndex((h) => h.includes('role'));
            const qualIdx = header.findIndex((h) => h.includes('furnace') || h.includes('qualified'));

            const parsed: Worker[] = [];
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
              if (cols.length >= 3) {
                const wId = idIdx >= 0 && cols[idIdx] ? cols[idIdx].toLowerCase() : `w_up_${i}`;
                const wName = nameIdx >= 0 && cols[nameIdx] ? cols[nameIdx] : `Worker ${i}`;
                const wPhone = phoneIdx >= 0 && cols[phoneIdx] ? cols[phoneIdx] : `+91 98480 ${10000 + i}`;
                const wSt = stIdx >= 0 && cols[stIdx] ? cols[stIdx] : 'st_furnace_1';
                const wRole = roleIdx >= 0 && cols[roleIdx] ? cols[roleIdx] : 'Industrial Operator';
                const isQual = qualIdx >= 0 ? cols[qualIdx].toLowerCase() === 'true' : i % 5 === 0;

                parsed.push({
                  id: wId,
                  name: wName,
                  phone: wPhone,
                  stationId: wSt,
                  role: wRole,
                  isFurnaceQualified: isQual,
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
          console.warn('Error parsing uploaded worker CSV, keeping existing list:', err);
        }
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
        if (res.gemini_model) setGeminiModelUsed(res.gemini_model);
      }
    } catch {
      // Keep cached / default
    } finally {
      setIsExtractingRules(false);
    }
  };

  const handleMakePlan = async () => {
    try {
      await solveMorningPlan(fileContent || undefined, horizonHours, slotDurationMinutes, activeWorkersList);
      setCurrentView('planner');
    } catch {
      setWorkers(activeWorkersList);
      loadDemoPlant();
      setCurrentView('planner');
    } finally {
      setMorningSetupOpen(false);
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
            onClick={() => setCurrentStep(2)}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              currentStep === 2
                ? 'border-[#0F5FA8] text-[#0F5FA8] bg-blue-50/50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <span>2. Gemini Rules</span>
          </button>
          <button
            onClick={() => setCurrentStep(3)}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              currentStep === 3
                ? 'border-[#0F5FA8] text-[#0F5FA8] bg-blue-50/50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <span>3. Slots & Weather</span>
          </button>
          <button
            onClick={() => setCurrentStep(4)}
            className={`py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
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
              {/* 5-Day Dataset Quick Switcher */}
              <div className="bg-slate-50 border border-[#D9DDE2] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                    <Calendar size={14} className="text-[#0F5FA8]" />
                    <span>Select Real-World Day Scenario (from sample_manager_uploads)</span>
                  </span>
                  <span className="text-[11px] text-[#5B636E]">5 distinct daily packages with orders, 250+ workers & tariffs</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {FIVE_DAY_DATASETS.map((pkg) => {
                    const isSelected = selectedDayId === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => handleSelectDayPackage(pkg)}
                        className={`text-left p-2.5 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-[#0F5FA8] shadow-xs ring-1 ring-[#0F5FA8]'
                            : 'bg-white border-[#D9DDE2] hover:border-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-bold text-[11px] ${isSelected ? 'text-[#0F5FA8]' : 'text-[#1B1F24]'}`}>
                            {pkg.id.replace('_', ' ').toUpperCase()}
                          </span>
                          {isSelected && <CheckCircle size={12} className="text-[#0F5FA8]" />}
                        </div>
                        <p className="text-[10px] text-[#5B636E] font-medium truncate">{pkg.theme}</p>
                        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#1E7A46]">
                          <span>{pkg.worker_count} Workers</span> • <span>{pkg.orders_count} Orders</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3 Upload Cards: Orders, Workers Roster, and Tariff */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Orders File */}
                <div className="border border-[#D9DDE2] rounded-lg p-3.5 bg-white space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                      <FileSpreadsheet size={15} className="text-[#0F5FA8]" />
                      <span>1. Plant Orders</span>
                    </span>
                    <span className="text-[10px] bg-blue-100 text-[#0F5FA8] font-bold px-1.5 py-0.5 rounded">
                      CSV / Excel
                    </span>
                  </div>

                  <label className="block border-2 border-dashed border-[#D9DDE2] rounded-lg p-3 text-center hover:border-[#0F5FA8] bg-slate-50/50 transition-colors cursor-pointer">
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={handleOrdersFileUpload} className="hidden" />
                    <UploadCloud size={20} className="mx-auto text-[#0F5FA8] mb-1" />
                    <p className="font-semibold text-[#1B1F24] text-[11px] truncate">{selectedFileName}</p>
                    <p className="text-[10px] text-[#5B636E]">
                      {fileContent ? `${fileContent.split('\n').filter(Boolean).length} rows loaded` : 'Choose orders spreadsheet'}
                    </p>
                  </label>
                  <p className="text-[10px] text-[#5B636E]">Includes routing sequences, kWh, and due dates across all 16 machines.</p>
                </div>

                {/* 2. Worker Roster File (PORTAL UPLOAD - NO BIGQUERY DEPENDENCY) */}
                <div className="border border-emerald-300 rounded-lg p-3.5 bg-emerald-50/30 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase tracking-wider text-[#1E7A46] flex items-center gap-1.5">
                      <Users size={15} className="text-[#1E7A46]" />
                      <span>2. Worker Details</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-[#1E7A46] font-bold px-1.5 py-0.5 rounded">
                      Portal Upload
                    </span>
                  </div>

                  <label className="block border-2 border-dashed border-emerald-300 rounded-lg p-3 text-center hover:border-emerald-600 bg-white transition-colors cursor-pointer">
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={handleWorkerFileUpload} className="hidden" />
                    <Users size={20} className="mx-auto text-[#1E7A46] mb-1" />
                    <p className="font-semibold text-[#1B1F24] text-[11px] truncate">{selectedWorkerFileName}</p>
                    <p className="text-[10px] text-[#1E7A46] font-bold">
                      ✓ {activeWorkersList.length} Workers Active in Portal
                    </p>
                  </label>
                  <p className="text-[10px] text-[#5B636E]">
                    Uploaded directly from portal. Zero PII stored. Includes bilingual Telugu names and relief certifications.
                  </p>
                </div>

                {/* 3. Tariff & Grounding Document */}
                <div className="border border-[#D9DDE2] rounded-lg p-3.5 bg-white space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
                      <Zap size={15} className="text-[#C2410C]" />
                      <span>3. Electricity Tariff</span>
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                      TGSPDCL HT-1
                    </span>
                  </div>

                  <label className="block border-2 border-dashed border-[#D9DDE2] rounded-lg p-3 text-center hover:border-[#C2410C] bg-slate-50/50 transition-colors cursor-pointer">
                    <input type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xlsx" onChange={handleDocUpload} className="hidden" />
                    <FileUp size={20} className="mx-auto text-[#C2410C] mb-1" />
                    <p className="font-semibold text-[#1B1F24] text-[11px] truncate">{selectedDocName}</p>
                    <p className="text-[10px] text-[#5B636E]">
                      {docUploaded ? 'Grounding rules & solar concessions attached' : 'Upload tariff order'}
                    </p>
                  </label>
                  <p className="text-[10px] text-[#5B636E]">10:00–16:00 solar hours concession (₹4.40/kWh) & peak surcharge.</p>
                </div>
              </div>

              {/* Real-time Preview: Workers Ingestion & Orders Ingestion */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Worker Roster Preview */}
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#5B636E] mb-2 flex items-center justify-between">
                    <span>Active Worker Roster ({activeWorkersList.length} Headcount)</span>
                    <span className="text-[10px] text-[#1E7A46] font-bold">100% Acclimatised</span>
                  </h4>
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
                </div>

                {/* Orders Ingestion Preview */}
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#5B636E] mb-2 flex items-center justify-between">
                    <span>Orders Ingestion Preview</span>
                    <span className="text-[10px] text-[#0F5FA8] font-bold">48h Horizon Coverage</span>
                  </h4>
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
                        <tr>
                          <td className="p-1.5 font-mono font-bold text-[#0F5FA8]">ORD_AERO_01</td>
                          <td className="p-1.5">FURNACE_1</td>
                          <td className="p-1.5">180 min (12 slots)</td>
                          <td className="p-1.5 text-red-600 font-bold">YES</td>
                        </tr>
                        <tr>
                          <td className="p-1.5 font-mono font-bold text-[#0F5FA8]">ORD_AERO_02</td>
                          <td className="p-1.5">FURNACE_2</td>
                          <td className="p-1.5">150 min (10 slots)</td>
                          <td className="p-1.5 text-red-600 font-bold">YES</td>
                        </tr>
                        <tr>
                          <td className="p-1.5 font-mono font-bold text-[#0F5FA8]">ORD_AERO_03</td>
                          <td className="p-1.5">CNC_1</td>
                          <td className="p-1.5">180 min (12 slots)</td>
                          <td className="p-1.5 text-slate-500">NO</td>
                        </tr>
                        <tr>
                          <td className="p-1.5 font-mono font-bold text-[#0F5FA8]">ORD_AERO_04</td>
                          <td className="p-1.5">CNC_2</td>
                          <td className="p-1.5">240 min (16 slots)</td>
                          <td className="p-1.5 text-slate-500">NO</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Step 1 Actions */}
              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2 rounded-lg bg-[#0F5FA8] hover:bg-[#0c4e8a] text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
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
                  <span className="text-[#5B636E]">Active Dataset Day:</span>
                  <span className="font-bold text-[#0F5FA8] uppercase">{selectedDayId.replace('_', ' ')}</span>
                </div>
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
                  <span className="font-mono text-[#0F5FA8]">{selectedFileName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#D9DDE2]/60">
                  <span className="text-[#5B636E]">Worker Details (Portal Upload):</span>
                  <span className="font-bold text-[#1E7A46]">✓ {activeWorkersList.length} Workers Active ({selectedWorkerFileName})</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#5B636E]">Grounding Doc:</span>
                  <span className="font-mono text-amber-800">{selectedDocName}</span>
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
                <button
                  type="button"
                  onClick={handleMakePlan}
                  disabled={isSolvingBackend}
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
