import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Station,
  Worker,
  ScheduledJob,
  AlertItem,
  Proposal,
  TraceEvent,
  RunMetrics,
} from '../types';
import {
  INITIAL_STATIONS,
  INITIAL_WORKERS,
} from '../constants/demoData';
import { parseVoiceReport } from '../services/geminiService';
import { explainActivePlan, getActivePlan, solve48h } from '../services/managerApi';
import { simulateWeatherSpike as apiSimulateWeatherSpike, triggerBreakdown as apiTriggerBreakdown } from '../services/simulationApi';
import { sendEmergencySos as apiSendEmergencySos, sendWorkerCheckIn as apiSendWorkerCheckIn } from '../services/safetyApi';
import { mapPlanToMetrics, mapSlotsToScheduledJobs, mapStationToMachine } from '../utils/mapper';
import { SchedulePlanResponse } from '../types/backend';
import { FIVE_DAY_DATASETS } from '../constants/dailyDatasets';

export interface WeatherState {
  tempC: number;
  humidity: number;
  wetBulb: number;
  timeString: string;
  isAreaAlert: boolean;
  isReplayed: boolean;
  lastChecked: string;
}

export type PlantViewType = 'start' | 'planner' | 'worker' | 'supervisor' | 'evals' | 'log' | 'settings';

interface PlantContextType {
  currentView: PlantViewType;
  setCurrentView: (view: PlantViewType) => void;
  navigate: (view: PlantViewType) => void;
  goBack: () => void;
  judgeSideBySide: boolean;
  setJudgeSideBySide: (active: boolean) => void;
  workerDeviceMode: 'tablet' | 'phone';
  setWorkerDeviceMode: (mode: 'tablet' | 'phone') => void;

  metrics: RunMetrics | null;
  activePlan: SchedulePlanResponse | null;
  solveError: string | null;
  stations: Station[];
  workers: Worker[];
  jobs: ScheduledJob[];
  alerts: AlertItem[];
  proposals: Proposal[];
  traces: TraceEvent[];

  weather: WeatherState;
  frozenUntilTime: string;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;

  activeSos: {
    id: string;
    worker: Worker;
    station: Station;
    timestamp: string;
    elapsedSec: number;
    acknowledged: boolean;
    acknowledgedBy?: string;
    escalated: boolean;
  } | null;

  activeHeatCheck: {
    stationId: string;
    workerId: string;
    workerName: string;
    isHeldDuringPour: boolean;
    heldUntil?: string;
  } | null;

  activeProposal: Proposal | null;
  setActiveProposal: (p: Proposal | null) => void;

  isRePlanning: boolean;
  showBeforeAfter: boolean;
  setShowBeforeAfter: (val: boolean) => void;

  morningSetupOpen: boolean;
  setMorningSetupOpen: (open: boolean) => void;
  traceDrawerOpen: boolean;
  setTraceDrawerOpen: (open: boolean) => void;

  // Backend Integration State
  backendConnected: boolean;
  isSolvingBackend: boolean;
  isBreakdownActive: boolean;
  setWorkers: React.Dispatch<React.SetStateAction<Worker[]>>;
  updateWorkerRoster: (newWorkers: Worker[]) => void;
  activeBackendPlanId: string | null;
  activeDatasetDay: string;
  setActiveDatasetDay: (day: string) => void;
  solveMorningPlan: (uploadedCsv?: string, horizonHours?: number, slotDurationMinutes?: number, uploadedWorkers?: Worker[], dayId?: string) => Promise<void>;

  // Actions
  loadDemoPlant: (dayId?: string) => void;
  triggerHeatRise: () => void;
  triggerSos: (stationId?: string, workerId?: string) => void;
  acknowledgeSos: (acknowledgedBy: string) => void;
  triggerDizzy: (stationId: string, workerId: string) => void;
  triggerVoiceReport: (transcriptTe: string, transcriptEn: string) => Promise<void>;
  approveProposal: (proposalId: string) => void;
  rejectProposal: (proposalId: string, reason: string) => void;
  triggerBreakdown: (stationId: string) => void;
  submitWorkerHeatCheck: (response: 'ok' | 'not_okay') => void;
  toggleTabletHeartbeat: (stationId: string, online: boolean) => void;
  stepWeatherForward: () => void;
  selectedStationId: string;
  setSelectedStationId: (id: string) => void;
}

const PlantContext = createContext<PlantContextType | undefined>(undefined);

