import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Flame,
  Thermometer,
  Wrench,
  Clock,
  CheckCircle,
  FileText,
  WifiOff,
  CloudSun,
  User,
  Filter,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { AlertItem, AlertType } from '../../types';

// Strict fixed severity order defined in code
const SEVERITY_ORDER: Record<AlertType, number> = {
  sos: 1,
  dizzy: 2,
  stop_level: 3,
  breakdown: 4,
  not_okay: 5,
  no_reply: 6,
  too_hot: 7,
  hazard: 8,
  held_check: 9,
  proposal_waiting: 10,
  heat_check_sent: 11,
  weather_update: 12,
  tablet_heartbeat: 13,
};

export const AlertRail: React.FC = () => {
  const { alerts, activeProposal, setActiveProposal, proposals, setSelectedStationId } = usePlant();
  const [activeFilter, setActiveFilter] = useState<'all' | 'needs_me' | 'safety' | 'plan' | 'system'>('all');

  // Sort by pinned first, then strict severity order
  const sortedAlerts = [...alerts].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (SEVERITY_ORDER[a.type] || 99) - (SEVERITY_ORDER[b.type] || 99);
  });

  const filteredAlerts = sortedAlerts.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'needs_me') return item.status === 'new' || item.type === 'sos' || item.type === 'proposal_waiting';
    if (activeFilter === 'safety') return ['sos', 'dizzy', 'stop_level', 'not_okay', 'no_reply', 'too_hot', 'hazard', 'held_check'].includes(item.type);
    if (activeFilter === 'plan') return ['proposal_waiting', 'breakdown', 'heat_check_sent'].includes(item.type);
    if (activeFilter === 'system') return ['weather_update', 'tablet_heartbeat'].includes(item.type);
    return true;
  });

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case 'sos':
        return <AlertOctagon size={16} className="text-[#B42318] shrink-0" />;
      case 'dizzy':
        return <AlertTriangle size={16} className="text-[#B42318] shrink-0" />;
      case 'stop_level':
        return <Flame size={16} className="text-[#B42318] shrink-0" />;
      case 'breakdown':
        return <Wrench size={16} className="text-[#C2410C] shrink-0" />;
      case 'not_okay':
      case 'no_reply':
        return <User size={16} className="text-[#C2410C] shrink-0" />;
      case 'too_hot':
        return <Thermometer size={16} className="text-[#C2410C] shrink-0" />;
      case 'held_check':
        return <Clock size={16} className="text-[#F5B841] shrink-0" />;
      case 'proposal_waiting':
        return <FileText size={16} className="text-[#0F5FA8] shrink-0" />;
      case 'tablet_heartbeat':
        return <WifiOff size={16} className="text-[#B42318] shrink-0" />;
      case 'weather_update':
      default:
        return <CloudSun size={16} className="text-[#5B636E] shrink-0" />;
    }
  };

  const getStatusBadge = (status: AlertItem['status'], heldUntil?: string) => {
    switch (status) {
      case 'new':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-[#B42318]">New</span>;
      case 'acknowledged':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-[#1E7A46]">Ack</span>;
      case 'approved':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-[#0F5FA8]">Approved</span>;
      case 'held':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-[#7A4100]">Held {heldUntil || ''}</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-[#5B636E]">Logged</span>;
    }
  };

  const handleAlertClick = (item: AlertItem) => {
    setSelectedStationId(item.stationId);
    // Find matching proposal if exists
    const matchingProp = proposals.find((p) => p.triggerAlertId === item.id || p.stationId === item.stationId);
    if (matchingProp) {
      setActiveProposal(matchingProp);
    }
  };

  return (
    <aside
      aria-label="Alert feed and system notifications"
      className="w-full lg:w-[300px] shrink-0 border-r border-[#D9DDE2] bg-white flex flex-col h-full overflow-hidden"
    >
      {/* Header & Filter Row */}
      <div className="p-3 border-b border-[#D9DDE2] space-y-2 bg-[#F4F5F7]/40">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wider text-[#1B1F24] flex items-center gap-1.5">
            <span>Alert Rail</span>
            <span className="text-[11px] font-mono text-[#5B636E]">({alerts.length})</span>
          </span>
          <span className="text-[10px] text-[#5B636E]">Severity Order</span>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {(['all', 'needs_me', 'safety', 'plan', 'system'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-colors capitalize ${
                activeFilter === tab
                  ? 'bg-[#0F5FA8] text-white'
                  : 'bg-white hover:bg-slate-100 text-[#5B636E] border border-[#D9DDE2]'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Alert Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#D9DDE2]">
        {filteredAlerts.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#5B636E]">
            <CheckCircle size={24} className="mx-auto mb-2 text-[#1E7A46]" />
            <p>No active alerts matching filter.</p>
            <p className="text-[11px] mt-1 text-[#5B636E]">Next weather check at 15:00.</p>
          </div>
        ) : (
          filteredAlerts.map((item) => {
            const isUnackSos = (item.type === 'sos' || item.type === 'dizzy') && item.status === 'new';

            return (
              <div
                key={item.id}
                onClick={() => handleAlertClick(item)}
                className={`p-3 text-xs cursor-pointer transition-colors relative hover:bg-[#F4F5F7] ${
                  isUnackSos ? 'bg-red-50/70 border-l-4 border-l-[#B42318]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {getAlertIcon(item.type)}
                    <span className="font-semibold text-[#1B1F24] truncate">
                      {item.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#5B636E] shrink-0">
                    {item.timestamp}
                  </span>
                </div>

                <p className="text-[11px] text-[#5B636E] line-clamp-2 mb-2 leading-relaxed">
                  {item.description}
                </p>

                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#1B1F24] font-medium bg-[#F4F5F7] px-1.5 py-0.5 rounded border border-[#D9DDE2]/60">
                    {item.stationName}
                  </span>
                  {getStatusBadge(item.status, item.heldUntil)}
                </div>

                {item.acknowledgedBy && (
                  <div className="text-[10px] text-[#1E7A46] mt-1.5 font-medium">
                    ✓ {item.acknowledgedBy}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Rail Footer Telemetry Status */}
      <div className="p-2 border-t border-[#D9DDE2] bg-[#F4F5F7] text-[10px] text-[#5B636E] flex items-center justify-between">
        <span>Station tablets report here</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#1E7A46]" title="Heartbeat Normal"></span>
      </div>
    </aside>
  );
};
