import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Flame,
  Volume2,
  Mic,
  AlertOctagon,
  CheckCircle2,
  ArrowLeft,
  Smartphone,
  Tablet,
  Check,
  Info,
  MessageSquare,
  Loader2,
  Languages,
} from 'lucide-react';
import { usePlant } from '../../context/PlantContext';
import { HeatBadge } from '../common/HeatBadge';
import { SupervisorMode } from './SupervisorMode';
import { HEAT_LEVELS } from '../../types';
import { TABLET_LANGUAGES, TABLET_STRINGS, TabletLang, fill } from '../../constants/tabletI18n';
import { IncidentPhotoAlert, sendIncidentPhotoAlert } from '../../services/safetyApi';

const LANG_STORAGE_KEY = 'teevra.tabletLang';
const SOS_CANCEL_WINDOW_SEC = 10;
const SOS_STEP_TIMES_SEC = [0, 2, 4, 6];
const INCIDENT_OPTIONS = [
  { id: 'slip', src: '/incidents/incident-slip.jpg', label: 'Slip and spill' },
  { id: 'smoke', src: '/incidents/incident-smoke.jpg', label: 'Oven smoke' },
  { id: 'heat', src: '/incidents/incident-heat.jpg', label: 'Heat distress' },
] as const;

const readStoredLang = (): TabletLang => {
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(LANG_STORAGE_KEY) : null;
  return TABLET_LANGUAGES.some((l) => l.code === stored) ? (stored as TabletLang) : 'te';
};

