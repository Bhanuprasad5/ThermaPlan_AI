import React from 'react';
import { TopBar } from './TopBar';
import { SosBand } from './SosBand';
import { AlertRail } from './AlertRail';
import { PlanCanvas } from './PlanCanvas';
import { ContextPanel } from './ContextPanel';
import { ImpactStrip } from './ImpactStrip';
import { TraceDrawer } from './TraceDrawer';
import { MorningSetupModal } from './MorningSetupModal';

export const PlannerConsole: React.FC = () => {
  return (
    <div className="h-screen w-screen flex flex-col bg-[#F4F5F7] text-[#1B1F24] overflow-hidden font-sans">
      {/* Top Bar */}
      <TopBar />

      {/* Emergency SOS Pinned Banner */}
      <SosBand />

      {/* Main 3-Column Studio Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Column: Alert Rail (300px) */}
        <AlertRail />

        {/* Center Canvas: Gantt & Stations (Flexible) */}
        <PlanCanvas />

        {/* Right Column: Context & Proposal Panel (380px) */}
        <ContextPanel />
      </div>

      {/* Bottom Impact & Telemetry Strip */}
      <ImpactStrip />

      {/* Full 5-Column Audit Trace Drawer [T] */}
      <TraceDrawer />
    </div>
  );
};
