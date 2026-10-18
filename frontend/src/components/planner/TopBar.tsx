import React, { useState } from 'react';
import {
  CloudSun,
  Lock,
  Bell,
  RefreshCw,
  PlusCircle,
  Tablet,
  LayoutDashboard,
  ShieldCheck,
  FileText,
  Settings,
  ChevronDown,
  User,
  SlidersHorizontal,
  Smartphone,
  Users,
  LogOut,
  Calendar,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { AreaAlertBadge } from '../common/AreaAlertBadge';

export const TopBar: React.FC = () => {
  const {
    weather,
    frozenUntilTime,
    isBreakdownActive,
    notificationsEnabled,
    setNotificationsEnabled,
    setMorningSetupOpen,
    stepWeatherForward,
    judgeSideBySide,
    setJudgeSideBySide,
    setCurrentView,
    triggerHeatRise,
    triggerSos,
    triggerBreakdown,
    backendConnected,
    navigate,
    activeDatasetDay,
    loadDemoPlant,
  } = usePlant();

  const [showSimMenu, setShowSimMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="bg-white border-b border-[#D9DDE2] px-4 py-2 flex items-center justify-between gap-3 text-xs shadow-2xs relative z-30 shrink-0">
      {/* Left: Brand & Plant ID */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => navigate('start')}
          id="topbar-home-btn"
          className="flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer"
          title="Return to Home Dashboard"
        >
          <div className="w-7 h-7 rounded-md bg-[#0F5FA8] flex items-center justify-center text-white font-bold text-sm shadow-2xs">
            T
          </div>
          <span className="font-bold text-sm tracking-tight text-[#1B1F24]">TEEVRA</span>
        </button>

        <span className="text-[#D9DDE2]">|</span>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-[#1B1F24] whitespace-nowrap">Telangana Metal Works</span>
          <span className="text-[#D9DDE2]">|</span>
          <div className="flex items-center gap-1.5 bg-[#F4F5F7] px-2 py-1 rounded border border-[#D9DDE2]">
            <Calendar size={13} className="text-[#0F5FA8]" />
            <select
              value={activeDatasetDay}
              onChange={(e) => loadDemoPlant(e.target.value)}
              className="bg-transparent font-bold text-xs text-[#1B1F24] outline-hidden cursor-pointer"
              title="Switch Manufacturing Day"
            >
              <option value="day1_monday">Day 1: Monday (Peak Heat 33.5°C)</option>
              <option value="day2_tuesday">Day 2: Tuesday (High Solar 850 W/m²)</option>
              <option value="day3_wednesday">Day 3: Wednesday (Moderate 29.2°C)</option>
              <option value="day4_thursday">Day 4: Thursday (Staggered Shift)</option>
              <option value="day5_friday">Day 5: Friday (Expedited Deliveries)</option>
            </select>
          </div>
          <span className="text-[#5B636E] whitespace-nowrap hidden lg:inline">{weather.timeString}</span>
        </div>
      </div>

      {/* Center: Live Environmental & Constraint Indicators */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Weather Pill */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F4F5F7] border border-[#D9DDE2] text-[#1B1F24] whitespace-nowrap">
          <CloudSun size={15} className="text-[#C2410C]" />
          <span>
            Outdoor forecast <strong>{typeof weather.tempC === 'number' ? weather.tempC.toFixed(1) : weather.tempC}°C</strong>, {weather.humidity}% RH
          </span>
          <span className="text-[#5B636E]">({weather.isReplayed ? 'replayed' : 'live'} {weather.lastChecked})</span>
          <button
            onClick={stepWeatherForward}
            title="Step forecast forward to 15:00"
            className="ml-1 px-1.5 py-0.5 rounded bg-white hover:bg-slate-100 border border-[#D9DDE2] text-[11px] font-semibold text-[#0F5FA8] inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <RefreshCw size={11} />
            <span>Check now</span>
          </button>
        </div>

        {/* Area Heat Alert Badge */}
        {weather.isAreaAlert && <AreaAlertBadge showTelugu={false} />}

        {/* Notifications Check */}
        <button
          onClick={() => setNotificationsEnabled(!notificationsEnabled)}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
            notificationsEnabled
              ? 'bg-emerald-50 text-[#1E7A46] border-emerald-200'
              : 'bg-red-50 text-[#B42318] border-red-200'
          }`}
          title="FCM Web Push Status: Active Service Worker"
        >
          <Bell size={12} />
          <span>{notificationsEnabled ? 'Notifications on' : 'Notifications off'}</span>
        </button>
      </div>

      {/* Right: Quick Demo Scenarios & Actions */}
      <div className="flex items-center gap-2">
        {/* Scenario Injection Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSimMenu(!showSimMenu)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[#C2410C] font-semibold text-xs transition-colors"
          >
            <SlidersHorizontal size={13} />
            <span>Simulate Scenario</span>
            <ChevronDown size={12} />
          </button>

          {showSimMenu && (
            <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-[#D9DDE2] py-1.5 z-40 text-xs">
              <div className="px-3 py-1 font-bold text-[#5B636E] uppercase tracking-wider text-[10px]">
                Demo Triggers
              </div>
              <button
                onClick={() => {
                  triggerHeatRise();
                  setShowSimMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[#F4F5F7] flex items-center justify-between text-[#1B1F24]"
              >
                <span>1. Heat Rise & Check (Feature 6)</span>
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded">Paint</span>
              </button>
              <button
                onClick={() => {
                  triggerSos();
                  setShowSimMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[#F4F5F7] flex items-center justify-between text-[#B42318]"
              >
                <span>2. Emergency SOS Hold (No AI)</span>
                <span className="text-[10px] bg-red-100 text-red-800 px-1 rounded">Suresh</span>
              </button>
              <button
                onClick={() => {
                  triggerBreakdown('st_cnc_2');
                  setShowSimMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[#F4F5F7] flex items-center justify-between text-[#1B1F24]"
              >
                <span>3. Machine Breakdown</span>
                <span className="text-[10px] bg-slate-100 text-slate-800 px-1 rounded">CNC 2</span>
              </button>
            </div>
          )}
        </div>

        {/* Dual View Toggle */}
        <button
          onClick={() => setJudgeSideBySide(!judgeSideBySide)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
            judgeSideBySide
              ? 'bg-[#0F5FA8] text-white border-[#0F5FA8]'
              : 'bg-white hover:bg-[#F4F5F7] text-[#0F5FA8] border-[#0F5FA8]/40'
          }`}
          title="Show Planner Console side-by-side with Worker Station Tablet"
        >
          <Tablet size={14} />
          <span>{judgeSideBySide ? 'Single View' : 'Side-by-Side'}</span>
        </button>

        {/* New Plan Wizard Button */}
        <button
          onClick={() => setMorningSetupOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#0F5FA8] hover:bg-[#0D4F8C] text-white font-semibold text-xs shadow-2xs transition-colors"
        >
          <PlusCircle size={14} />
          <span>New plan</span>
        </button>

        {/* User Menu (Ravi) */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            id="topbar-user-menu-btn"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-[#F4F5F7] text-[#1B1F24] border border-transparent hover:border-[#D9DDE2] transition-colors cursor-pointer"
            title="Account & System Navigation"
          >
            <div className="w-5 h-5 rounded-full bg-[#0F5FA8] flex items-center justify-center text-[10px] font-bold text-white shadow-2xs">
              R
            </div>
            <span className="font-semibold text-xs">Ravi</span>
            <ChevronDown size={12} className={`text-[#5B636E] ${showUserMenu ? 'rotate-180 transition-transform' : 'transition-transform'}`} />
          </button>

          {showUserMenu && (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              
              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-lg shadow-xl border border-[#D9DDE2] py-1 z-50 text-xs divide-y divide-slate-100">
                <div className="px-3 py-2 bg-slate-50/70">
                  <div className="text-[11px] text-[#5B636E]">Signed in as</div>
                  <div className="font-bold text-[#1B1F24] flex items-center gap-1.5">
                    <span>Ravi Kumar</span>
                    <span className="bg-blue-100 text-[#0F5FA8] text-[9px] px-1 py-0.2 rounded font-semibold">Planner</span>
                  </div>
                  <div className="text-[10px] text-[#5B636E] mt-0.5">Shift 1 • Telangana Works</div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      navigate('log');
                      setShowUserMenu(false);
                    }}
                    id="menu-safety-log"
                    className="w-full text-left px-3 py-1.5 hover:bg-[#F4F5F7] flex items-center gap-2.5 cursor-pointer text-[#1B1F24]"
                  >
                    <FileText size={14} className="text-[#0F5FA8]" />
                    <span>Safety & Audit Log</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('evals');
                      setShowUserMenu(false);
                    }}
                    id="menu-evals-trust"
                    className="w-full text-left px-3 py-1.5 hover:bg-[#F4F5F7] flex items-center gap-2.5 cursor-pointer text-[#1B1F24]"
                  >
                    <ShieldCheck size={14} className="text-emerald-600" />
                    <span>Evals & Benchmarks</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('settings');
                      setShowUserMenu(false);
                    }}
                    id="menu-plant-settings"
                    className="w-full text-left px-3 py-1.5 hover:bg-[#F4F5F7] flex items-center gap-2.5 cursor-pointer text-[#1B1F24]"
                  >
                    <Settings size={14} className="text-slate-600" />
                    <span>Plant Settings</span>
                  </button>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      navigate('supervisor');
                      setShowUserMenu(false);
                    }}
                    id="menu-supervisor-mode"
                    className="w-full text-left px-3 py-1.5 hover:bg-[#F4F5F7] flex items-center gap-2.5 cursor-pointer text-[#1B1F24]"
                  >
                    <Users size={14} className="text-amber-600" />
                    <span>Supervisor Console</span>
                  </button>
                  <button
                    onClick={() => {
                      navigate('worker');
                      setShowUserMenu(false);
                    }}
                    id="menu-worker-app"
                    className="w-full text-left px-3 py-1.5 hover:bg-[#F4F5F7] flex items-center gap-2.5 cursor-pointer text-[#1B1F24]"
                  >
                    <Smartphone size={14} className="text-indigo-600" />
                    <span>Worker Mobile PWA</span>
                  </button>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      navigate('start');
                      setShowUserMenu(false);
                    }}
                    id="menu-logout"
                    className="w-full text-left px-3 py-1.5 hover:bg-red-50 flex items-center gap-2.5 cursor-pointer text-red-700"
                  >
                    <LogOut size={14} />
                    <span>Exit to Start Page</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