export const WorkerApp: React.FC = () => {
  const {
    stations,
    activeHeatCheck,
    submitWorkerHeatCheck,
    triggerSos,
    triggerDizzy,
    triggerVoiceReport,
    workerDeviceMode,
    setWorkerDeviceMode,
    goBack,
  } = usePlant();

  const [screen, setScreen] = useState<'consent' | 'home' | 'heat_check' | 'rest_timer' | 'voice' | 'hazard' | 'sos_sent' | 'supervisor'>('home');
  const [lang, setLang] = useState<TabletLang>(readStoredLang);
  const [selectedWorkerId] = useState<string>('w_anitha');
  const [selectedStationId, setSelectedStationId] = useState<string>('st_paint');
  const [sosProgress, setSosProgress] = useState<number>(0);
  const [sosHolding, setSosHolding] = useState<boolean>(false);
  const [voiceRecording, setVoiceRecording] = useState<boolean>(false);
  const [voiceElapsedSec, setVoiceElapsedSec] = useState<number>(0);
  const [voiceSent, setVoiceSent] = useState<boolean>(false);
  const [restRemainingSec, setRestRemainingSec] = useState<number>(600);
  const [sosElapsedSec, setSosElapsedSec] = useState<number>(0);
  const [selectedIncidentId, setSelectedIncidentId] = useState<(typeof INCIDENT_OPTIONS)[number]['id'] | null>(null);
  const [incidentSending, setIncidentSending] = useState(false);
  const [incidentAlert, setIncidentAlert] = useState<IncidentPhotoAlert | null>(null);
  const [incidentError, setIncidentError] = useState('');
  const [audioPlaying, setAudioPlaying] = useState<boolean>(false);
  const [checkInStatus, setCheckInStatus] = useState<string | null>(null);

  const t = TABLET_STRINGS[lang];
  const en = TABLET_STRINGS.en;
  const langMeta = TABLET_LANGUAGES.find((l) => l.code === lang)!;
  const font = langMeta.fontClass;
  const currentStation = stations.find((s) => s.id === selectedStationId) || stations[2];
  const stationLocalName = lang === 'te' ? currentStation.nameTe : lang === 'en' ? '' : currentStation.nameEn;
  const heatWord = lang === 'te' ? HEAT_LEVELS[currentStation.heatLevel].wordTe : t.heatWords[currentStation.heatLevel - 1];

  const subLine = (title: keyof typeof en, detail: keyof typeof en) =>
    lang === 'en' ? (en[detail] as string) : `${en[title] as string} • ${en[detail] as string}`;

  useEffect(() => {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    if (activeHeatCheck && activeHeatCheck.stationId === selectedStationId && !activeHeatCheck.isHeldDuringPour) {
      setScreen('heat_check');
    }
  }, [activeHeatCheck, selectedStationId]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (sosHolding) {
      timer = setInterval(() => {
        setSosProgress((prev) => {
          if (prev >= 100) {
            clearInterval(timer);
            setSosHolding(false);
            setSosProgress(0);
            triggerSos(selectedStationId, selectedWorkerId);
            setScreen('sos_sent');
            setSosElapsedSec(0);
            setSelectedIncidentId(null);
            setIncidentAlert(null);
            setIncidentError('');
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

  useEffect(() => {
    if (screen !== 'sos_sent') return;
    const interval = setInterval(() => setSosElapsedSec((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'rest_timer') return;
    const interval = setInterval(() => {
      setRestRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [screen]);

  useEffect(() => {
    if (!voiceRecording) return;
    const interval = setInterval(() => {
      setVoiceElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [voiceRecording]);

  const speak = (text: string) => {
    setAudioPlaying(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langMeta.speech;
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
    const enText = 'Paint line is too hot, need a 10 minute rest';
    await triggerVoiceReport(te, enText);
    setTimeout(() => {
      setVoiceSent(false);
      setScreen('home');
    }, 2000);
  };

  if (screen === 'supervisor') {
    return <SupervisorMode onExit={() => setScreen('home')} />;
  }

  const sosCancelRemaining = Math.max(0, SOS_CANCEL_WINDOW_SEC - sosElapsedSec);

  const chooseIncidentPhoto = async (imageId: (typeof INCIDENT_OPTIONS)[number]['id']) => {
    if (incidentSending) return;
    setSelectedIncidentId(imageId);
    setIncidentSending(true);
    setIncidentAlert(null);
    setIncidentError('');
    try {
      const result = await sendIncidentPhotoAlert(imageId, currentStation.nameEn);
      setIncidentAlert(result);
    } catch {
      setIncidentError('The Telegram alert did not go out. Check the backend, then choose the photo again.');
    } finally {
      setIncidentSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1B1F24] flex flex-col font-sans select-none" lang={lang}>
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

          <button
            onClick={() => setWorkerDeviceMode(workerDeviceMode === 'tablet' ? 'phone' : 'tablet')}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-white"
            title={`Switch to ${workerDeviceMode === 'tablet' ? 'Phone' : 'Station Tablet'} view`}
          >
            {workerDeviceMode === 'tablet' ? <Smartphone size={14} /> : <Tablet size={14} />}
          </button>

          <button
            onClick={() => setScreen('supervisor')}
            className="px-2 py-1 rounded bg-[#0F5FA8] hover:bg-[#0D4F8C] text-white font-semibold text-[11px]"
          >
            Supervisor Mode
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-3 sm:p-6">
        <div
          className={`w-full bg-white rounded-2xl shadow-xl border border-[#D9DDE2] overflow-hidden flex flex-col transition-all ${
            workerDeviceMode === 'tablet' ? 'max-w-md min-h-[720px]' : 'max-w-xs min-h-[640px]'
          }`}
        >
          {/* Consent */}
          {screen === 'consent' && (
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-center mb-4">
                  <h2 className={`${font} text-2xl font-bold text-[#1B1F24]`}>{t.consentTitle}</h2>
                  {lang !== 'en' && <p className="text-sm font-semibold text-[#5B636E]">{en.consentTitle}</p>}
                </div>

                <div className="space-y-3 text-sm text-[#1B1F24] leading-relaxed bg-[#F4F5F7] p-4 rounded-xl border border-[#D9DDE2]">
                  {(['consentNoPenalty', 'consentAnonymous', 'consentIdentify', 'consentVoice'] as const).map((key, i) => (
                    <div key={key} className="flex items-start gap-2.5">
                      <CheckCircle2 size={18} className={`${i === 3 ? 'text-[#0F5FA8]' : 'text-[#1E7A46]'} shrink-0 mt-0.5`} />
                      <div>
                        <strong className={`${font} text-base`}>{t[key]}</strong>
                        {lang !== 'en' && <p className="text-sm text-[#5B636E]">{en[key]}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => setScreen('home')}
                  className="w-full h-14 rounded-xl bg-[#0F5FA8] text-white font-bold text-base shadow-sm flex flex-col items-center justify-center cursor-pointer"
                >
                  <span className={`${font} text-lg leading-tight`}>{t.consentAgree}</span>
                  {lang !== 'en' && <span className="text-xs font-normal opacity-90">{en.consentAgree}</span>}
                </button>
                <button
                  onClick={() => setScreen('home')}
                  className={`${font} w-full h-12 rounded-xl bg-[#F4F5F7] hover:bg-slate-200 text-[#1B1F24] font-semibold text-xs border border-[#D9DDE2] cursor-pointer`}
                >
                  {t.consentVoiceOn}
                </button>
                <button
                  onClick={() => setScreen('home')}
                  className={`${font} w-full h-10 rounded-xl bg-white hover:bg-red-50 text-[#B42318] font-semibold text-xs border border-red-200 cursor-pointer transition-colors`}
                >
                  {t.consentWithdraw}
                </button>
              </div>
            </div>
          )}

          {/* Station Home */}
          {screen === 'home' && (
            <div className="flex-1 flex flex-col p-4 sm:p-5 justify-between space-y-3">
              <div className="border-b border-[#D9DDE2] pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#1B1F24] leading-tight">{currentStation.nameEn}</h1>
                    {stationLocalName && lang === 'te' && (
                      <div className="font-telugu text-base text-[#5B636E] font-medium">{stationLocalName}</div>
                    )}
                  </div>
                  <button
                    onClick={() => setScreen('consent')}
                    className="p-1.5 text-xs text-[#0F5FA8] hover:bg-blue-50 rounded"
                    title="Consent & privacy terms"
                  >
                    <Info size={16} />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <HeatBadge
                    level={currentStation.heatLevel}
                    size="md"
                    showTelugu={false}
                    localWord={lang === 'en' ? undefined : heatWord}
                    localFontClass={font}
                  />
                  <span className="text-[11px] font-mono text-[#5B636E]">{currentStation.currentWBGTEstimate}°C est.</span>
                </div>
                <div className={`${font} text-[10px] text-[#5B636E] mt-1`}>{t.screeningNote}</div>

                {/* Language picker */}
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Tablet language">
                  <span className="text-[11px] font-semibold text-[#5B636E] inline-flex items-center gap-1">
                    <Languages size={13} />
                    <span className={font}>{t.language}:</span>
                  </span>
                  {TABLET_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      role="radio"
                      aria-checked={lang === l.code}
                      data-lang={l.code}
                      onClick={() => setLang(l.code)}
                      className={`${l.fontClass} px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        lang === l.code
                          ? 'bg-[#0F5FA8] text-white shadow-2xs'
                          : 'bg-[#F4F5F7] text-[#1B1F24] border border-[#D9DDE2] hover:bg-slate-200'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5 flex-1 flex flex-col justify-center">
                <button
                  onClick={() => {
                    speak(t.okSpoken);
                    alert(t.okLogged);
                  }}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-white hover:bg-emerald-50 active:bg-emerald-100 text-[#1E7A46] border-2 border-emerald-300 font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className={`${font} text-xl sm:text-2xl leading-none mb-1`}>{t.okTitle}</div>
                    <div className="text-xs sm:text-sm font-semibold opacity-90">{subLine('okTitle', 'okDetail')}</div>
                  </div>
                  <CheckCircle2 size={32} className="text-[#1E7A46] shrink-0" />
                </button>

                <button
                  onClick={() => {
                    speak(t.hotSpoken);
                    setScreen('rest_timer');
                  }}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-white hover:bg-orange-50 active:bg-orange-100 text-[#C2410C] border-2 border-orange-300 font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className={`${font} text-xl sm:text-2xl leading-none mb-1`}>{t.hotTitle}</div>
                    <div className="text-xs sm:text-sm font-semibold opacity-90">{subLine('hotTitle', 'hotDetail')}</div>
                  </div>
                  <Flame size={32} className="text-[#C2410C] shrink-0" />
                </button>

                <button
                  onClick={() => {
                    triggerDizzy(selectedStationId, selectedWorkerId);
                    speak(t.dizzySpoken);
                    alert(t.dizzyAlert);
                  }}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-white hover:bg-red-50 active:bg-red-100 text-[#B42318] border-2 border-red-300 font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className={`${font} text-xl sm:text-2xl leading-none mb-1`}>{t.dizzyTitle}</div>
                    <div className="text-xs sm:text-sm font-semibold opacity-90">{subLine('dizzyTitle', 'dizzyDetail')}</div>
                  </div>
                  <AlertTriangle size={32} className="text-[#B42318] shrink-0" />
                </button>

                <button
                  onClick={() => setScreen('hazard')}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-white hover:bg-slate-50 text-[#1B1F24] border-2 border-[#D9DDE2] font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className={`${font} text-xl sm:text-2xl leading-none mb-1`}>{t.hazardTitle}</div>
                    <div className="text-xs sm:text-sm font-semibold text-[#5B636E]">{subLine('hazardTitle', 'hazardDetail')}</div>
                  </div>
                  <ShieldCheck size={30} className="text-[#5B636E] shrink-0" />
                </button>

                <button
                  onClick={() => setScreen('voice')}
                  className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-[#0F5FA8]/5 hover:bg-[#0F5FA8]/10 text-[#0F5FA8] border-2 border-[#0F5FA8]/30 font-bold p-3 shadow-2xs flex items-center justify-between transition-colors"
                >
                  <div className="text-left">
                    <div className={`${font} text-xl sm:text-2xl leading-none mb-1`}>{t.speakTitle}</div>
                    <div className="text-xs sm:text-sm font-semibold opacity-90">{subLine('speakTitle', 'speakDetail')}</div>
                  </div>
                  <Mic size={32} className="text-[#0F5FA8] shrink-0" />
                </button>
              </div>

              {/* Hold-for-SOS */}
              <div className="pt-2">
                <button
                  onMouseDown={() => setSosHolding(true)}
                  onMouseUp={() => setSosHolding(false)}
                  onMouseLeave={() => setSosHolding(false)}
                  onTouchStart={() => setSosHolding(true)}
                  onTouchEnd={() => setSosHolding(false)}
                  onTouchCancel={() => setSosHolding(false)}
                  data-testid="sos-hold"
                  className="w-full h-24 sm:h-28 rounded-2xl bg-[#B42318] hover:bg-[#9B1E14] active:bg-[#83180F] text-white font-bold shadow-lg flex flex-col items-center justify-center relative overflow-hidden transition-all"
                >
                  <div
                    style={{ width: `${sosProgress}%` }}
                    className="absolute inset-y-0 left-0 bg-black/30 transition-all pointer-events-none"
                  />
                  <div className="relative z-10 flex items-center gap-3">
                    <AlertOctagon size={36} className="text-white animate-pulse" />
                    <div className="text-left">
                      <div className={`${font} text-2xl font-bold leading-tight`}>{t.sosTitle}</div>
                      <div className={`${lang === 'en' ? '' : font} text-xs font-semibold tracking-wide uppercase opacity-90`}>
                        {t.sosDetail}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Heat check */}
          {screen === 'heat_check' && (
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4 bg-orange-50/50">
              <div className="space-y-3 text-center pt-4">
                <div className="w-16 h-16 rounded-full bg-orange-100 text-[#C2410C] mx-auto flex items-center justify-center">
                  <Flame size={36} className="animate-bounce" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase font-bold tracking-wider text-[#C2410C]">Heat Level Rise: {currentStation.nameEn}</div>
                  <h2 className={`${font} text-3xl font-bold text-[#1B1F24] leading-tight`}>{t.areYouOk}</h2>
                  {lang !== 'en' && <p className="text-lg font-semibold text-[#5B636E]">{en.areYouOk}</p>}
                </div>
                <p className={`${font} text-xs text-[#5B636E]`}>{t.screeningNote}</p>
                <button
                  onClick={() => speak(t.askSpoken)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#D9DDE2] text-xs font-semibold text-[#0F5FA8]"
                >
                  <Volume2 size={14} className={audioPlaying ? 'animate-pulse' : ''} />
                  <span className={font}>{t.listen} ({langMeta.label})</span>
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setCheckInStatus(`${t.yesOk} • ${t.yesOkDetail}`);
                    submitWorkerHeatCheck('ok');
                    setScreen('rest_timer');
                  }}
                  className="w-full h-20 rounded-xl bg-[#1E7A46] hover:bg-[#186338] text-white font-bold shadow-md flex flex-col items-center justify-center cursor-pointer transition-colors"
                >
                  <span className={`${font} text-2xl leading-none`}>{t.yesOk}</span>
                  <span className="text-xs font-normal opacity-90">{lang === 'en' ? en.yesOkDetail : `${en.yesOk} (${en.yesOkDetail})`}</span>
                </button>
                <button
                  onClick={() => {
                    setCheckInStatus(`${t.notOk} • ${t.notOkDetail}`);
                    submitWorkerHeatCheck('not_okay');
                    setScreen('rest_timer');
                  }}
                  className="w-full h-20 rounded-xl bg-[#B42318] hover:bg-[#9B1E14] text-white font-bold shadow-md flex flex-col items-center justify-center cursor-pointer transition-colors"
                >
                  <span className={`${font} text-2xl leading-none`}>{t.notOk}</span>
                  <span className="text-xs font-normal opacity-90">{lang === 'en' ? en.notOkDetail : `${en.notOk} (${en.notOkDetail})`}</span>
                </button>
              </div>

              <div className="text-center text-[11px] text-[#5B636E] pt-2">
                <p className={font}>{t.noReply}</p>
                {lang !== 'en' && <p>{en.noReply}</p>}
              </div>
            </div>
          )}

          {/* Rest timer */}
          {screen === 'rest_timer' && (
            <div className="p-6 flex-1 flex flex-col justify-between items-center text-center space-y-4">
              {checkInStatus && (
                <div className={`${font} w-full py-2 px-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs`}>
                  <CheckCircle2 size={16} className="text-[#1E7A46] shrink-0" />
                  <span>{checkInStatus}</span>
                </div>
              )}
              <div className="space-y-1">
                <h2 className={`${font} text-2xl font-bold text-[#1B1F24]`}>{t.restTitle}</h2>
                <p className={`${font} text-sm font-semibold text-[#5B636E]`}>{t.restDetail}</p>
                <div className={`${font} inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#1E7A46] font-bold text-xs`}>{t.restPaid}</div>
              </div>

              <div className="relative w-44 h-44 rounded-full border-8 border-emerald-100 flex flex-col items-center justify-center bg-emerald-50/50">
                <span className="text-3xl font-bold font-mono text-[#1E7A46] tabular-nums">
                  {Math.floor(restRemainingSec / 60)}:{restRemainingSec % 60 < 10 ? '0' : ''}
                  {restRemainingSec % 60}
                </span>
                <span className={`${font} text-xs text-[#5B636E] mt-1`}>{t.minutesLeft}</span>
              </div>

              <div className="space-y-2 text-xs text-[#5B636E]">
                <p className={`${font} text-sm text-[#1B1F24]`}>{t.drinkWater}</p>
                {lang !== 'en' && <p>{en.drinkWater}</p>}
                <div className={`${font} text-[11px] bg-slate-100 p-2 rounded-lg border border-[#D9DDE2] text-slate-700`}>{t.workCovered}</div>
              </div>

              <div className="w-full space-y-2">
                <button
                  onClick={() => triggerDizzy(selectedStationId, selectedWorkerId)}
                  className={`${font} w-full py-2.5 rounded-lg bg-red-50 text-[#B42318] border border-red-200 text-xs font-bold`}
                >
                  {t.feelingWorse}
                </button>
                <button
                  onClick={() => setScreen('home')}
                  className={`${font} w-full py-2.5 rounded-lg bg-white border border-[#D9DDE2] text-[#1B1F24] text-xs font-semibold`}
                >
                  {t.returnHome}
                </button>
              </div>
            </div>
          )}

          {/* Voice report */}
          {screen === 'voice' && (
            <div className="p-6 flex-1 flex flex-col justify-between items-center text-center space-y-4">
              <div className="space-y-1">
                <h2 className={`${font} text-2xl font-bold text-[#1B1F24]`}>{t.voiceTitle}</h2>
                <p className={`${font} text-sm font-semibold text-[#5B636E]`}>{t.voiceDetail}</p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setVoiceRecording(!voiceRecording)}
                  className={`w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all shadow-lg ${
                    voiceRecording ? 'bg-red-500 text-white animate-pulse ring-8 ring-red-200' : 'bg-[#0F5FA8] text-white hover:bg-[#0D4F8C]'
                  }`}
                >
                  <Mic size={48} />
                  <span className={`${font} text-xs font-bold mt-1`}>{voiceRecording ? `${voiceElapsedSec}s` : t.tapToSpeak}</span>
                </button>
                <p className={`${font} text-xs text-[#5B636E]`}>{voiceRecording ? t.listening : t.tapOrPick}</p>
              </div>

              <div className="w-full text-left bg-[#F4F5F7] p-3 rounded-lg border border-[#D9DDE2] space-y-2">
                <span className={`${font} text-[10px] font-bold text-[#5B636E] uppercase tracking-wider`}>{t.sampleClip}:</span>
                <div className="font-telugu text-sm text-[#1B1F24] font-medium">
                  &ldquo;పెయింట్ లైన్ వద్ద చాలా వేడిగా ఉంది, 10 నిమిషాలు రెస్ట్ కావాలి&rdquo;
                </div>
                <div className="text-[11px] text-[#5B636E] italic">&ldquo;Paint line is too hot, need a 10 minute rest&rdquo;</div>
              </div>

              <div className="w-full space-y-2">
                <button
                  onClick={handleSendVoiceReport}
                  disabled={voiceSent}
                  className={`${font} w-full h-12 rounded-xl bg-[#0F5FA8] hover:bg-[#0D4F8C] text-white font-bold text-sm shadow-sm transition-colors`}
                >
                  {voiceSent ? t.extracting : t.sendVoice}
                </button>
                <button onClick={() => setScreen('home')} className={`${font} w-full py-2 text-xs text-[#5B636E]`}>
                  {t.cancel}
                </button>
              </div>
            </div>
          )}

          {/* Hazard picker */}
          {screen === 'hazard' && (
            <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <h2 className={`${font} text-2xl font-bold text-[#1B1F24] mb-1`}>{t.hazardPick}</h2>
                <p className={`${font} text-xs text-[#5B636E] mb-4`}>
                  {t.hazardSelect} ({currentStation.nameEn})
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Flame, color: 'text-orange-600' },
                    { icon: WindIcon, color: 'text-purple-600' },
                    { icon: ShieldCheck, color: 'text-red-600' },
                    { icon: AlertTriangle, color: 'text-amber-600' },
                  ].map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        alert(`${t.hazardLogged}: ${t.hazards[i]}`);
                        setScreen('home');
                      }}
                      className="p-4 rounded-xl border border-[#D9DDE2] bg-white hover:bg-[#F4F5F7] text-left space-y-2 shadow-2xs"
                    >
                      <h.icon size={24} className={h.color} />
                      <div>
                        <div className={`${font} font-bold text-base text-[#1B1F24]`}>{t.hazards[i]}</div>
                        {lang !== 'en' && <div className="text-[11px] text-[#5B636E]">{en.hazards[i]}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setScreen('home')}
                className={`${font} w-full py-2.5 rounded-lg border border-[#D9DDE2] text-[#5B636E] text-xs font-semibold`}
              >
                {t.back}
              </button>
            </div>
          )}

          {/* SOS sent */}
          {screen === 'sos_sent' && (
            <div className="p-5 flex-1 flex flex-col space-y-3.5 bg-red-50/50" data-testid="sos-sent">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-full bg-red-100 text-[#B42318] mx-auto flex items-center justify-center animate-pulse">
                  <AlertOctagon size={30} />
                </div>
                <h2 className={`${font} text-2xl font-bold text-[#B42318]`}>{t.sosSent}</h2>
                <p className={`${font} text-xs text-[#5B636E]`}>{t.sosSentDetail}</p>
              </div>

              <div className="bg-white rounded-xl border border-red-200 p-3 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#1B1F24]">Choose one incident photo</span>
                  <span className="text-[10px] font-semibold text-[#5B636E]">Gemini, then Telegram</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {INCIDENT_OPTIONS.map((photo) => {
                    const selected = selectedIncidentId === photo.id;
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        data-testid={`incident-${photo.id}`}
                        disabled={incidentSending}
                        onClick={() => chooseIncidentPhoto(photo.id)}
                        className={`overflow-hidden rounded-lg border text-left disabled:cursor-wait ${
                          selected ? 'border-[#B42318] ring-2 ring-[#B42318]' : 'border-[#D9DDE2]'
                        }`}
                      >
                        <img src={photo.src} alt={photo.label} className="aspect-video w-full object-cover" />
                        <span className="block px-1.5 py-1 text-[10px] font-semibold text-[#1B1F24]">{photo.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(incidentSending || incidentAlert || incidentError) && (
                <div
                  className={`rounded-xl border p-3 shadow-2xs ${
                    incidentAlert ? 'bg-emerald-50 border-emerald-300' : incidentError ? 'bg-red-50 border-red-200' : 'bg-white border-[#D9DDE2]'
                  }`}
                  role="status"
                  data-testid="telegram-alert"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1B1F24] inline-flex items-center gap-1.5">
                      <MessageSquare size={14} className={incidentAlert ? 'text-[#1E7A46]' : 'text-[#0F5FA8]'} />
                      Telegram alert
                    </span>
                    <span className={`text-[10px] font-bold inline-flex items-center gap-1 ${incidentAlert ? 'text-[#1E7A46]' : 'text-[#0F5FA8]'}`}>
                      {incidentSending ? <Loader2 size={11} className="animate-spin" /> : incidentAlert ? <Check size={11} /> : null}
                      {incidentSending ? 'Gemini is reading the photo…' : incidentAlert ? 'Sent to Telegram' : 'Not sent'}
                    </span>
                  </div>
                  {incidentAlert && (
                    <div className="mt-2 space-y-1.5 text-[11px] text-[#1B1F24]">
                      <p><strong>Situation:</strong> {incidentAlert.situation}</p>
                      <p><strong>Suggested response:</strong> {incidentAlert.recommended_action}</p>
                      <p className="text-[#5B636E]">Assessed by {incidentAlert.gemini_model}. Confirm on the floor before acting.</p>
                    </div>
                  )}
                  {incidentError && <p className="mt-2 text-[11px] text-[#B42318]">{incidentError}</p>}
                </div>
              )}

              {/* Status ladder */}
              <div className="space-y-2 bg-white p-3 rounded-xl border border-red-200 text-xs">
                {t.steps.map((label, i) => {
                  const done = sosElapsedSec >= SOS_STEP_TIMES_SEC[i];
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          done ? 'bg-[#1E7A46] text-white' : 'bg-slate-100 text-slate-400 border border-slate-300'
                        }`}
                      >
                        {done ? <Check size={12} /> : i + 1}
                      </div>
                      <span className={`${font} ${done ? 'font-semibold text-[#1B1F24]' : 'text-slate-400'}`}>
                        {fill(label, currentStation.nameEn)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-center font-semibold">
                Tap a photo to send that image and Gemini’s description to your Telegram bot.
              </p>

              <div className="pt-1 mt-auto">
                {sosCancelRemaining > 0 ? (
                  <button
                    onClick={() => {
                      alert(t.sosCanceled);
                      setScreen('home');
                    }}
                    className={`${font} w-full py-3 rounded-xl bg-white border border-[#D9DDE2] text-[#B42318] text-xs font-bold`}
                  >
                    {t.cancelMistake} ({sosCancelRemaining}s)
                  </button>
                ) : (
                  <button onClick={() => setScreen('home')} className={`${font} w-full py-3 rounded-xl bg-[#0F5FA8] text-white text-xs font-bold`}>
                    {t.returnStation}
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