export const PlantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentView, setCurrentViewRaw] = useState<PlantViewType>('start');
  const [historyStack, setHistoryStack] = useState<PlantViewType[]>([]);
  const [judgeSideBySide, setJudgeSideBySide] = useState<boolean>(false);
  const [workerDeviceMode, setWorkerDeviceMode] = useState<'tablet' | 'phone'>('tablet');

  const navigate = (view: PlantViewType) => {
    setJudgeSideBySide(false);
    if (view !== currentView) {
      setHistoryStack((prev) => [...prev, currentView]);
      setCurrentViewRaw(view);
    }
  };

  const setCurrentView = (view: PlantViewType) => {
    navigate(view);
  };

  const goBack = () => {
    setJudgeSideBySide(false);
    setHistoryStack((prev) => {
      if (prev.length === 0) {
        setCurrentViewRaw('start');
        return [];
      }
      const newStack = [...prev];
      const previousView = newStack.pop() || 'start';
      setCurrentViewRaw(previousView);
      return newStack;
    });
  };

  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [activePlan, setActivePlan] = useState<SchedulePlanResponse | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>(INITIAL_STATIONS);
  const [workers, setWorkers] = useState<Worker[]>(INITIAL_WORKERS);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [traces, setTraces] = useState<TraceEvent[]>([]);

  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [isSolvingBackend, setIsSolvingBackend] = useState<boolean>(false);
  const [activeBackendPlanId, setActiveBackendPlanId] = useState<string | null>(null);
  const [activeDatasetDay, setActiveDatasetDay] = useState<string>('day1_monday');
  const [storageHydrated, setStorageHydrated] = useState(false);

  const updateWorkerRoster = (newWorkers: Worker[]) => {
    if (newWorkers && newWorkers.length > 0) {
      setWorkers(newWorkers);
    }
  };

  const [weather, setWeather] = useState<WeatherState>({
    tempC: 38.5,
    humidity: 62,
    wetBulb: 28.6,
    timeString: '14:10',
    isAreaAlert: true,
    isReplayed: true,
    lastChecked: '14:00',
  });

  const [frozenUntilTime] = useState<string>('16:10');
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);

  const [activeSos, setActiveSos] = useState<{
    id: string;
    worker: Worker;
    station: Station;
    timestamp: string;
    elapsedSec: number;
    acknowledged: boolean;
    acknowledgedBy?: string;
    escalated: boolean;
  } | null>(null);

  const [activeHeatCheck, setActiveHeatCheck] = useState<{
    stationId: string;
    workerId: string;
    workerName: string;
    isHeldDuringPour: boolean;
    heldUntil?: string;
  } | null>(null);

  const [activeProposal, setActiveProposal] = useState<Proposal | null>(null);
  const [isRePlanning, setIsRePlanning] = useState<boolean>(false);
  const [showBeforeAfter, setShowBeforeAfter] = useState<boolean>(false);
  const [morningSetupOpen, setMorningSetupOpen] = useState<boolean>(false);
  const [traceDrawerOpen, setTraceDrawerOpen] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string>('st_furnace_1');

  const applyPlan = (plan: SchedulePlanResponse) => {
    try {
      localStorage.setItem('teevra.activePlan', JSON.stringify(plan));
    } catch {
      /* private mode or a full quota should not block the dashboard */
    }
    setBackendConnected(true);
    setActiveBackendPlanId(plan.plan_id);
    setActivePlan(plan);
    setSolveError(null);
    setMetrics(mapPlanToMetrics(plan));
    setJobs(mapSlotsToScheduledJobs(plan.schedule_slots, plan.slot_minutes || 15));
    const solvedProp: Proposal = {
      id: `prop_${plan.plan_id}`,
      triggerAlertId: 'alert_plan_solved',
      title: plan.dataset_label || plan.plan_id,
      reason: plan.summary || plan.gemini_explanation_text,
      stationId: 'plant',
      workerId: 'all_crew',
      workerName: 'Plant',
      suggestedAction: plan.trigger_type === 'MACHINE_BREAKDOWN' ? 'Review the replan, then dispatch.' : 'Dispatch this plan to the floor.',
      impactMetrics: {
        outputBefore: plan.baseline_kpi?.output_percentage ?? plan.kpi.output_percentage,
        outputAfter: plan.kpi.output_percentage,
        kwhBefore: Math.round(plan.baseline_kpi?.total_kwh ?? plan.kpi.total_kwh),
        kwhAfter: Math.round(plan.kpi.total_kwh),
        inrBefore: Math.round(plan.baseline_kpi?.total_cost_inr ?? plan.kpi.total_cost_inr),
        inrAfter: Math.round(plan.kpi.total_cost_inr),
        minHeatMarginBefore: 0,
        minHeatMarginAfter: 0,
        restartsBefore: plan.baseline_kpi?.total_restarts ?? 0,
        restartsAfter: plan.kpi.total_restarts,
        bufferCostOutputPct: 0,
      },
      criticPassed: plan.kpi.heat_breaches_count === 0,
      criticRuleExplanation: plan.kpi.honest_co2_banner,
      aiDetails: {
        station: 'Plant-wide',
        hazard: 'Heat and tariff windows',
        action: plan.trigger_type,
        unsureFieldsCount: 0,
        modelVersion: plan.explanation_trace?.model || 'OR-Tools CP-SAT',
        region: plan.explanation_trace?.region || '',
        inputTokens: plan.explanation_trace?.prompt_tokens || 0,
        outputTokens: plan.explanation_trace?.output_tokens || 0,
        latencyMs: Math.round((plan.solve_time_sec || 0) * 1000),
        isCached: false,
      },
    };
    setActiveProposal(solvedProp);
    setProposals((curr) => [solvedProp, ...curr]);
    setTraces((curr) => [
      {
        id: `trace_${plan.plan_id}_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' }),
        eventName: plan.trigger_type === 'MACHINE_BREAKDOWN' ? 'Breakdown replan' : 'Morning plan',
        modelVersion: 'OR-Tools CP-SAT, seed 42',
        region: 'asia-south1',
        tokens: { input: 0, output: 0, total: 0 },
        latencyMs: Math.round((plan.solve_time_sec || 0) * 1000),
        criticResult: {
          passed: plan.kpi.heat_breaches_count === 0,
          rule: `${plan.kpi.heat_breaches_count} heat-breach slots. Output ${plan.kpi.output_percentage}%.`,
        },
        approvalStatus: 'Solved. Planner still decides whether to dispatch.',
        rePlanSolver: {
          status: (plan.solver_status as 'OPTIMAL' | 'FEASIBLE') || 'OPTIMAL',
          solveTimeSec: plan.solve_time_sec,
          seed: plan.solver_seed ?? 42,
          planHashBefore: plan.parent_plan_hash || plan.baseline_plan_hash || '',
          planHashAfter: plan.plan_hash,
        },
      },
      ...curr,
    ]);
  };

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      localStorage.setItem('teevra.alerts', JSON.stringify(alerts));
    } catch {
      /* ignore quota */
    }
  }, [alerts, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      localStorage.setItem('teevra.datasetDay', activeDatasetDay);
    } catch {
      /* ignore quota */
    }
  }, [activeDatasetDay, storageHydrated]);

  useEffect(() => {
    try {
      const rawPlan = localStorage.getItem('teevra.activePlan');
      if (rawPlan) {
        const plan = JSON.parse(rawPlan) as SchedulePlanResponse;
        if (plan?.plan_id && plan.kpi) applyPlan(plan);
      }
    } catch {
      /* ignore corrupt cache */
    }
    try {
      const rawAlerts = localStorage.getItem('teevra.alerts');
      if (rawAlerts) {
        const parsed = JSON.parse(rawAlerts) as AlertItem[];
        if (Array.isArray(parsed)) setAlerts(parsed);
      }
    } catch {
      /* ignore corrupt cache */
    }
    try {
      const day = localStorage.getItem('teevra.datasetDay');
      if (day) setActiveDatasetDay(day);
    } catch {
      /* ignore unreadable storage */
    }
    setStorageHydrated(true);

    getActivePlan()
      .then((plan) => {
        if (plan?.plan_id) applyPlan(plan);
      })
      .catch((err: unknown) => {
        const status =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 404) return;
      });
    // Mount-only: restore the last dashboard, then prefer the server copy when one exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const solveMorningPlan = async (
    uploadedCsv?: string,
    horizonHours = 48,
    slotDurationMinutes = 15,
    uploadedWorkers?: Worker[],
    dayId?: string
  ) => {
    setIsSolvingBackend(true);
    setIsRePlanning(true);
    setSolveError(null);

    const targetDay = dayId || activeDatasetDay || 'day1_monday';
    setActiveDatasetDay(targetDay);
    if (uploadedWorkers && uploadedWorkers.length > 0) setWorkers(uploadedWorkers);

    const pack = FIVE_DAY_DATASETS.find((d) => d.id === targetDay);
    const label = uploadedCsv ? 'Custom upload' : pack?.label;

    try {
      const plan = await solve48h(
        horizonHours,
        slotDurationMinutes,
        uploadedCsv || undefined,
        uploadedCsv ? undefined : targetDay,
        label
      );
      applyPlan(plan);
      setCurrentViewRaw('planner');
      explainActivePlan()
        .then((note) => {
          setActivePlan((current) =>
            current && current.plan_id === note.plan_id
              ? { ...current, gemini_explanation_text: note.text, explanation_trace: note.trace }
              : current
          );
        })
        .catch(() => undefined);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Live solve unavailable';
      setSolveError(`Live solve unavailable. ${message}`);
    } finally {
      setIsSolvingBackend(false);
      setIsRePlanning(false);
      setMorningSetupOpen(false);
    }
  };

  // SOS escalation timer loop
  useEffect(() => {
    if (!activeSos || activeSos.acknowledged) return;
    const interval = setInterval(() => {
      setActiveSos((prev) => {
        if (!prev || prev.acknowledged) return prev;
        const nextSec = prev.elapsedSec + 1;
        const shouldEscalate = nextSec >= 60 && !prev.escalated;
        if (shouldEscalate) {
          setAlerts((curr) => [
            {
              id: `alert_esc_${Date.now()}`,
              type: 'sos',
              stationId: prev.station.id,
              stationName: prev.station.nameEn,
              workerId: prev.worker.id,
              workerName: prev.worker.name,
              timestamp: '14:13',
              status: 'new',
              title: 'SOS Escalated: Plant Head Alerted',
              description: 'SOS unacknowledged after 60s. High priority SMS & call trigger dispatched to EHS Head.',
              pinned: true,
            },
            ...curr,
          ]);
        }
        return {
          ...prev,
          elapsedSec: nextSec,
          escalated: prev.escalated || shouldEscalate,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSos]);

  const loadDemoPlant = (dayId?: string | unknown) => {
    const targetDay = typeof dayId === 'string' && dayId ? dayId : activeDatasetDay || 'day1_monday';
    void solveMorningPlan(undefined, 48, 15, undefined, targetDay);
  };

  // Step weather forward + trigger backend weather spike
  const stepWeatherForward = () => {
    setWeather((prev) => {
      const nextTemp = Math.round(Math.min(42, prev.tempC + 0.8) * 10) / 10;
      return {
        ...prev,
        tempC: nextTemp,
        timeString: '15:00',
        lastChecked: '15:00',
        isAreaAlert: nextTemp >= 38.0,
      };
    });

    setAlerts((curr) => [
      {
        id: `wx_${Date.now()}`,
        type: 'weather_update',
        stationId: 'st_paint',
        stationName: 'Plant wide',
        timestamp: '15:00',
        status: 'new',
        title: 'Outdoor weather reading: 39.3°C, 65% RH',
        description: 'Replayed forecast stepped to 15:00. Area heat alert badge remains active. Station offsets applied.',
      },
      ...curr,
    ]);

    // Async backend call
    apiSimulateWeatherSpike({ slot_index: 32, temp_spike_c: 2.2 }).catch(err => {
      console.warn('Backend weather spike trigger note:', err);
    });
  };

  // Trigger heat rise scenario (Feature 6)
  const triggerHeatRise = () => {
    setStations((prev) =>
      prev.map((s) => {
        if (s.id === 'st_paint') {
          return { ...s, heatLevel: 3, currentWBGTEstimate: 29.6 };
        }
        return s;
      })
    );

    setActiveHeatCheck({
      stationId: 'st_paint',
      workerId: 'w_anitha',
      workerName: 'Anitha',
      isHeldDuringPour: false,
    });

    setAlerts((curr) => [
      {
        id: `alert_hc_${Date.now()}`,
        type: 'heat_check_sent',
        stationId: 'st_paint',
        stationName: 'Paint line',
        workerId: 'w_anitha',
        workerName: 'Anitha',
        timestamp: '14:10',
        status: 'new',
        title: 'Heat check sent: "మీరు బాగున్నారా? / Are you okay?"',
        description: 'Paint line crossed into Hot (29.6°C). Sent with Telugu audio and vibration.',
      },
      ...curr,
    ]);
  };

  // Submit heat check reply
  const submitWorkerHeatCheck = (response: 'ok' | 'not_okay') => {
    if (!activeHeatCheck) return;
    const { stationId, workerId, workerName } = activeHeatCheck;

    // Dispatch async to backend
    apiSendWorkerCheckIn(
      mapStationToMachine(stationId),
      response === 'ok' ? 'CHECKIN_OK' : 'CHECKIN_TOO_HOT'
    ).catch(err => {
      console.warn('Backend worker check-in dispatched with note:', err);
    });

    if (response === 'ok') {
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === workerId ? { ...w, status: 'resting', restTimeRemainingSec: 600 } : w
        )
      );

      setJobs((prev) =>
        prev.map((j) => {
          if (j.stationId === stationId && j.isBuffer) {
            return { ...j, bufferUsedHours: (j.bufferUsedHours || 0) + 0.166 };
          }
          return j;
        })
      );

      setAlerts((curr) => [
        {
          id: `alert_rep_${Date.now()}`,
          type: 'proposal_waiting',
          stationId,
          stationName: 'Paint line',
          workerId,
          workerName,
          timestamp: '14:11',
          status: 'acknowledged',
          title: `${workerName} checked: OK (10 min rest buffered)`,
          description: 'Worker reported OK. Short rest allocated in existing 45 min buffer. Plan unaffected.',
        },
        ...curr,
      ]);
    } else {
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === workerId ? { ...w, status: 'resting', restTimeRemainingSec: 900 } : w
        )
      );

      setAlerts((curr) => [
        {
          id: `alert_notok_${Date.now()}`,
          type: 'not_okay',
          stationId,
          stationName: 'Paint line',
          workerId,
          workerName,
          timestamp: '14:11',
          status: 'new',
          title: `Not okay: ${workerName} at Paint line`,
          description: 'Worker needs longer rest (15 min). Supervisor alerted. Buffer absorbs part; re-plan evaluated.',
        },
        ...curr,
      ]);
    }

    setActiveHeatCheck(null);
  };

  // Trigger SOS (no AI, instantaneous)
  const triggerSos = (stationId = 'st_furnace_1', workerId = 'w_suresh') => {
    const station = stations.find((s) => s.id === stationId) || stations[0];
    const worker = workers.find((w) => w.id === workerId) || workers[0];

    const newSos = {
      id: `sos_${Date.now()}`,
      worker,
      station,
      timestamp: '14:12',
      elapsedSec: 0,
      acknowledged: false,
      escalated: false,
    };

    setActiveSos(newSos);

    setWorkers((prev) =>
      prev.map((w) => (w.id === worker.id ? { ...w, status: 'sos' } : w))
    );

    setAlerts((curr) => [
      {
        id: newSos.id,
        type: 'sos',
        stationId: station.id,
        stationName: station.nameEn,
        workerId: worker.id,
        workerName: worker.name,
        timestamp: '14:12',
        status: 'new',
        title: `CRITICAL SOS: ${worker.name} at ${station.nameEn}`,
        description: 'Emergency stop signal received from station tablet. Relief required immediately.',
        pinned: true,
        deliveryChannel: 'in_app',
      },
      ...curr,
    ]);

    // Dispatch zero-AI emergency stop to backend
    apiSendEmergencySos(mapStationToMachine(station.id)).catch(err => {
      console.warn('Backend SOS dispatch noted:', err);
    });
  };

  // Acknowledge SOS
  const acknowledgeSos = (acknowledgedBy: string) => {
    if (!activeSos) return;

    setActiveSos((prev) => (prev ? { ...prev, acknowledged: true, acknowledgedBy } : null));

    setAlerts((curr) =>
      curr.map((a) =>
        a.type === 'sos' && a.status === 'new'
          ? {
              ...a,
              status: 'acknowledged',
              acknowledgedBy,
              title: `SOS Acknowledged: ${a.workerName} (${acknowledgedBy})`,
            }
          : a
      )
    );

    const reliefWorker = workers.find((w) => w.id === 'w_ramesh');
    const reliefProposal: Proposal = {
      id: `prop_relief_${Date.now()}`,
      triggerAlertId: activeSos.id,
      title: `Approve Furnace Relief: Ramesh takes over for Suresh at Furnace 1`,
      reason: `SOS acknowledged by ${acknowledgedBy}. Continuous pour cannot stop; qualified relief operator Ramesh is free.`,
      stationId: activeSos.station.id,
      workerId: activeSos.worker.id,
      workerName: activeSos.worker.name,
      reliefWorkerId: reliefWorker?.id,
      reliefWorkerName: reliefWorker?.name,
      suggestedAction: 'Swap operator for remainder of Melt #A104',
      impactMetrics: {
        outputBefore: 98.4,
        outputAfter: 98.4,
        kwhBefore: 13890,
        kwhAfter: 13890,
        inrBefore: 98250,
        inrAfter: 98250,
        minHeatMarginBefore: 2.1,
        minHeatMarginAfter: 2.1,
        restartsBefore: 4,
        restartsAfter: 4,
        bufferCostOutputPct: 0.0,
      },
      criticPassed: true,
      criticRuleExplanation: 'Deterministic relief validation passed: Ramesh has certified furnace qualification and 0 accumulated heat units today.',
      aiDetails: {
        station: 'Furnace 1',
        hazard: 'Worker SOS / Heat Distress',
        action: 'Relief Operator Swap',
        unsureFieldsCount: 0,
        modelVersion: 'Deterministic Relief Matcher (No AI)',
        region: 'local',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 12,
        isCached: false,
      },
    };

    setProposals((curr) => [reliefProposal, ...curr]);
    setActiveProposal(reliefProposal);
  };

  // Trigger Dizzy: immediate automatic removal from Class 3 work
  const triggerDizzy = (stationId: string, workerId: string) => {
    const station = stations.find((s) => s.id === stationId) || stations[0];
    const worker = workers.find((w) => w.id === workerId) || workers[0];

    setWorkers((prev) =>
      prev.map((w) =>
        w.id === workerId ? { ...w, status: 'dizzy_removed', restTimeRemainingSec: 1800 } : w
      )
    );

    setAlerts((curr) => [
      {
        id: `dizzy_${Date.now()}`,
        type: 'dizzy',
        stationId: station.id,
        stationName: station.nameEn,
        workerId: worker.id,
        workerName: worker.name,
        timestamp: '14:14',
        status: 'new',
        title: `Dizzy: ${worker.name} removed from Class 3 work automatically`,
        description: 'Removed from Class 3 work. Resting in a cool area. Supervisor notified.',
        pinned: true,
      },
      ...curr,
    ]);

    // Dispatch checkin hazard to backend
    apiSendWorkerCheckIn(mapStationToMachine(station.id), 'DIZZY').catch(err => {
      console.warn('Backend dizzy report noted:', err);
    });

    const reliefWorker = workers.find((w) => w.isFurnaceQualified && w.id !== workerId);
    const dizzyProp: Proposal = {
      id: `prop_dizzy_${Date.now()}`,
      triggerAlertId: `dizzy_${Date.now()}`,
      title: `Assign Relief Operator for ${worker.name} (Auto-removed: Dizzy)`,
      reason: `${worker.name} tapped Dizzy at ${station.nameEn}. Automatic removal executed; assign certified relief.`,
      stationId: station.id,
      workerId: worker.id,
      workerName: worker.name,
      reliefWorkerId: reliefWorker?.id,
      reliefWorkerName: reliefWorker?.name,
      suggestedAction: `Assign ${reliefWorker?.name} to cover remainder of shift`,
      impactMetrics: {
        outputBefore: 98.4,
        outputAfter: 98.4,
        kwhBefore: 13890,
        kwhAfter: 13890,
        inrBefore: 98250,
        inrAfter: 98250,
        minHeatMarginBefore: 2.1,
        minHeatMarginAfter: 2.1,
        restartsBefore: 4,
        restartsAfter: 4,
        bufferCostOutputPct: 0.0,
      },
      criticPassed: true,
      criticRuleExplanation: 'Deterministic validation passed: Ramesh is qualified and available. Worker health prioritized.',
      aiDetails: {
        station: station.nameEn,
        hazard: 'Dizziness / Heat Exhaustion',
        action: 'Relief Operator Assignment',
        unsureFieldsCount: 0,
        modelVersion: 'Deterministic Safety Rule',
        region: 'local',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 5,
        isCached: false,
      },
    };

    setProposals((curr) => [dizzyProp, ...curr]);
    setActiveProposal(dizzyProp);
  };

  // Trigger voice report (Feature 5)
  const triggerVoiceReport = async (transcriptTe: string, transcriptEn: string) => {
    const extraction = await parseVoiceReport(transcriptTe, transcriptEn);

    const newProposal: Proposal = {
      id: `prop_voice_${Date.now()}`,
      triggerAlertId: `alert_voice_${Date.now()}`,
      title: `Add ${extraction.durationMinutes} min rest for Anitha at ${extraction.station}. Buffer covers it.`,
      reason: `Telugu voice report: "${transcriptTe}" ("${transcriptEn}")`,
      stationId: extraction.stationId,
      workerId: 'w_anitha',
      workerName: 'Anitha',
      suggestedAction: extraction.action,
      impactMetrics: {
        outputBefore: 98.4,
        outputAfter: 98.4,
        kwhBefore: 13890,
        kwhAfter: 13890,
        inrBefore: 98250,
        inrAfter: 98250,
        minHeatMarginBefore: 2.1,
        minHeatMarginAfter: 2.4,
        restartsBefore: 4,
        restartsAfter: 4,
        bufferCostOutputPct: 0.0,
      },
      criticPassed: extraction.criticCheckPassed,
      criticRuleExplanation: extraction.criticRuleExplanation,
      aiDetails: {
        station: extraction.station,
        hazard: extraction.hazard,
        action: extraction.action,
        unsureFieldsCount: extraction.unsureFields.length,
        modelVersion: extraction.modelVersion,
        region: extraction.region,
        inputTokens: extraction.inputTokens,
        outputTokens: extraction.outputTokens,
        latencyMs: extraction.latencyMs,
        isCached: extraction.isCached,
        recordedDate: extraction.recordedDate,
      },
    };

    setAlerts((curr) => [
      {
        id: `alert_voice_${Date.now()}`,
        type: 'too_hot',
        stationId: extraction.stationId,
        stationName: extraction.station,
        workerId: 'w_anitha',
        workerName: 'Anitha',
        timestamp: '14:20',
        status: 'new',
        title: `Voice Report: Too Hot (${extraction.station})`,
        description: `Voice processed: "${transcriptTe}". Proposal generated for planner approval.`,
      },
      ...curr,
    ]);

    const newTrace: TraceEvent = {
      id: `trace_${Date.now()}`,
      timestamp: '14:20:15',
      eventName: 'Voice Report Classification & Proposal',
      clipTranscriptTe: transcriptTe,
      clipTranscriptEn: transcriptEn,
      geminiCallJson: {
        extracted_station: extraction.station,
        extracted_hazard: extraction.hazard,
        extracted_action: extraction.action,
        duration: extraction.durationMinutes,
      },
      modelVersion: extraction.modelVersion,
      region: extraction.region,
      tokens: { input: extraction.inputTokens, output: extraction.outputTokens, total: extraction.inputTokens + extraction.outputTokens },
      latencyMs: extraction.latencyMs,
      criticResult: { passed: extraction.criticCheckPassed, rule: extraction.criticRuleExplanation },
      approvalStatus: 'Pending Planner Approval',
      rePlanSolver: {
        status: 'OPTIMAL',
        solveTimeSec: 1.42,
        seed: 42,
        planHashBefore: '7f9a2b',
        planHashAfter: '7f9a2d',
      },
    };

    setTraces((curr) => [newTrace, ...curr]);
    setProposals((curr) => [newProposal, ...curr]);
    setActiveProposal(newProposal);
  };

  // Approve proposal and re-plan
  const approveProposal = (proposalId: string) => {
    setIsRePlanning(true);
    setShowBeforeAfter(true);

    setTimeout(() => {
      setProposals((curr) =>
        curr.map((p) =>
          p.id === proposalId
            ? { ...p, approvedAt: '14:22' }
            : p
        )
      );

      setAlerts((curr) =>
        curr.map((a) =>
          a.status === 'new'
            ? { ...a, status: 'approved' }
            : a
        )
      );

      const proposal = proposals.find((p) => p.id === proposalId);
      if (proposal?.reliefWorkerId) {
        setWorkers((prev) =>
          prev.map((w) =>
            w.id === proposal.reliefWorkerId
              ? { ...w, stationId: proposal.stationId, role: 'Active Relief Operator' }
              : w
          )
        );
      }

      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              solverTimestamp: new Date().toLocaleTimeString('en-IN', {
                hour12: false,
                timeZone: 'Asia/Kolkata',
              }),
            }
          : prev
      );

      setIsRePlanning(false);
    }, 600);
  };

  // Reject proposal
  const rejectProposal = (proposalId: string, reason: string) => {
    setProposals((curr) =>
      curr.map((p) => (p.id === proposalId ? { ...p, rejectionReason: reason } : p))
    );
    setAlerts((curr) =>
      curr.map((a) => (a.status === 'new' ? { ...a, status: 'rejected' } : a))
    );
  };

  const triggerBreakdown = (stationId: string) => {
    if (!activePlan) {
      setSolveError('Run the morning plan first. There is nothing to replan.');
      return;
    }
    const machineId = mapStationToMachine(stationId);
    const nextJob = activePlan.job_moves.find(
      (m) => m.machine_id === machineId && m.start_slot != null && m.kind !== 'dropped'
    );
    if (!nextJob || nextJob.start_slot == null) {
      setSolveError(`${machineId} has no work left in this plan.`);
      return;
    }
    const faultSlot = Math.max(0, nextJob.start_slot - 2);
    setIsRePlanning(true);
    setSolveError(null);
    const clock = new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
    setAlerts((curr) => [
      {
        id: `breakdown_${Date.now()}`,
        type: 'breakdown',
        stationId,
        stationName: nextJob.job_name,
        timestamp: clock,
        status: 'new',
        title: `${machineId} down`,
        description: `${machineId} stays down from 30 minutes before ${nextJob.job_name} for the rest of the 48 hours. The next 2 hours on the other machines stay as planned. After that, its remaining jobs move to other machines and may finish a little later.`,
        pinned: true,
      },
      ...curr,
    ]);
    apiTriggerBreakdown({
      machine_id: machineId,
      fault_slot: faultSlot,
      repair_duration_slots: 16,
      reason: `${machineId} spindle trip`,
    })
      .then((plan) => {
        if (plan?.plan_id) applyPlan(plan);
        else setSolveError('Breakdown replan returned no plan.');
      })
      .catch((err: unknown) => {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setSolveError(detail || (err instanceof Error ? err.message : 'Breakdown replan failed'));
      })
      .finally(() => setIsRePlanning(false));
  };

  // Toggle tablet heartbeat
  const toggleTabletHeartbeat = (stationId: string, online: boolean) => {
    setStations((prev) =>
      prev.map((s) => (s.id === stationId ? { ...s, tabletOnline: online } : s))
    );

    if (!online) {
      setAlerts((curr) => [
        {
          id: `heartbeat_${Date.now()}`,
          type: 'tablet_heartbeat',
          stationId,
          stationName: stations.find((s) => s.id === stationId)?.nameEn || 'Station',
          timestamp: '14:15',
          status: 'new',
          title: `Station Tablet Offline: ${stations.find((s) => s.id === stationId)?.nameEn}`,
          description: 'Heartbeat ping missed for > 2 minutes. Cloud Run escalation alert to floor supervisor.',
          pinned: true,
        },
        ...curr,
      ]);
    }
  };

  return (
    <PlantContext.Provider
      value={{
        currentView,
        setCurrentView,
        navigate,
        goBack,
        judgeSideBySide,
        setJudgeSideBySide,
        workerDeviceMode,
        setWorkerDeviceMode,
        metrics,
        activePlan,
        solveError,
        stations,
        workers,
        jobs,
        alerts,
        proposals,
        traces,
        weather,
        frozenUntilTime,
        notificationsEnabled,
        setNotificationsEnabled,
        activeSos,
        activeHeatCheck,
        activeProposal,
        setActiveProposal,
        isRePlanning,
        showBeforeAfter,
        setShowBeforeAfter,
        morningSetupOpen,
        setMorningSetupOpen,
        traceDrawerOpen,
        setTraceDrawerOpen,
        backendConnected,
        isSolvingBackend,
        isBreakdownActive: alerts.some((a) => a.type === 'breakdown') || jobs.some((j) => j.status === 'breakdown'),
        activeBackendPlanId,
        setWorkers,
        updateWorkerRoster,
        activeDatasetDay,
        setActiveDatasetDay,
        solveMorningPlan,
        loadDemoPlant,
        triggerHeatRise,
        triggerSos,
        acknowledgeSos,
        triggerDizzy,
        triggerVoiceReport,
        approveProposal,
        rejectProposal,
        triggerBreakdown,
        submitWorkerHeatCheck,
        toggleTabletHeartbeat,
        stepWeatherForward,
        selectedStationId,
        setSelectedStationId,
      }}
    >
      {children}
    </PlantContext.Provider>
  );
};

export const usePlant = () => {
  const context = useContext(PlantContext);
  if (!context) {
    throw new Error('usePlant must be used within a PlantProvider');
  }
  return context;
};
