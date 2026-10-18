import React, { useState } from 'react';
import {
  Settings,
  ArrowLeft,
  Users,
  ShieldAlert,
  Flame,
  Clock,
  RotateCcw,
  Check,
  Save,
  QrCode,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { maskPhone } from '../../utils/mapper';

export const SettingsView: React.FC = () => {
  const { stations, workers, goBack, loadDemoPlant, triggerHeatRise } = usePlant();

  const [shortRestMin, setShortRestMin] = useState<number>(10);
  const [bufferMin, setBufferMin] = useState<number>(45);
  const [paidTimePolicy, setPaidTimePolicy] = useState<boolean>(true);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1B1F24] flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#D9DDE2] px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            id="settings-back-btn"
            className="p-1.5 hover:bg-slate-100 rounded text-[#5B636E] transition-colors cursor-pointer"
            title="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-bold text-lg text-[#1B1F24] flex items-center gap-2">
              <Settings size={20} className="text-[#0F5FA8]" />
              <span>Plant Heat Policy & Configuration (B4)</span>
            </h1>
            <p className="text-xs text-[#5B636E]">
              Governed by EHS Head • ISO 7243:2017 thresholds and station offsets
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-md bg-[#0F5FA8] hover:bg-[#0D4F8C] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
        >
          {savedSuccess ? <Check size={14} /> : <Save size={14} />}
          <span>{savedSuccess ? 'Policy Saved & Audited' : 'Save Policy Changes'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto px-6 py-8 w-full space-y-6 text-xs">
        {/* Plant Policy: Rest & Buffer Lengths */}
        <div className="bg-white rounded-xl border border-[#D9DDE2] p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#1B1F24] flex items-center gap-2">
              <Clock size={18} className="text-[#0F5FA8]" />
              <span>Plant Policy, Set by EHS Head (Hard Constraints)</span>
            </h2>
            <span className="text-[11px] text-[#5B636E]">Minimum rest floors enforced in code</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-[#1B1F24]">Short Rest Duration</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={5}
                  max={20}
                  value={shortRestMin}
                  onChange={(e) => setShortRestMin(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 bg-[#F4F5F7] border border-[#D9DDE2] rounded font-mono font-bold"
                />
                <span className="text-[#5B636E]">minutes (5-10m standard)</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#1B1F24]">Hatched Heat Buffer Block</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={30}
                  max={90}
                  value={bufferMin}
                  onChange={(e) => setBufferMin(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 bg-[#F4F5F7] border border-[#D9DDE2] rounded font-mono font-bold"
                />
                <span className="text-[#5B636E]">minutes per hot slot</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#1B1F24]">Paid Time Guarantee</label>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="paidToggle"
                  checked={paidTimePolicy}
                  onChange={(e) => setPaidTimePolicy(e.target.checked)}
                  className="w-4 h-4 text-[#0F5FA8] rounded border-gray-300"
                />
                <label htmlFor="paidToggle" className="text-xs font-semibold text-[#1E7A46]">
                  Rest & auto Dizzy removal count as paid time
                </label>
              </div>
            </div>
          </div>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[#7A4100] text-[11px]">
            <strong>Consequence:</strong> Shorter rests free up to 18 minutes of plant output on hot days, but cannot fall below the 5-minute physiological recovery floor.
          </div>
        </div>

        {/* Station Offsets & Pours */}
        <div className="bg-white rounded-xl border border-[#D9DDE2] p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#1B1F24] flex items-center gap-2">
              <Flame size={18} className="text-[#C2410C]" />
              <span>Stations, Offsets & Non-Interruptible Pour Steps</span>
            </h2>
            <span className="text-[11px] text-[#5B636E]">Screening offset calibration</span>
          </div>

          <div className="overflow-x-auto border border-[#D9DDE2] rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-[#F4F5F7] text-[#5B636E] border-b border-[#D9DDE2]">
                <tr>
                  <th className="p-3">Station Name</th>
                  <th className="p-3">Metabolic Workload</th>
                  <th className="p-3">Assumed Uplift Offset</th>
                  <th className="p-3">Continuous Pour Rule</th>
                  <th className="p-3">Tablet Pairing QR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9DDE2]">
                {stations.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-[#1B1F24]">
                      {st.nameEn} <span className="text-[#5B636E] font-telugu">({st.nameTe})</span>
                    </td>
                    <td className="p-3 capitalize">{st.metabolicClass}</td>
                    <td className="p-3 font-mono font-bold text-[#C2410C]">
                      +{st.offsetC}°C (simulated)
                    </td>
                    <td className="p-3">
                      {st.activePour ? (
                        <span className="bg-amber-100 text-[#7A4100] px-2 py-0.5 rounded font-bold">
                          Yes (Melt #A104 Pour)
                        </span>
                      ) : (
                        <span className="text-[#5B636E]">Interruptible</span>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => alert(`Station tablet QR code for ${st.nameEn} generated.`)}
                        className="inline-flex items-center gap-1 text-[#0F5FA8] hover:underline"
                      >
                        <QrCode size={13} />
                        <span>Pair Tablet</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Worker Roster & Relief Qualifications */}
        <div className="bg-white rounded-xl border border-[#D9DDE2] p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#1B1F24] flex items-center gap-2">
              <Users size={18} className="text-[#0F5FA8]" />
              <span>Worker Roster & Relief Operator Qualifications</span>
            </h2>
            <span className="text-[11px] bg-slate-100 text-[#5B636E] px-2 py-0.5 rounded">
              Fictional demo names
            </span>
          </div>

          <div className="overflow-x-auto border border-[#D9DDE2] rounded-lg">
            <table className="w-full text-left">
              <thead className="bg-[#F4F5F7] text-[#5B636E] border-b border-[#D9DDE2]">
                <tr>
                  <th className="p-3">Worker Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Furnace Relief Qualified</th>
                  <th className="p-3">Consent Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9DDE2]">
                {workers.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-[#1B1F24]">{w.name}</td>
                    <td className="p-3 text-[#5B636E]">{w.role}</td>
                    <td className="p-3 font-mono">{maskPhone(w.phone)}</td>
                    <td className="p-3">
                      {w.isFurnaceQualified ? (
                        <span className="bg-emerald-100 text-[#1E7A46] px-2 py-0.5 rounded font-bold">
                          ✓ Certified Relief
                        </span>
                      ) : (
                        <span className="text-[#5B636E]">Standard</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="bg-blue-50 text-[#0F5FA8] px-2 py-0.5 rounded font-medium">
                        {w.consentType} ({w.consentDate})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Demo Controls Reset */}
        <div className="bg-white rounded-xl border border-[#D9DDE2] p-6 shadow-2xs flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-[#1B1F24]">Reset Demo State</h3>
            <p className="text-xs text-[#5B636E]">
              Restore pristine morning state, pre-join all station tablets, reset solver run hash to 7f9a2b
            </p>
          </div>
          <button
            onClick={loadDemoPlant}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#1B1F24] font-semibold text-xs border border-[#D9DDE2] inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw size={14} />
            <span>Load demo plant</span>
          </button>
        </div>
      </main>
    </div>
  );
};
