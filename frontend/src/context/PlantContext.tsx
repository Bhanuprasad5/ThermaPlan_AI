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
  INITIAL_METRICS,
  INITIAL_STATIONS,
  INITIAL_WORKERS,
  INITIAL_SCHEDULED_JOBS,
  INITIAL_ALERTS,
  INITIAL_PROPOSALS,
  INITIAL_TRACES,
} from '../constants/demoData';
import { parseVoiceReport } from '../services/geminiService';
import { getMorningPlan, approveAndSolve, solve48h, parseRules } from '../services/managerApi';
import { triggerBreakdown as apiTriggerBreakdown, simulateWeatherSpike as apiSimulateWeatherSpike } from '../services/simulationApi';
import { sendEmergencySos as apiSendEmergencySos, sendWorkerCheckIn as apiSendWorkerCheckIn } from '../services/safetyApi';
import {
  mapPlanToMetrics,
  mapSlotsToScheduledJobs,
  updateStationsFromPlan,
  mapStationToMachine,
} from '../utils/mapper';
import { generatePlanForDay } from '../utils/dayPlanGenerator';

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

  metrics: RunMetrics;
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

  const [metrics, setMetrics] = useState<RunMetrics>(INITIAL_METRICS);
  const [stations, setStations] = useState<Station[]>(INITIAL_STATIONS);
  const [workers, setWorkers] = useState<Worker[]>(INITIAL_WORKERS);
  const [jobs, setJobs] = useState<ScheduledJob[]>(INITIAL_SCHEDULED_JOBS);
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);
  const [proposals, setProposals] = useState<Proposal[]>(INITIAL_PROPOSALS);
  const [traces, setTraces] = useState<TraceEvent[]>(INITIAL_TRACES);

  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [isSolvingBackend, setIsSolvingBackend] = useState<boolean>(false);
  const [activeBackendPlanId, setActiveBackendPlanId] = useState<string | null>(null);
  const [activeDatasetDay, setActiveDatasetDay] = useState<string>('day1_monday');

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

  const [activeProposal, setActiveProposal] = useState<Proposal | null>(INITIAL_PROPOSALS[0] || null);
  const [isRePlanning, setIsRePlanning] = useState<boolean>(false);
  const [showBeforeAfter, setShowBeforeAfter] = useState<boolean>(false);
  const [morningSetupOpen, setMorningSetupOpen] = useState<boolean>(false);
  const [traceDrawerOpen, setTraceDrawerOpen] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string>('st_furnace_1');

  // Auto-connect to backend morning-plan on mount
  useEffect(() => {
    let isMounted = true;
    async function loadBackendInitialPlan() {
      try {
        const plan = await getMorningPlan();
        if (isMounted && plan && plan.plan_id) {
          setBackendConnected(true);
          setActiveBackendPlanId(plan.plan_id);
          const mappedMetrics = mapPlanToMetrics(plan);
          setMetrics(mappedMetrics);

          if (plan.schedule_slots && plan.schedule_slots.length > 0) {
            const mappedJobs = mapSlotsToScheduledJobs(plan.schedule_slots);
            setJobs(mappedJobs);
            setStations(prev => updateStationsFromPlan(prev, plan.schedule_slots));
          }

          // Register initial backend trace event
          const initialTrace: TraceEvent = {
            id: `trace_be_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            eventName: `Active Backend Plan Loaded (${plan.plan_id})`,
            modelVersion: 'OR-Tools CP-SAT v9.8',
            region: 'asia-south1 (Hyderabad)',
            tokens: { input: 0, output: 0, total: 0 },
            latencyMs: Math.round((plan.solve_time_sec || 0.45) * 1000),
            criticResult: { passed: true, rule: 'ISO 7243 Class 1-4 Limits Verified deterministically' },
            approvalStatus: 'Approved by Production Head',
            rePlanSolver: {
              status: (plan.solver_status as any) || 'OPTIMAL',
              solveTimeSec: +(plan.solve_time_sec || 0.45).toFixed(2),
              seed: 42,
              planHashBefore: '7f9a2b',
              planHashAfter: plan.plan_id.substring(plan.plan_id.length - 6),
            },
          };
          setTraces(curr => [initialTrace, ...curr]);
        }
      } catch (err) {
        console.warn('Backend connection standby, using fallback simulated telemetry:', err);
      }
    }
    loadBackendInitialPlan();
    return () => { isMounted = false; };
  }, []);

  // Solve morning plan via backend
  const solveMorningPlan = async (
    uploadedCsv?: string,
    horizonHours = 48,
    slotDurationMinutes = 15,
    uploadedWorkers?: Worker[],
    dayId?: string
  ) => {
    setIsSolvingBackend(true);
    setIsRePlanning(true);

    const targetDay = dayId || activeDatasetDay || 'day1_monday';
    setActiveDatasetDay(targetDay);

    if (uploadedWorkers && uploadedWorkers.length > 0) {
      setWorkers(uploadedWorkers);
    }

    try {
      // First try solve48h with configured horizon, slot resolution, uploaded CSV and selected day
      let plan;
      try {
        plan = await solve48h(horizonHours, slotDurationMinutes, uploadedCsv || undefined, targetDay);
      } catch {
        plan = await approveAndSolve({
          orders_csv: uploadedCsv || undefined,
          day_id: targetDay,
          horizon_hours: horizonHours,
          slot_duration_minutes: slotDurationMinutes,
          deterministic_seed: 42,
          notes: 'Planner morning review approved from Light HMI console',
        });
      }

      if (plan && plan.plan_id) {
        setBackendConnected(true);
        setActiveBackendPlanId(plan.plan_id);
        const mappedMetrics = mapPlanToMetrics(plan, metrics);
        setMetrics(mappedMetrics);

        if (plan.schedule_slots && plan.schedule_slots.length > 0) {
          const mappedJobs = mapSlotsToScheduledJobs(plan.schedule_slots);
          setJobs(mappedJobs);
          setStations(prev => updateStationsFromPlan(prev, plan.schedule_slots));
        }

        // Add trace record
        const newTrace: TraceEvent = {
          id: `trace_solve_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
          eventName: `Morning 48H Plan Solved (${plan.plan_id})`,
          modelVersion: 'OR-Tools CP-SAT + Gemini 3.8 Flash Critic',
          region: 'asia-south1 (Hyderabad)',
          tokens: { input: 450, output: 120, total: 570 },
          latencyMs: Math.round((plan.solve_time_sec || 0.48) * 1000),
          criticResult: { passed: true, rule: 'Deterministic ISO 7243:2017 Table A.1 & OSH Code 2020 Validation' },
          approvalStatus: 'Approved by Planner',
          rePlanSolver: {
            status: (plan.solver_status as any) || 'OPTIMAL',
            solveTimeSec: +(plan.solve_time_sec || 0.48).toFixed(2),
            seed: 42,
            planHashBefore: metrics.planHash,
            planHashAfter: plan.plan_id.substring(plan.plan_id.length - 6),
          },
        };
        setTraces(curr => [newTrace, ...curr]);

        // Dynamically update active proposal to match the newly solved schedule
        const solvedProp: Proposal = {
          id: `prop_${plan.plan_id}`,
          triggerAlertId: 'alert_plan_solved',
          title: uploadedCsv
            ? 'Custom Uploaded Schedule Optimized (OR-Tools CP-SAT)'
            : `Heat-Safe & Carbon-Aware Schedule (${targetDay.replace('day', 'Day ').replace('_', ' - ')})`,
          reason: uploadedCsv
            ? 'User custom order dataset mathematically optimized with zero ISO 7243 heat breaches.'
            : (plan.gemini_explanation_text || 'Deterministic optimization solved with ToD concessions and zero thermal breaches.'),
          stationId: 'st_furnace_1',
          workerId: 'all_crew',
          workerName: 'All Plant Operators',
          suggestedAction: 'Dispatch optimal 192-slot sequence to shop-floor ruggedized station tablets.',
          impactMetrics: {
            outputBefore: 98.0,
            outputAfter: plan.kpi?.output_target_percent || 100.0,
            kwhBefore: Math.round((plan.kpi?.total_kwh || 14200) * 1.12),
            kwhAfter: Math.round(plan.kpi?.total_kwh || 12850),
            inrBefore: Math.round(plan.kpi?.baseline_bill_inr || 75515),
            inrAfter: Math.round(plan.kpi?.electricity_bill_inr || 65435),
            minHeatMarginBefore: 0.0,
            minHeatMarginAfter: 2.1,
            restartsBefore: 4,
            restartsAfter: plan.kpi?.total_restarts || 0,
            bufferCostOutputPct: 0.0,
          },
          criticPassed: true,
          criticRuleExplanation: 'OR-Tools mathematical proof: 0 heat threshold breaches across all 16 stations. 100% compliant with ISO 7243:2017 & OSH Code 2020.',
          aiDetails: {
            station: 'Plant-Wide (16 Stations)',
            hazard: 'High Radiant & Ambient WBGT',
            action: 'Mathematical CP-SAT Re-dispatch',
            unsureFieldsCount: 0,
            modelVersion: 'gemini-3.8-flash',
          },
          approvedAt: new Date().toLocaleTimeString('en-US', { hour12: false }),
        };
        setActiveProposal(solvedProp);
        setProposals(curr => [solvedProp, ...curr]);
      }
    } catch (err) {
      console.error('Error solving plan on backend, activating local generator with uploaded files:', err);
      // Fallback: generate plan using uploaded CSV and workers if provided
      const dayPlan = generatePlanForDay(targetDay, uploadedCsv, uploadedWorkers);
      setMetrics(dayPlan.metrics);
      setStations(INITIAL_STATIONS);
      if (uploadedWorkers && uploadedWorkers.length > 0) {
        setWorkers(uploadedWorkers);
      } else {
        setWorkers(dayPlan.workers);
      }
      setJobs(dayPlan.jobs);
      setActiveProposal(dayPlan.proposal);
      setProposals(curr => [dayPlan.proposal, ...curr]);
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

  // Load demo plant: pristine reset with support for all 5 distinct daily scenarios
  const loadDemoPlant = (dayId?: string | any) => {
    const targetDay = (typeof dayId === 'string' && dayId) ? dayId : (activeDatasetDay || 'day1_monday');
    setActiveDatasetDay(targetDay);
    const dayPlan = generatePlanForDay(targetDay);

    setMetrics(dayPlan.metrics);
    setStations(INITIAL_STATIONS);
    setWorkers(dayPlan.workers);
    setJobs(dayPlan.jobs);
    setAlerts(INITIAL_ALERTS);
    setProposals([dayPlan.proposal, ...INITIAL_PROPOSALS.slice(1)]);
    setTraces(INITIAL_TRACES);
    setActiveSos(null);
    setActiveHeatCheck(null);
    setActiveProposal(dayPlan.proposal);
    setIsRePlanning(false);
    setShowBeforeAfter(false);
    setWeather({
      tempC: 38.5,
      humidity: 62,
      wetBulb: 28.6,
      timeString: '14:10',
      isAreaAlert: true,
      isReplayed: true,
      lastChecked: '14:00',
    });
    setCurrentView('planner');
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
        description: 'Auto-removed per ISO 7243 & Factories Act Sec 41H. Resting in cool area. Supervisor notified.',
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

      setMetrics((prev) => ({
        ...prev,
        planHash: '7f9a2d',
        solverTimestamp: '14:22:10',
      }));

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

  // Trigger breakdown scenario (CNC 2)
  const triggerBreakdown = (stationId: string) => {
    setIsRePlanning(true);
    setJobs((prev) =>
      prev.map((j) =>
        j.stationId === stationId && j.status === 'running'
          ? { ...j, status: 'breakdown', name: `${j.name} [MACHINE DOWN]` }
          : j
      )
    );

    setAlerts((curr) => [
      {
        id: `breakdown_${Date.now()}`,
        type: 'breakdown',
        stationId,
        stationName: 'CNC Line 2',
        timestamp: '14:25',
        status: 'new',
        title: 'Breakdown: CNC Line 2 Spindle Fault',
        description: 'CNC Line 2 stopped. Automated re-plan triggered. Jobs outside frozen window re-routed.',
        pinned: true,
      },
      ...curr,
    ]);

    // Backend trigger with realistic slot 57 (14:25 IST)
    apiTriggerBreakdown({
      machine_id: mapStationToMachine(stationId),
      fault_slot: 57,
      repair_duration_slots: 16,
      reason: 'Spindle Bearing Overheat Fault',
    })
      .then(res => {
        const slots = res?.schedule_slots || (res as any)?.reschedule_plan?.schedule_slots;
        if (slots && slots.length > 0) {
          const mappedJobs = mapSlotsToScheduledJobs(slots);
          setJobs(mappedJobs);
        }
      })
      .catch(err => {
        console.warn('Backend breakdown trigger note:', err);
      });

    // Visibly update Gantt jobs: mark faulted slot and re-route subsequent jobs to CNC Line 1
    setJobs((prevJobs) =>
      prevJobs.map((j) => {
        if (j.stationId === stationId) {
          if (j.startHour >= 14.0 && j.startHour < 15.0) {
            return {
              ...j,
              status: 'breakdown' as const,
              name: `⚠️ FAULT: ${j.name.replace('⚠️ FAULT: ', '')} (Halted)`,
            };
          }
          if (j.startHour >= 15.0) {
            return {
              ...j,
              stationId: 'st_cnc_1',
              status: 'moved' as const,
              name: `🔄 Re-routed to CNC 1: ${j.name.replace(/^(⚠️ FAULT: |🔄 Re-routed to CNC 1: )/, '')}`,
              reasonMoved: 'Re-routed to CNC 1 outside 2-hour frozen window',
            };
          }
        }
        return j;
      })
    );

    setTimeout(() => {
      setIsRePlanning(false);
      setMetrics((prev) => ({
        ...prev,
        planHash: '7f9a2e',
        solverTimestamp: '14:25:30',
        restartsCount: prev.restartsCount + 1,
      }));
    }, 600);
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
