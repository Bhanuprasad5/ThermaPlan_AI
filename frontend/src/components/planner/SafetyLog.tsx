import React, { useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Search,
  Filter,
  ArrowLeft,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  X,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';

export const SafetyLog: React.FC = () => {
  const { alerts, proposals, goBack } = usePlant();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Combined audit log entries
  const logEntries = [
    {
      id: 'log_01',
      time: '14:22:10',
      type: 'Proposal Approved',
      station: 'Paint Line',
      worker: 'Anitha',
      channel: 'Telugu Voice (Tablet)',
      geminiClass: 'Add 10m rest (Unsure: 0)',
      criticResult: 'Passed (ISO 7243 Sec 6.2)',
      decision: 'Approved by Manager',
      planHash: '7f9a2d',
    },
    {
      id: 'log_02',
      time: '14:14:02',
      type: 'Dizzy Auto-Removal',
      station: 'Furnace 1',
      worker: 'Suresh',
      channel: 'Station Tablet Tap',
      geminiClass: 'No Model Call (Direct Safe Path)',
      criticResult: 'Passed (Factories Act Sec 41H)',
      decision: 'Auto-Removed from Class 3',
      planHash: '7f9a2b',
    },
    {
      id: 'log_03',
      time: '14:12:15',
      type: 'SOS Emergency Signal',
      station: 'Furnace 1',
      worker: 'Suresh',
      channel: '1s Tablet Hold',
      geminiClass: 'No Model Call (Direct Safe Path)',
      criticResult: 'Passed (Continuous Pour Relief)',
      decision: 'Acknowledged by Lakshmi (Floor)',
      planHash: '7f9a2b',
    },
    {
      id: 'log_04',
      time: '14:00:10',
      type: 'Heat Check Generated',
      station: 'Paint Line',
      worker: 'Anitha',
      channel: 'Automated Sensor Trigger',
      geminiClass: 'Weather Rule Crossing (Hot 29.2°C)',
      criticResult: 'Passed (Station Band Crossing)',
      decision: 'Delivered with Telugu Audio',
      planHash: '7f9a2b',
    },
    {
      id: 'log_05',
      time: '07:05:00',
      type: 'Initial 48h Plan',
      station: 'All 12 Stations',
      worker: 'System',
      channel: 'Morning Setup Wizard',
      geminiClass: 'Rule Extraction (5 Constraints)',
      criticResult: 'Passed (Schema & ISO Range)',
      decision: 'Approved by Manager',
      planHash: '7f9a2b',
    },
  ];

  const filtered = logEntries.filter((item) => {
    if (filterType !== 'all' && !item.type.toLowerCase().includes(filterType)) return false;
    if (searchQuery && !item.station.toLowerCase().includes(searchQuery.toLowerCase()) && !item.worker.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1B1F24] flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#D9DDE2] px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            id="safetylog-back-btn"
            className="p-1.5 hover:bg-slate-100 rounded text-[#5B636E] transition-colors cursor-pointer"
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-bold text-lg text-[#1B1F24] flex items-center gap-2">
              <FileText size={20} className="text-[#0F5FA8]" />
              <span>Plant Heat Safety Log (B2)</span>
            </h1>
            <p className="text-xs text-[#5B636E]">
              Reports are kept for 90 days, set by EHS Head on 10 Oct 2026.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-slate-100 border border-[#D9DDE2] text-xs font-semibold text-[#1B1F24] transition-colors"
          >
            <Printer size={14} />
            <span>Internal Safety Record</span>
          </button>

          <button
            onClick={() => alert('Exporting full 48h safety audit log as CSV...')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0F5FA8] hover:bg-[#0D4F8C] text-white text-xs font-semibold transition-colors"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full space-y-4">
        {/* Privacy Note */}
        <div className="bg-white p-3 rounded-lg border border-[#D9DDE2] text-xs text-[#5B636E] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#1E7A46]" />
            <span>
              <strong>Privacy Protection:</strong> Too hot and hazard rows show station only. Worker names appear only for SOS, Dizzy, and Not okay per consent.
            </span>
          </div>
          <span className="text-[11px] font-mono">Retention: 90 Days</span>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-[#D9DDE2]">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search size={14} className="text-[#5B636E]" />
            <input
              type="text"
              placeholder="Search station, worker, or event..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs bg-[#F4F5F7] border border-[#D9DDE2] rounded px-2.5 py-1.5 w-full"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Filter size={14} className="text-[#5B636E]" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-[#F4F5F7] border border-[#D9DDE2] rounded px-2 py-1 text-xs"
            >
              <option value="all">All Events</option>
              <option value="proposal">Proposals</option>
              <option value="dizzy">Dizzy Auto-Removals</option>
              <option value="sos">Emergency SOS</option>
              <option value="check">Heat Checks</option>
            </select>
          </div>
        </div>

        {/* Safety Table */}
        <div className="bg-white rounded-lg border border-[#D9DDE2] overflow-x-auto shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F4F5F7] text-[#5B636E] border-b border-[#D9DDE2]">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Event Type</th>
                <th className="p-3">Station</th>
                <th className="p-3">Worker</th>
                <th className="p-3">Channel</th>
                <th className="p-3">Gemini Extraction</th>
                <th className="p-3">Critic Check</th>
                <th className="p-3">Action / Decision</th>
                <th className="p-3 font-mono">Plan Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9DDE2]">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono text-[11px] text-[#5B636E]">{item.time}</td>
                  <td className="p-3 font-bold text-[#1B1F24]">{item.type}</td>
                  <td className="p-3">{item.station}</td>
                  <td className="p-3 font-medium text-[#0F5FA8]">{item.worker}</td>
                  <td className="p-3 text-[#5B636E]">{item.channel}</td>
                  <td className="p-3 font-mono text-[11px]">{item.geminiClass}</td>
                  <td className="p-3 text-[#1E7A46] font-semibold">{item.criticResult}</td>
                  <td className="p-3 font-semibold">{item.decision}</td>
                  <td className="p-3 font-mono text-[11px] text-[#0F5FA8]">{item.planHash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Printable Internal Heat Safety Record Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-[#D9DDE2] space-y-4">
            <div className="flex items-center justify-between border-b border-[#D9DDE2] pb-3">
              <div>
                <h3 className="font-bold text-base text-[#1B1F24]">
                  Internal Heat Safety Record (Printable PDF View)
                </h3>
                <p className="text-xs text-[#5B636E]">
                  Telangana Metal Works • Factories Act & ISO 7243 Internal Documentation
                </p>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="p-1 rounded text-[#5B636E] hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-[#1B1F24] bg-slate-50 p-4 rounded-lg border border-[#D9DDE2]">
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <strong>Plant:</strong> Telangana Metal Works
                </div>
                <div>
                  <strong>Reporting Period:</strong> Day 1, 07:00 - 15:00
                </div>
                <div>
                  <strong>Total Heat Breaches Prevented:</strong> 28 slots
                </div>
                <div>
                  <strong>Heat Buffers Consumed:</strong> 20 min of 90 min total
                </div>
                <div>
                  <strong>Dizzy Removals:</strong> 1 (Suresh, Furnace 1)
                </div>
                <div>
                  <strong>Relief Swaps:</strong> 1 (Ramesh certified operator)
                </div>
              </div>
              <div className="pt-2 text-[10px] text-[#5B636E] italic">
                * Note: Document title strictly designated as &ldquo;Internal heat safety record&rdquo; per Section 6 B2 audit guidelines.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-3 py-1.5 text-xs rounded border border-[#D9DDE2] text-[#5B636E]"
              >
                Close
              </button>
              <button
                onClick={() => {
                  window.print();
                  setShowPrintModal(false);
                }}
                className="px-4 py-1.5 text-xs rounded bg-[#0F5FA8] text-white font-semibold flex items-center gap-1.5"
              >
                <Printer size={13} />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
