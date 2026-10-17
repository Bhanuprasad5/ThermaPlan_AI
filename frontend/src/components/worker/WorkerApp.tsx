import React, { useState, useEffect } from 'react';
import {
  Thermometer,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Volume2,
  Mic,
  AlertOctagon,
  CheckCircle2,
  X,
  Phone,
  ArrowLeft,
  Clock,
  RotateCcw,
  User,
  Smartphone,
  Tablet,
  Check,
  Info,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { HeatBadge } from '../common/HeatBadge';
import { SupervisorMode } from './SupervisorMode';

export const WorkerApp: React.FC = () => {
  const {
    stations,
    workers,
    activeHeatCheck,
    submitWorkerHeatCheck,
    triggerSos,
    triggerDizzy,
    triggerVoiceReport,
    workerDeviceMode,
    setWorkerDeviceMode,
    setCurrentView,
    goBack,
  } = usePlant();

  // Internal worker screens: 'consent' | 'home' | 'heat_check' | 'rest_timer' | 'voice' | 'hazard' | 'sos_sent' | 'supervisor'
  const [screen, setScreen] = useState<'consent' | 'home' | 'heat_check' | 'rest_timer' | 'voice' | 'hazard' | 'sos_sent' | 'supervisor'>('home');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('w_anitha');
  const [selectedStationId, setSelectedStationId] = useState<string>('st_paint');
  const [sosProgress, setSosProgress] = useState<number>(0);
  const [sosHolding, setSosHolding] = useState<boolean>(false);
  const [voiceRecording, setVoiceRecording] = useState<boolean>(false);
  const [voiceElapsedSec, setVoiceElapsedSec] = useState<number>(0);
  const [voiceSent, setVoiceSent] = useState<boolean>(false);
  const [restRemainingSec, setRestRemainingSec] = useState<number>(600); // 10 min
  const [sosStatusStep, setSosStatusStep] = useState<number>(1);
  const [sosCancelRemaining, setSosCancelRemaining] = useState<number>(10);
  const [audioPlaying, setAudioPlaying] = useState<boolean>(false);

  const currentStation = stations.find((s) => s.id === selectedStationId) || stations[2];
  const stationWorkers = workers.filter((w) => w.stationId === selectedStationId);
  const currentWorker = workers.find((w) => w.id === selectedWorkerId) || workers[1];

  // If heat check fires for this station, switch to heat check
  useEffect(() => {
    if (activeHeatCheck && activeHeatCheck.stationId === selectedStationId && !activeHeatCheck.isHeldDuringPour) {
      setScreen('heat_check');
    }
  }, [activeHeatCheck, selectedStationId]);

  // SOS 1-second press and hold handler
  useEffect(() => {
    let timer: any;
    if (sosHolding) {
      timer = setInterval(() => {
        setSosProgress((prev) => {
          if (prev >= 100) {
            clearInterval(timer);
            setSosHolding(false);
            setSosProgress(0);
            triggerSos(selectedStationId, selectedWorkerId);
            setScreen('sos_sent');
            setSosStatusStep(1);
            setSosCancelRemaining(10);
            return 100;
          }
          return prev + 10;
        });
      }, 100);
    } else {
      setSosProgress(0);
    }
    return () => clearInterval(timer);
  }, [sosHolding, selectedStationId, selectedWorkerId, triggerSos]);

  // SOS sent ladder advancement
  useEffect(() => {
    if (screen !== 'sos_sent') return;
    const interval = setInterval(() => {
      setSosStatusStep((prev) => Math.min(4, prev + 1));
      setSosCancelRemaining((prev) => Math.max(0, prev - 1));
    }, 2000);
    return () => clearInterval(interval);
  }, [screen]);

  // Rest timer countdown
  useEffect(() => {
    if (screen !== 'rest_timer') return;
    const interval = setInterval(() => {
      setRestRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [screen]);

  // Voice recording simulation
  useEffect(() => {
    if (!voiceRecording) return;
    const interval = setInterval(() => {
      setVoiceElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [voiceRecording]);

  const playTeluguSpeech = (text: string) => {
    setAudioPlaying(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'te-IN';
      utterance.rate = 0.9;
      utterance.onend = () => setAudioPlaying(false);
      utterance.onerror = () => setAudioPlaying(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setAudioPlaying(false), 2500);
    }
  };

  const handleSendVoiceReport = async () => {
    setVoiceRecording(false);
    setVoiceSent(true);
    const te = 'పెయింట్ లైన్ వద్ద చాలా వేడిగా ఉంది, 10 నిమిషాలు రెస్ట్ కావాలి';
    const en = 'Paint line is too hot, need a 10 minute rest';
    await triggerVoiceReport(te, en);
    setTimeout(() => {
      setVoiceSent(false);
      setScreen('home');
    }, 2000);
  };

  if (screen === 'supervisor') {
    return <SupervisorMode onExit={() => setScreen('home')} />;
  }

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1B1F24] flex flex-col font-sans select-none">
      {/* Station / Device Bar */}
      <div className="bg-[#1B1F24] text-white px-4 py-2.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            id="workerapp-back-btn"
            className="hover:underline flex items-center gap-1 text-slate-300 cursor-pointer"
            title="Go back"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
          <span className="text-slate-600">|</span>
          <span className="font-semibold">{currentStation.nameEn}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch Station Selector for demo convenience */}
          <select
            value={selectedStationId}
            onChange={(e) => setSelectedStationId(e.target.value)}
            className="bg-slate-800 text-white text-[11px] px-2 py-1 rounded border border-slate-700"
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameEn}
              </option>
            ))}
          </select>

          {/* Device toggle */}
          <button
            onClick={() => setWorkerDeviceMode(workerDeviceMode === 'tablet' ? 'phone' : 'tablet')}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-white"
            title={`Switch to ${workerDeviceMode === 'tablet' ? 'Phone' : 'Station Tablet'} view`}
          >
            {workerDeviceMode === 'tablet' ? <Smartphone size={14} /> : <Tablet size={14} />}
          </button>

          {/* Supervisor floor mode switch */}
          <button
            onClick={() => setScreen('supervisor')}
            className="px-2 py-1 rounded bg-[#0F5FA8] hover:bg-[#0D4F8C] text-white font-semibold text-[11px]"
          >
            Supervisor Mode
          </button>
        </div>
      </div>

      {/* Main Container: Styled as Station Tablet (portrait) or Mobile Phone */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-6">
        <div
          className={`w-full bg-white rounded-2xl shadow-xl border border-[#D9DDE2] overflow-hidden flex flex-col transition-all ${
            workerDeviceMode === 'tablet'
              ? 'max-w-md min-h-[720px]'
              : 'max-w-xs min-h-[640px]'
          }`}
        >
          {/* C0. Consent Screen */}
          {screen === 'consent' && (
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-center mb-4">
                  <h2 className="font-telugu text-2xl font-bold text-[#1B1F24]">
                    సమ్మతి & గోప్యత
                  </h2>
                  <p className="text-sm font-semibold text-[#5B636E]">Consent & Privacy Terms</p>
                </div>

                <div className="space-y-3 text-xs text-[#1B1F24] leading-relaxed bg-[#F4F5F7] p-4 rounded-xl border border-[#D9DDE2]">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-[#1E7A46] shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-telugu text-sm">నివేదించినందుకు జరిమానా ఉండదు.</strong>
                      <p className="text-[#5B636E]">No penalty for reporting heat or taking safety rests.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-[#1E7A46] shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-telugu text-sm">వేడి & ప్రమాద నివేదికలు అనామకంగా ఉంటాయి.</strong>
                      <p className="text-[#5B636E]">Too hot and hazard reports show only station, not your name.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-[#1E7A46] shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-telugu text-sm">SOS మరియు తలతిరగడం సహాయం కోసం పేరు చూపిస్తాయి.</strong>
                      <p className="text-[#5B636E]">SOS, Dizzy, and Not okay identify you so help can reach you.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-[#0F5FA8] shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-telugu text-sm">వాయిస్ డేటా గూగుల్ ద్వారా ప్రాసెస్ చేయబడుతుంది.</strong>
                      <p className="text-[#5B636E]">Buttons only is default. Voice recordings processed outside India.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => setScreen('home')}
                  className="w-full h-14 rounded-xl bg-[#0F5FA8] text-white font-bold text-base shadow-sm flex flex-col items-center justify-center"
                >
                  <span className="font-telugu text-lg leading-tight">అంగీకరిస్తున్నాను (బటన్లు మాత్రమే)</span>
                  <span className="text-xs font-normal opacity-90">Agree, buttons only (Default)</span>
                </button>

                <button
                  onClick={() => setScreen('home')}
                  className="w-full h-12 rounded-xl bg-[#F4F5F7] hover:bg-slate-200 text-[#1B1F24] font-semibold text-xs border border-[#D9DDE2]"
                >
                  Agree and turn on voice
                </button>
              </div>
            </div>
          )}

          {/* C1. Station Home */}
          {screen === 'home' && (
            <div className="flex-1 flex flex-col p-4 sm:p-5 justify-between space-y-3">
              {/* Station Header */}
              <div className="border-b border-[#D9DDE2] pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#1B1F24] leading-tight">
                      {currentStation.nameEn}
                    </h1>
                    <div className="font-telugu text-base text-[#5B636E] font-medium">
                      {currentStation.nameTe}
                    </div>
                  </div>

                  <button
                    onClick={() => setScreen('consent')}
                    className="p-1.5 text-xs text-[#0F5FA8] hover:bg-blue-50 rounded"
                    title="Consent & privacy terms"
                  >
                    <Info size={16} />
                  </button>
                </div>

                {/* Heat Indicator Bar */}
                <div className="mt-2 flex items-center justify-between">
                  <HeatBadge level={currentStation.heatLevel} size="md" />
                  <span className="text-[11px] font-mono text-[#5B636E]">
                    {currentStation.currentWBGTEstimate}°C est.
                  </span>
                </div>
                <div className="text-[10px] text-[#5B636E] mt-1">
                  Screening estimate, not a WBGT measurement
                </div>

                {/* On-shift Worker Chips (for shared station tablet) */}
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-[#5B636E]">Worker:</span>
                  {stationWorkers.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setSelectedWorkerId(w.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                        selectedWorkerId === w.id
                          ? 'bg-[#0F5FA8] text-white shadow-2xs'
                          : 'bg-[#F4F5F7] text-[#1B1F24] border border-[#D9DDE2]'
                      }`}
                    >
                      {w.name.split(' ')[0]}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedWorkerId('')}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                      selectedWorkerId === ''
                        ? 'bg-[#0F5FA8] text-white'
                        : 'bg-[#F4F5F7] text-[#5B636E]'
                    }`}
                  >
                    Someone else
                  </button>
                </div>
              </div>

              {/* 5 Giant Touch Buttons (at least 72px tall per WCAG glove specs) */}
              <div className="space-y-2.5 flex-1 flex flex-col justify-center">
                {/* 1. OK Button */}
                <button
                  onClick={() => {
                    playTeluguSpeech('మీ సమాచారం అందింది. ధన్యవాదాలు.');
                    alert('Check-in logged: I am OK.');
                  }}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-white hover:bg-emerald-50 active:bg-emerald-100 text-[#1E7A46] border-2 border-emerald-300 font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className="font-telugu text-xl sm:text-2xl leading-none mb-1">
                      నేను బాగున్నాను
                    </div>
                    <div className="text-xs sm:text-sm font-semibold opacity-90">OK • I am fine</div>
                  </div>
                  <CheckCircle2 size={32} className="text-[#1E7A46] shrink-0" />
                </button>

                {/* 2. Too Hot Button */}
                <button
                  onClick={() => {
                    playTeluguSpeech('చాలా వేడిగా ఉందని నమోదైంది. 10 నిమిషాలు విశ్రాంతి తీసుకోండి.');
                    setScreen('rest_timer');
                  }}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-white hover:bg-orange-50 active:bg-orange-100 text-[#C2410C] border-2 border-orange-300 font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className="font-telugu text-xl sm:text-2xl leading-none mb-1">
                      చాలా వేడిగా ఉంది
                    </div>
                    <div className="text-xs sm:text-sm font-semibold opacity-90">Too hot • Request rest</div>
                  </div>
                  <Flame size={32} className="text-[#C2410C] shrink-0" />
                </button>

                {/* 3. Dizzy Button (Immediate Auto-Removal!) */}
                <button
                  onClick={() => {
                    triggerDizzy(selectedStationId, selectedWorkerId || 'w_anitha');
                    playTeluguSpeech('తల తిరుగుతోంది. దయచేసి నీడలో కూర్చోండి. సూపర్వైజర్ వస్తున్నారు.');
                    alert('Automatic safety action: You have been removed from Class 3 work. Sit down in the shade. Lakshmi is notified.');
                  }}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-white hover:bg-red-50 active:bg-red-100 text-[#B42318] border-2 border-red-300 font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className="font-telugu text-xl sm:text-2xl leading-none mb-1">
                      తల తిరుగుతోంది
                    </div>
                    <div className="text-xs sm:text-sm font-semibold opacity-90">Dizzy • Auto-remove from heat</div>
                  </div>
                  <AlertTriangle size={32} className="text-[#B42318] shrink-0" />
                </button>

                {/* 4. Hazard Picker Button */}
                <button
                  onClick={() => setScreen('hazard')}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-white hover:bg-slate-50 text-[#1B1F24] border-2 border-[#D9DDE2] font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className="font-telugu text-xl sm:text-2xl leading-none mb-1">
                      ప్రమాదం నివేదించండి
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-[#5B636E]">Hazard • Fumes, guard, slip</div>
                  </div>
                  <ShieldCheck size={30} className="text-[#5B636E] shrink-0" />
                </button>

                {/* 5. Speak / Voice Button */}
                <button
                  onClick={() => setScreen('voice')}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-[#0F5FA8]/5 hover:bg-[#0F5FA8]/10 text-[#0F5FA8] border-2 border-[#0F5FA8]/30 font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className="font-telugu text-xl sm:text-2xl leading-none mb-1">
                      మాట్లాడి చెప్పండి
                    </div>
                    <div className="text-xs sm:text-sm font-semibold opacity-90">Speak • Telugu voice report</div>
                  </div>
                  <Mic size={32} className="text-[#0F5FA8] shrink-0" />
                </button>
              </div>

              {/* 6. Emergency Hold-for-SOS (110px tall, solid red) */}
              <div className="pt-2">
                <button
                  onMouseDown={() => setSosHolding(true)}
                  onMouseUp={() => setSosHolding(false)}
                  onTouchStart={() => setSosHolding(true)}
                  onTouchEnd={() => setSosHolding(false)}
                  className="w-full h-24 sm:h-28 rounded-2xl bg-[#B42318] hover:bg-[#9B1E14] active:bg-[#83180F] text-white font-bold shadow-lg flex flex-col items-center justify-center relative overflow-hidden transition-all"
                >
                  {/* Visual 1-second filling ring / bar */}
                  <div
                    style={{ width: `${sosProgress}%` }}
                    className="absolute inset-y-0 left-0 bg-black/30 transition-all pointer-events-none"
                  />

                  <div className="relative z-10 flex items-center gap-3">
                    <AlertOctagon size={36} className="text-white animate-pulse" />
                    <div className="text-left">
                      <div className="font-telugu text-2xl font-bold leading-tight">
                        సహాయం కావాలి (SOS)
                      </div>
                      <div className="text-xs font-semibold tracking-wide uppercase opacity-90">
                        Hold 1 Second for Emergency SOS
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* C2. Heat Check: "మీరు బాగున్నారా? / Are you okay?" */}
          {screen === 'heat_check' && (
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4 bg-orange-50/50">
              <div className="space-y-3 text-center pt-4">
                <div className="w-16 h-16 rounded-full bg-orange-100 text-[#C2410C] mx-auto flex items-center justify-center">
                  <Flame size={36} className="animate-bounce" />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase font-bold tracking-wider text-[#C2410C]">
                    Heat Level Rise: Paint Line
                  </div>
                  <h2 className="font-telugu text-3xl font-bold text-[#1B1F24] leading-tight">
                    మీరు బాగున్నారా?
                  </h2>
                  <p className="text-lg font-semibold text-[#5B636E]">Are you okay?</p>
                </div>

                <p className="text-xs text-[#5B636E]">
                  Screening estimate: 29.6°C. Not a WBGT measurement.
                </p>

                <button
                  onClick={() => playTeluguSpeech('మీరు బాగున్నారా? సమాధానం ఇవ్వడానికి బటన్ నొక్కండి.')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#D9DDE2] text-xs font-semibold text-[#0F5FA8]"
                >
                  <Volume2 size={14} />
                  <span>Listen in Telugu</span>
                </button>
              </div>

              {/* Two Giant Choices */}
              <div className="space-y-3">
                <button
                  onClick={() => {
                    submitWorkerHeatCheck('ok');
                    setScreen('rest_timer');
                  }}
                  className="w-full h-20 rounded-xl bg-[#1E7A46] text-white font-bold shadow-md flex flex-col items-center justify-center"
                >
                  <span className="font-telugu text-2xl leading-none">అవును, నేను బాగున్నాను</span>
                  <span className="text-xs font-normal opacity-90">Yes, I am okay (10m buffered rest)</span>
                </button>

                <button
                  onClick={() => {
                    submitWorkerHeatCheck('not_okay');
                    setScreen('rest_timer');
                  }}
                  className="w-full h-20 rounded-xl bg-[#B42318] text-white font-bold shadow-md flex flex-col items-center justify-center"
                >
                  <span className="font-telugu text-2xl leading-none">బాగా లేదు (సహాయం కావాలి)</span>
                  <span className="text-xs font-normal opacity-90">Not okay (Request supervisor assistance)</span>
                </button>
              </div>

              <div className="text-center text-[11px] text-[#5B636E] pt-2">
                <p className="font-telugu">స్పందించకపోవడం సరే. ఎవరైనా వచ్చి చూస్తారు.</p>
                <p>No reply is okay. Someone will come and check.</p>
              </div>
            </div>
          )}

          {/* C3. Rest Timer */}
          {screen === 'rest_timer' && (
            <div className="p-6 flex-1 flex flex-col justify-between items-center text-center space-y-4">
              <div className="space-y-1">
                <h2 className="font-telugu text-2xl font-bold text-[#1B1F24]">
                  విశ్రాంతి తీసుకోండి
                </h2>
                <p className="text-sm font-semibold text-[#5B636E]">Mandatory Heat Safety Rest</p>
                <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#1E7A46] font-bold text-xs">
                  This rest is paid time (Plant Policy)
                </div>
              </div>

              {/* Circular Countdown */}
              <div className="relative w-44 h-44 rounded-full border-8 border-emerald-100 flex flex-col items-center justify-center bg-emerald-50/50">
                <span className="text-3xl font-bold font-mono text-[#1E7A46] tabular-nums">
                  {Math.floor(restRemainingSec / 60)}:
                  {restRemainingSec % 60 < 10 ? '0' : ''}
                  {restRemainingSec % 60}
                </span>
                <span className="text-xs text-[#5B636E] mt-1">Minutes left</span>
              </div>

              <div className="space-y-2 text-xs text-[#5B636E]">
                <p className="font-telugu text-sm text-[#1B1F24]">
                  నీళ్లు తాగండి. నీడలో కూర్చోండి.
                </p>
                <p>Drink water. Sit in the designated cool area.</p>
                <div className="text-[11px] bg-slate-100 p-2 rounded-lg border border-[#D9DDE2] text-slate-700">
                  Your work is covered. The plan already has heat buffer time for this.
                </div>
              </div>

              <div className="w-full space-y-2">
                <button
                  onClick={() => triggerDizzy(selectedStationId, selectedWorkerId || 'w_anitha')}
                  className="w-full py-2.5 rounded-lg bg-red-50 text-[#B42318] border border-red-200 text-xs font-bold"
                >
                  Feeling worse? Tap for Dizzy assistance
                </button>
                <button
                  onClick={() => setScreen('home')}
                  className="w-full py-2.5 rounded-lg bg-white border border-[#D9DDE2] text-[#1B1F24] text-xs font-semibold"
                >
                  Return to Home
                </button>
              </div>
            </div>
          )}

          {/* C4. Voice Report Screen */}
          {screen === 'voice' && (
            <div className="p-6 flex-1 flex flex-col justify-between items-center text-center space-y-4">
              <div className="space-y-1">
                <h2 className="font-telugu text-2xl font-bold text-[#1B1F24]">
                  మాట్లాడి చెప్పండి
                </h2>
                <p className="text-sm font-semibold text-[#5B636E]">Telugu Voice Safety Report</p>
              </div>

              {/* Waveform / Mic Circle */}
              <div className="space-y-3">
                <button
                  onClick={() => setVoiceRecording(!voiceRecording)}
                  className={`w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all shadow-lg ${
                    voiceRecording
                      ? 'bg-red-500 text-white animate-pulse ring-8 ring-red-200'
                      : 'bg-[#0F5FA8] text-white hover:bg-[#0D4F8C]'
                  }`}
                >
                  <Mic size={48} />
                  <span className="text-xs font-bold mt-1">
                    {voiceRecording ? `${voiceElapsedSec}s` : 'Tap to Speak'}
                  </span>
                </button>

                <p className="text-xs text-[#5B636E]">
                  {voiceRecording
                    ? 'Listening... Speak in Telugu'
                    : 'Tap mic or pick a sample worker clip below'}
                </p>
              </div>

              {/* Sample Recorded Clip Picker */}
              <div className="w-full text-left bg-[#F4F5F7] p-3 rounded-lg border border-[#D9DDE2] space-y-2">
                <span className="text-[10px] font-bold text-[#5B636E] uppercase tracking-wider">
                  Sample Worker Audio Clip:
                </span>
                <div className="font-telugu text-sm text-[#1B1F24] font-medium">
                  &ldquo;పెయింట్ లైన్ వద్ద చాలా వేడిగా ఉంది, 10 నిమిషాలు రెస్ట్ కావాలి&rdquo;
                </div>
                <div className="text-[11px] text-[#5B636E] italic">
                  &ldquo;Paint line is too hot, need a 10 minute rest&rdquo;
                </div>
              </div>

              <div className="w-full space-y-2">
                <button
                  onClick={handleSendVoiceReport}
                  disabled={voiceSent}
                  className="w-full h-12 rounded-xl bg-[#0F5FA8] hover:bg-[#0D4F8C] text-white font-bold text-sm shadow-sm transition-colors"
                >
                  {voiceSent ? 'Extracting via Gemini...' : 'Send Voice Report to Planner'}
                </button>

                <button
                  onClick={() => setScreen('home')}
                  className="w-full py-2 text-xs text-[#5B636E]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* C5. Hazard Picker */}
          {screen === 'hazard' && (
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <h2 className="font-telugu text-2xl font-bold text-[#1B1F24] mb-1">
                  ప్రమాదం రకం
                </h2>
                <p className="text-xs text-[#5B636E] mb-4">Select Hazard Type (Station: {currentStation.nameEn})</p>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { te: 'విపరీతమైన వేడి', en: 'Extreme Heat', icon: Flame, color: 'text-orange-600' },
                    { te: 'పొగ / రసాయనాలు', en: 'Fumes / Chemical', icon: WindIcon, color: 'text-purple-600' },
                    { te: 'మెషిన్ గార్డ్ లోపం', en: 'Machine Guard', icon: ShieldCheck, color: 'text-red-600' },
                    { te: 'జారే నేల', en: 'Slip / Trip', icon: AlertTriangle, color: 'text-amber-600' },
                  ].map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        alert(`Logged hazard: ${h.en}`);
                        setScreen('home');
                      }}
                      className="p-4 rounded-xl border border-[#D9DDE2] bg-white hover:bg-[#F4F5F7] text-left space-y-2 shadow-2xs"
                    >
                      <h.icon size={24} className={h.color} />
                      <div>
                        <div className="font-telugu font-bold text-base text-[#1B1F24]">{h.te}</div>
                        <div className="text-[11px] text-[#5B636E]">{h.en}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setScreen('home')}
                className="w-full py-2.5 rounded-lg border border-[#D9DDE2] text-[#5B636E] text-xs font-semibold"
              >
                Back to Home
              </button>
            </div>
          )}

          {/* C6. SOS Sent Ladder */}
          {screen === 'sos_sent' && (
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4 bg-red-50/50">
              <div className="text-center space-y-2 pt-2">
                <div className="w-16 h-16 rounded-full bg-red-100 text-[#B42318] mx-auto flex items-center justify-center animate-pulse">
                  <AlertOctagon size={40} />
                </div>
                <h2 className="font-telugu text-2xl font-bold text-[#B42318]">
                  SOS పంపబడింది!
                </h2>
                <p className="text-xs text-[#5B636E]">Emergency stop signal dispatched without AI models</p>
              </div>

              {/* Status Ladder */}
              <div className="space-y-3 bg-white p-4 rounded-xl border border-red-200 text-xs">
                {[
                  { step: 1, label: 'SOS signal sent from station tablet', done: sosStatusStep >= 1 },
                  { step: 2, label: 'Reached Lakshmi by in-app floor push', done: sosStatusStep >= 2 },
                  { step: 3, label: 'Seen by Lakshmi (Floor Supervisor)', done: sosStatusStep >= 3 },
                  { step: 4, label: 'Help coming to Furnace 1 station', done: sosStatusStep >= 4 },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-2.5">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        s.done
                          ? 'bg-[#1E7A46] text-white'
                          : 'bg-slate-100 text-slate-400 border border-slate-300'
                      }`}
                    >
                      {s.done ? <Check size={14} /> : s.step}
                    </div>
                    <span className={s.done ? 'font-semibold text-[#1B1F24]' : 'text-slate-400'}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* 10s Cancel Button */}
              <div className="space-y-2">
                {sosCancelRemaining > 0 ? (
                  <button
                    onClick={() => {
                      alert('SOS canceled by worker. Supervisor will still receive notification.');
                      setScreen('home');
                    }}
                    className="w-full py-3 rounded-xl bg-white border border-[#D9DDE2] text-[#B42318] text-xs font-bold"
                  >
                    Cancel, I sent by mistake ({sosCancelRemaining}s)
                  </button>
                ) : (
                  <button
                    onClick={() => setScreen('home')}
                    className="w-full py-3 rounded-xl bg-[#0F5FA8] text-white text-xs font-bold"
                  >
                    Return to Station Home
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function WindIcon(props: any) {
  return (
    <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  );
}
