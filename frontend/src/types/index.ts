export type HeatLevel = 1 | 2 | 3 | 4;

export interface HeatLevelInfo {
  level: HeatLevel;
  color: string;
  wordEn: string;
  wordTe: string;
  meaning: string;
}

export const HEAT_LEVELS: Record<HeatLevel, HeatLevelInfo> = {
  1: {
    level: 1,
    color: '#D9DDE2',
    wordEn: 'Normal',
    wordTe: 'సాధారణం',
    meaning: 'Well below limit',
  },
  2: {
    level: 2,
    color: '#F5B841',
    wordEn: 'Watch',
    wordTe: 'జాగ్రత్త',
    meaning: 'Approaching threshold',
  },
  3: {
    level: 3,
    color: '#C2410C',
    wordEn: 'Hot',
    wordTe: 'వేడి ఎక్కువ',
    meaning: 'Close to ISO limit',
  },
  4: {
    level: 4,
    color: '#B42318',
    wordEn: 'Stop',
    wordTe: 'ఆపండి',
    meaning: 'At or above limit',
  },
};

export type AlertType =
  | 'sos'
  | 'dizzy'
  | 'stop_level'
  | 'breakdown'
  | 'not_okay'
  | 'no_reply'
  | 'too_hot'
  | 'hazard'
  | 'held_check'
  | 'proposal_waiting'
  | 'heat_check_sent'
  | 'weather_update'
  | 'tablet_heartbeat';

export type AlertStatus =
  | 'new'
  | 'seen'
  | 'acknowledged'
  | 'approved'
  | 'rejected'
  | 'resolved'
  | 'held';

export interface AlertItem {
  id: string;
  type: AlertType;
  stationId: string;
  stationName: string;
  workerId?: string;
  workerName?: string;
  timestamp: string; // e.g. "14:12"
  status: AlertStatus;
  title: string;
  description: string;
  acknowledgedBy?: string; // e.g. "Lakshmi on floor, 14:13"
  heldUntil?: string; // e.g. "14:40 (pour end)"
  deliveryChannel?: 'push' | 'in_app' | 'sms';
  pinned?: boolean;
}

export interface Worker {
  id: string;
  name: string;
  phone: string;
  stationId: string;
  role: string;
  isFurnaceQualified: boolean;
  status: 'working' | 'resting' | 'dizzy_removed' | 'sos';
  restTimeRemainingSec: number;
  hasConsented: boolean;
  consentType: 'buttons_only' | 'voice_enabled' | 'withdrawn';
  consentDate: string;
}

export interface Station {
  id: string;
  nameEn: string;
  nameTe: string;
  group: 'furnace' | 'paint' | 'automated' | 'cnc';
  heatLevel: HeatLevel;
  currentWBGTEstimate: number; // e.g. 30.2
  measuredWBGT?: number;
  offsetC: number; // e.g. +3.5
  metabolicClass: 'light' | 'moderate' | 'heavy' | 'very_heavy';
  isAcclimatized: boolean;
  activePour: boolean; // if true, heat checks are held until pour finishes
  pourEndTime?: string; // e.g. "14:40"
  tabletOnline: boolean;
  lastHeartbeat: string;
}

export interface ScheduledJob {
  id: string;
  stationId: string;
  name: string;
  startHour: number; // e.g. 13.5 = 13:30
  durationHours: number; // e.g. 1.5
  heatClass: number; // 1-4
  isPourStep?: boolean;
  isBuffer?: boolean;
  bufferUsedHours?: number;
  status: 'scheduled' | 'running' | 'completed' | 'moved' | 'breakdown';
  reasonMoved?: string;
  citations?: string[];
}

export interface Proposal {
  id: string;
  triggerAlertId: string;
  title: string;
  reason: string;
  stationId: string;
  workerId?: string;
  workerName?: string;
  suggestedAction: string;
  reliefWorkerId?: string;
  reliefWorkerName?: string;
  impactMetrics: {
    outputBefore: number;
    outputAfter: number;
    kwhBefore: number;
    kwhAfter: number;
    inrBefore: number;
    inrAfter: number;
    minHeatMarginBefore: number;
    minHeatMarginAfter: number;
    restartsBefore: number;
    restartsAfter: number;
    bufferCostOutputPct: number;
  };
  criticPassed: boolean;
  criticRuleExplanation: string;
  aiDetails: {
    station: string;
    hazard: string;
    action: string;
    unsureFieldsCount: number;
    modelVersion: string;
    region: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    isCached: boolean;
    recordedDate?: string;
  };
  approvedAt?: string;
  rejectionReason?: string;
}

export interface TraceEvent {
  id: string;
  timestamp: string;
  eventName: string;
  clipAudioUrl?: string;
  clipTranscriptTe?: string;
  clipTranscriptEn?: string;
  geminiCallJson?: any;
  modelVersion: string;
  region: string;
  tokens: { input: number; output: number; total: number };
  latencyMs: number;
  criticResult: { passed: boolean; rule: string };
  approvalStatus: string;
  rePlanSolver: {
    status: 'OPTIMAL' | 'FEASIBLE';
    solveTimeSec: number;
    seed: number;
    planHashBefore: string;
    planHashAfter: string;
  };
}

export interface RunMetrics {
  heatBreachesBefore: number;
  heatBreachesAfter: number;
  outputPct: number;
  outputPctBefore: number;
  energyKwhBefore: number;
  energyKwhAfter: number;
  inrCostBefore: number;
  inrCostAfter: number;
  minMarginC: number;
  restartsCount: number;
  bufferCostPct: number;
  co2SavedTons: number;
  solverSeed: number;
  planHash: string;
  solverTimestamp: string;
}
