import React from 'react';
import { PlantProvider, usePlant } from './context/PlantContext';
import { StartPage } from './components/start/StartPage';
import { PlannerConsole } from './components/planner/PlannerConsole';
import { WorkerApp } from './components/worker/WorkerApp';
import { SupervisorMode } from './components/worker/SupervisorMode';
import { SafetyLog } from './components/planner/SafetyLog';
import { EvalsView } from './components/planner/EvalsView';
import { SettingsView } from './components/planner/SettingsView';
import { SideBySideJudgeView } from './components/demo/SideBySideJudgeView';
import { MorningSetupModal } from './components/planner/MorningSetupModal';

function AppContent() {
  const { currentView, setCurrentView, judgeSideBySide } = usePlant();

  if (judgeSideBySide) {
    return <SideBySideJudgeView />;
  }

  let viewComponent;
  switch (currentView) {
    case 'start':
      viewComponent = <StartPage />;
      break;
    case 'planner':
      viewComponent = <PlannerConsole />;
      break;
    case 'worker':
      viewComponent = <WorkerApp />;
      break;
    case 'supervisor':
      viewComponent = <SupervisorMode onExit={() => setCurrentView('planner')} />;
      break;
    case 'log':
      viewComponent = <SafetyLog />;
      break;
    case 'evals':
      viewComponent = <EvalsView />;
      break;
    case 'settings':
      viewComponent = <SettingsView />;
      break;
    default:
      viewComponent = <StartPage />;
  }

  return (
    <>
      {viewComponent}
      <MorningSetupModal />
    </>
  );
}

export default function App() {
  return (
    <PlantProvider>
      <AppContent />
    </PlantProvider>
  );
}
