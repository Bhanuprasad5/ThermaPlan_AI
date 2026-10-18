export type TabletLang = 'te' | 'en' | 'hi' | 'ja' | 'zh';

export const TABLET_LANGUAGES: Array<{ code: TabletLang; label: string; speech: string; fontClass: string }> = [
  { code: 'te', label: 'తెలుగు', speech: 'te-IN', fontClass: 'font-telugu' },
  { code: 'en', label: 'English', speech: 'en-IN', fontClass: '' },
  { code: 'hi', label: 'हिन्दी', speech: 'hi-IN', fontClass: 'font-hindi' },
  { code: 'ja', label: '日本語', speech: 'ja-JP', fontClass: 'font-japanese' },
  { code: 'zh', label: '中文', speech: 'zh-CN', fontClass: 'font-chinese' },
];

export interface TabletStrings {
  language: string;
  screeningNote: string;
  heatWords: [string, string, string, string];

  okTitle: string;
  okDetail: string;
  okSpoken: string;
  okLogged: string;
  hotTitle: string;
  hotDetail: string;
  hotSpoken: string;
  dizzyTitle: string;
  dizzyDetail: string;
  dizzySpoken: string;
  dizzyAlert: string;
  hazardTitle: string;
  hazardDetail: string;
  speakTitle: string;
  speakDetail: string;
  sosTitle: string;
  sosDetail: string;

  areYouOk: string;
  listen: string;
  askSpoken: string;
  yesOk: string;
  yesOkDetail: string;
  notOk: string;
  notOkDetail: string;
  noReply: string;

  restTitle: string;
  restDetail: string;
  restPaid: string;
  minutesLeft: string;
  drinkWater: string;
  workCovered: string;
  feelingWorse: string;
  returnHome: string;

  voiceTitle: string;
  voiceDetail: string;
  tapToSpeak: string;
  listening: string;
  tapOrPick: string;
  sampleClip: string;
  sendVoice: string;
  extracting: string;
  cancel: string;

  hazardPick: string;
  hazardSelect: string;
  hazards: [string, string, string, string];
  hazardLogged: string;
  back: string;

  sosSent: string;
  sosSentDetail: string;
  photoTitle: string;
  photoUploading: string;
  photoUploaded: string;
  managerTitle: string;
  managerSending: string;
  managerSent: string;
  managerMessage: string;
  mockupNote: string;
  steps: [string, string, string, string];
  cancelMistake: string;
  sosCanceled: string;
  returnStation: string;

  consentTitle: string;
  consentNoPenalty: string;
  consentAnonymous: string;
  consentIdentify: string;
  consentVoice: string;
  consentAgree: string;
  consentVoiceOn: string;
  consentWithdraw: string;
}

const en: TabletStrings = {
  language: 'Language',
  screeningNote: 'Screening estimate, not a WBGT measurement',
  heatWords: ['Normal', 'Watch', 'Hot', 'Stop'],

  okTitle: 'I am fine',
  okDetail: 'OK',
  okSpoken: 'Your check-in was received. Thank you.',
  okLogged: 'Check-in logged: I am OK.',
  hotTitle: 'Too hot',
  hotDetail: 'Request rest',
  hotSpoken: 'Too hot recorded. Take a 10 minute rest.',
  dizzyTitle: 'Dizzy',
  dizzyDetail: 'Auto-remove from heat',
  dizzySpoken: 'You feel dizzy. Please sit in the shade. The supervisor is coming.',
  dizzyAlert: 'Automatic safety action: you have been removed from heavy heat work. Sit down in the shade. The supervisor is notified.',
  hazardTitle: 'Report hazard',
  hazardDetail: 'Fumes, guard, slip',
  speakTitle: 'Speak',
  speakDetail: 'Voice report',
  sosTitle: 'Need help (SOS)',
  sosDetail: 'Hold 1 second for emergency SOS',

  areYouOk: 'Are you okay?',
  listen: 'Listen',
  askSpoken: 'Are you okay? Press a button to answer.',
  yesOk: 'Yes, I am okay',
  yesOkDetail: '10 minute buffered rest',
  notOk: 'Not okay',
  notOkDetail: 'Request supervisor assistance',
  noReply: 'No reply is okay. Someone will come and check.',

  restTitle: 'Take a rest',
  restDetail: 'Mandatory heat safety rest',
  restPaid: 'This rest is paid time (plant policy)',
  minutesLeft: 'Minutes left',
  drinkWater: 'Drink water. Sit in the cool area.',
  workCovered: 'Your work is covered. The plan already has heat buffer time for this.',
  feelingWorse: 'Feeling worse? Tap for dizzy assistance',
  returnHome: 'Return to home',

  voiceTitle: 'Speak',
  voiceDetail: 'Voice safety report',
  tapToSpeak: 'Tap to speak',
  listening: 'Listening... speak now',
  tapOrPick: 'Tap the mic or use the sample clip below',
  sampleClip: 'Sample worker audio clip',
  sendVoice: 'Send voice report to planner',
  extracting: 'Sending report...',
  cancel: 'Cancel',

  hazardPick: 'Hazard type',
  hazardSelect: 'Select hazard type',
  hazards: ['Extreme heat', 'Fumes / chemical', 'Machine guard', 'Slip / trip'],
  hazardLogged: 'Hazard logged',
  back: 'Back to home',

  sosSent: 'SOS sent!',
  sosSentDetail: 'Supervisor alerted immediately, without AI models',
  photoTitle: 'Incident photo',
  photoUploading: 'Uploading photo to cloud...',
  photoUploaded: 'Photo uploaded to cloud',
  managerTitle: 'SMS to manager',
  managerSending: 'Sending incident details to the manager...',
  managerSent: 'Manager notified by SMS',
  managerMessage: 'SOS at {station}. Incident photo attached. Help needed now.',
  mockupNote: 'Mockup: no SMS or message is actually sent.',
  steps: ['SOS signal sent from station tablet', 'Reached Lakshmi by in-app floor push', 'Seen by Lakshmi (floor supervisor)', 'Help coming to {station}'],
  cancelMistake: 'Cancel, I sent by mistake',
  sosCanceled: 'SOS canceled by worker. The supervisor will still receive a notification.',
  returnStation: 'Return to station home',

  consentTitle: 'Consent & privacy',
  consentNoPenalty: 'No penalty for reporting heat or taking safety rests.',
  consentAnonymous: 'Too hot and hazard reports show only the station, not your name.',
  consentIdentify: 'SOS, Dizzy and Not okay identify you so help can reach you.',
  consentVoice: 'Buttons only is the default. Voice recordings are processed by Google outside India.',
  consentAgree: 'Agree, buttons only',
  consentVoiceOn: 'Agree and turn on voice',
  consentWithdraw: 'Withdraw consent (opt out)',
};

const te: TabletStrings = {
  ...en,
  language: 'భాష',
  okTitle: 'నేను బాగున్నాను',
  okSpoken: 'మీ సమాచారం అందింది. ధన్యవాదాలు.',
  hotTitle: 'చాలా వేడిగా ఉంది',
  hotSpoken: 'చాలా వేడిగా ఉందని నమోదైంది. 10 నిమిషాలు విశ్రాంతి తీసుకోండి.',
  dizzyTitle: 'తల తిరుగుతోంది',
  dizzySpoken: 'తల తిరుగుతోంది. దయచేసి నీడలో కూర్చోండి. సూపర్వైజర్ వస్తున్నారు.',
  hazardTitle: 'ప్రమాదం నివేదించండి',
  speakTitle: 'మాట్లాడి చెప్పండి',
  sosTitle: 'సహాయం కావాలి (SOS)',
  areYouOk: 'మీరు బాగున్నారా?',
  askSpoken: 'మీరు బాగున్నారా? సమాధానం ఇవ్వడానికి బటన్ నొక్కండి.',
  yesOk: 'అవును, నేను బాగున్నాను',
  notOk: 'బాగా లేదు (సహాయం కావాలి)',
  noReply: 'స్పందించకపోవడం సరే. ఎవరైనా వచ్చి చూస్తారు.',
  restTitle: 'విశ్రాంతి తీసుకోండి',
  drinkWater: 'నీళ్లు తాగండి. నీడలో కూర్చోండి.',
  voiceTitle: 'మాట్లాడి చెప్పండి',
  hazardPick: 'ప్రమాదం రకం',
  hazards: ['విపరీతమైన వేడి', 'పొగ / రసాయనాలు', 'మెషిన్ గార్డ్ లోపం', 'జారే నేల'],
  sosSent: 'SOS పంపబడింది!',
  consentTitle: 'సమ్మతి & గోప్యత',
  consentNoPenalty: 'నివేదించినందుకు జరిమానా ఉండదు.',
  consentAnonymous: 'వేడి & ప్రమాద నివేదికలు అనామకంగా ఉంటాయి.',
  consentIdentify: 'SOS మరియు తలతిరగడం సహాయం కోసం పేరు చూపిస్తాయి.',
  consentVoice: 'వాయిస్ డేటా గూగుల్ ద్వారా ప్రాసెస్ చేయబడుతుంది.',
  consentAgree: 'అంగీకరిస్తున్నాను (బటన్లు మాత్రమే)',
  consentWithdraw: 'సమ్మతి ఉపసంహరణ',
};

const hi: TabletStrings = {
  language: 'भाषा',
  screeningNote: 'स्क्रीनिंग अनुमान, WBGT माप नहीं',
  heatWords: ['सामान्य', 'सावधान', 'बहुत गर्म', 'रुकें'],

  okTitle: 'मैं ठीक हूँ',
  okDetail: 'ठीक',
  okSpoken: 'आपकी जानकारी मिल गई। धन्यवाद।',
  okLogged: 'चेक-इन दर्ज: मैं ठीक हूँ।',
  hotTitle: 'बहुत गर्मी है',
  hotDetail: 'आराम का अनुरोध',
  hotSpoken: 'बहुत गर्मी दर्ज की गई। 10 मिनट आराम करें।',
  dizzyTitle: 'चक्कर आ रहा है',
  dizzyDetail: 'गर्मी वाले काम से स्वतः हटाएँ',
  dizzySpoken: 'चक्कर आ रहा है। कृपया छाँव में बैठें। सुपरवाइज़र आ रहे हैं।',
  dizzyAlert: 'स्वचालित सुरक्षा कदम: आपको भारी गर्मी वाले काम से हटा दिया गया है। छाँव में बैठें। सुपरवाइज़र को सूचित किया गया है।',
  hazardTitle: 'खतरे की रिपोर्ट करें',
  hazardDetail: 'धुआँ, गार्ड, फिसलन',
  speakTitle: 'बोलकर बताएँ',
  speakDetail: 'आवाज़ रिपोर्ट',
  sosTitle: 'मदद चाहिए (SOS)',
  sosDetail: 'आपातकालीन SOS के लिए 1 सेकंड दबाए रखें',

  areYouOk: 'क्या आप ठीक हैं?',
  listen: 'सुनें',
  askSpoken: 'क्या आप ठीक हैं? जवाब देने के लिए बटन दबाएँ।',
  yesOk: 'हाँ, मैं ठीक हूँ',
  yesOkDetail: '10 मिनट का आराम',
  notOk: 'ठीक नहीं (मदद चाहिए)',
  notOkDetail: 'सुपरवाइज़र की मदद माँगें',
  noReply: 'जवाब न देना भी ठीक है। कोई आकर देखेगा।',

  restTitle: 'आराम करें',
  restDetail: 'अनिवार्य गर्मी सुरक्षा विश्राम',
  restPaid: 'यह आराम सवेतन समय है (प्लांट नीति)',
  minutesLeft: 'मिनट बाकी',
  drinkWater: 'पानी पिएँ। ठंडी जगह पर बैठें।',
  workCovered: 'आपका काम सुरक्षित है। योजना में इसके लिए पहले से समय रखा गया है।',
  feelingWorse: 'तबीयत और खराब? चक्कर सहायता के लिए दबाएँ',
  returnHome: 'होम पर लौटें',

  voiceTitle: 'बोलकर बताएँ',
  voiceDetail: 'आवाज़ सुरक्षा रिपोर्ट',
  tapToSpeak: 'बोलने के लिए दबाएँ',
  listening: 'सुन रहे हैं... अब बोलें',
  tapOrPick: 'माइक दबाएँ या नीचे दी गई नमूना क्लिप चुनें',
  sampleClip: 'नमूना ऑडियो क्लिप',
  sendVoice: 'आवाज़ रिपोर्ट प्लानर को भेजें',
  extracting: 'रिपोर्ट भेजी जा रही है...',
  cancel: 'रद्द करें',

  hazardPick: 'खतरे का प्रकार',
  hazardSelect: 'खतरे का प्रकार चुनें',
  hazards: ['अत्यधिक गर्मी', 'धुआँ / रसायन', 'मशीन गार्ड', 'फिसलन / ठोकर'],
  hazardLogged: 'खतरा दर्ज किया गया',
  back: 'होम पर वापस',

  sosSent: 'SOS भेजा गया!',
  sosSentDetail: 'सुपरवाइज़र को तुरंत सूचित किया गया, बिना AI मॉडल के',
  photoTitle: 'घटना की फोटो',
  photoUploading: 'फोटो क्लाउड पर अपलोड हो रही है...',
  photoUploaded: 'फोटो क्लाउड पर अपलोड हो गई',
  managerTitle: 'मैनेजर को SMS',
  managerSending: 'घटना की जानकारी मैनेजर को भेजी जा रही है...',
  managerSent: 'मैनेजर को SMS से सूचित किया गया',
  managerMessage: '{station} पर SOS। घटना की फोटो संलग्न है। तुरंत मदद चाहिए।',
  mockupNote: 'मॉकअप: वास्तव में कोई SMS या संदेश नहीं भेजा जाता।',
  steps: ['स्टेशन टैबलेट से SOS सिग्नल भेजा गया', 'इन-ऐप पुश से लक्ष्मी तक पहुँचा', 'लक्ष्मी (फ्लोर सुपरवाइज़र) ने देखा', '{station} पर मदद आ रही है'],
  cancelMistake: 'रद्द करें, गलती से भेजा',
  sosCanceled: 'कर्मचारी ने SOS रद्द किया। सुपरवाइज़र को फिर भी सूचना मिलेगी।',
  returnStation: 'स्टेशन होम पर लौटें',

  consentTitle: 'सहमति और गोपनीयता',
  consentNoPenalty: 'गर्मी की रिपोर्ट करने या आराम लेने पर कोई दंड नहीं।',
  consentAnonymous: 'गर्मी और खतरे की रिपोर्ट में सिर्फ स्टेशन दिखता है, आपका नाम नहीं।',
  consentIdentify: 'SOS, चक्कर और "ठीक नहीं" में आपकी पहचान दिखती है ताकि मदद पहुँच सके।',
  consentVoice: 'डिफ़ॉल्ट केवल बटन है। आवाज़ रिकॉर्डिंग भारत के बाहर Google द्वारा प्रोसेस होती है।',
  consentAgree: 'सहमत, केवल बटन',
  consentVoiceOn: 'सहमत और आवाज़ चालू करें',
  consentWithdraw: 'सहमति वापस लें',
};

const ja: TabletStrings = {
  language: '言語',
  screeningNote: 'スクリーニング推定値です。WBGT測定値ではありません',
  heatWords: ['通常', '注意', '高温', '停止'],

  okTitle: '大丈夫です',
  okDetail: 'OK',
  okSpoken: 'チェックインを受け付けました。ありがとうございます。',
  okLogged: 'チェックインを記録しました：大丈夫です。',
  hotTitle: '暑すぎます',
  hotDetail: '休憩を申請',
  hotSpoken: '暑すぎると記録しました。10分間休憩してください。',
  dizzyTitle: 'めまいがします',
  dizzyDetail: '高温作業から自動で外す',
  dizzySpoken: 'めまいがします。日陰に座ってください。監督者が向かっています。',
  dizzyAlert: '自動安全措置：高温の重作業から外されました。日陰に座ってください。監督者に通知しました。',
  hazardTitle: '危険を報告',
  hazardDetail: '煙、ガード、滑り',
  speakTitle: '音声で報告',
  speakDetail: '音声レポート',
  sosTitle: '助けが必要 (SOS)',
  sosDetail: '緊急SOSは1秒間長押し',

  areYouOk: '大丈夫ですか？',
  listen: '聞く',
  askSpoken: '大丈夫ですか？ボタンを押して答えてください。',
  yesOk: 'はい、大丈夫です',
  yesOkDetail: '10分間の休憩',
  notOk: '大丈夫ではない（助けが必要）',
  notOkDetail: '監督者に支援を依頼',
  noReply: '返事がなくても大丈夫です。誰かが確認に来ます。',

  restTitle: '休憩してください',
  restDetail: '必須の暑熱安全休憩',
  restPaid: 'この休憩は有給です（工場の方針）',
  minutesLeft: '残り時間（分）',
  drinkWater: '水を飲んでください。涼しい場所に座ってください。',
  workCovered: 'あなたの作業は確保されています。計画にはこのための余裕時間があります。',
  feelingWorse: '悪化しましたか？めまい支援はこちら',
  returnHome: 'ホームに戻る',

  voiceTitle: '音声で報告',
  voiceDetail: '音声安全レポート',
  tapToSpeak: 'タップして話す',
  listening: '聞いています… 話してください',
  tapOrPick: 'マイクをタップするか、下のサンプルを使用してください',
  sampleClip: 'サンプル音声クリップ',
  sendVoice: '音声レポートを計画担当に送信',
  extracting: 'レポートを送信中…',
  cancel: 'キャンセル',

  hazardPick: '危険の種類',
  hazardSelect: '危険の種類を選択',
  hazards: ['極端な暑さ', '煙 / 化学物質', '機械ガード', '滑り / つまずき'],
  hazardLogged: '危険を記録しました',
  back: 'ホームに戻る',

  sosSent: 'SOSを送信しました！',
  sosSentDetail: 'AIモデルを使わず、監督者に即時通知しました',
  photoTitle: '事故の写真',
  photoUploading: '写真をクラウドにアップロード中…',
  photoUploaded: '写真をクラウドにアップロードしました',
  managerTitle: '管理者へのSMS',
  managerSending: '事故の詳細を管理者に送信中…',
  managerSent: '管理者にSMSで通知しました',
  managerMessage: '{station}でSOS。事故の写真を添付。至急支援が必要です。',
  mockupNote: 'モックアップ：実際にはSMSやメッセージは送信されません。',
  steps: ['ステーションのタブレットからSOS信号を送信', 'アプリ通知でラクシュミに到達', 'ラクシュミ（現場監督者）が確認', '{station}に支援が向かっています'],
  cancelMistake: 'キャンセル（誤送信）',
  sosCanceled: '作業者がSOSをキャンセルしました。監督者には通知が届きます。',
  returnStation: 'ステーションのホームに戻る',

  consentTitle: '同意とプライバシー',
  consentNoPenalty: '暑さの報告や安全休憩による不利益はありません。',
  consentAnonymous: '暑さと危険の報告にはステーションのみが表示され、名前は表示されません。',
  consentIdentify: 'SOS、めまい、大丈夫ではないの報告では、支援のためにあなたが特定されます。',
  consentVoice: '初期設定はボタンのみです。音声はインド国外でGoogleにより処理されます。',
  consentAgree: '同意する（ボタンのみ）',
  consentVoiceOn: '同意して音声をオンにする',
  consentWithdraw: '同意を撤回する',
};

const zh: TabletStrings = {
  language: '语言',
  screeningNote: '筛查估算值，不是WBGT测量值',
  heatWords: ['正常', '注意', '高温', '停止'],

  okTitle: '我很好',
  okDetail: '正常',
  okSpoken: '已收到您的签到。谢谢。',
  okLogged: '已记录签到：我很好。',
  hotTitle: '太热了',
  hotDetail: '申请休息',
  hotSpoken: '已记录太热。请休息10分钟。',
  dizzyTitle: '头晕',
  dizzyDetail: '自动撤离高温岗位',
  dizzySpoken: '您感到头晕。请坐到阴凉处。主管正在赶来。',
  dizzyAlert: '自动安全措施：您已被撤离高温重体力工作。请坐到阴凉处。已通知主管。',
  hazardTitle: '报告危险',
  hazardDetail: '烟雾、防护罩、滑倒',
  speakTitle: '语音报告',
  speakDetail: '语音汇报',
  sosTitle: '需要帮助 (SOS)',
  sosDetail: '紧急SOS请按住1秒',

  areYouOk: '您还好吗？',
  listen: '收听',
  askSpoken: '您还好吗？请按按钮回答。',
  yesOk: '是的，我很好',
  yesOkDetail: '10分钟缓冲休息',
  notOk: '不好（需要帮助）',
  notOkDetail: '请求主管协助',
  noReply: '不回复也没关系。会有人来查看。',

  restTitle: '请休息',
  restDetail: '强制高温安全休息',
  restPaid: '此休息为带薪时间（工厂政策）',
  minutesLeft: '剩余分钟',
  drinkWater: '请喝水。坐在凉爽区域。',
  workCovered: '您的工作已有安排。计划中已为此预留缓冲时间。',
  feelingWorse: '感觉更糟？点击获取头晕协助',
  returnHome: '返回主页',

  voiceTitle: '语音报告',
  voiceDetail: '语音安全汇报',
  tapToSpeak: '点击说话',
  listening: '正在聆听… 请说话',
  tapOrPick: '点击麦克风或使用下方示例音频',
  sampleClip: '示例工人音频',
  sendVoice: '将语音报告发送给计划员',
  extracting: '正在发送报告…',
  cancel: '取消',

  hazardPick: '危险类型',
  hazardSelect: '选择危险类型',
  hazards: ['极端高温', '烟雾 / 化学品', '机器防护罩', '滑倒 / 绊倒'],
  hazardLogged: '已记录危险',
  back: '返回主页',

  sosSent: 'SOS已发送！',
  sosSentDetail: '已立即通知主管，未使用AI模型',
  photoTitle: '事故照片',
  photoUploading: '正在上传照片到云端…',
  photoUploaded: '照片已上传到云端',
  managerTitle: '发给经理的短信',
  managerSending: '正在将事故详情发送给经理…',
  managerSent: '已通过短信通知经理',
  managerMessage: '{station}发生SOS。已附事故照片。需要立即支援。',
  mockupNote: '演示模型：实际上不会发送任何短信或消息。',
  steps: ['已从工位平板发送SOS信号', '已通过应用推送送达拉克希米', '拉克希米（车间主管）已查看', '支援正在前往{station}'],
  cancelMistake: '取消，误发送',
  sosCanceled: '工人已取消SOS。主管仍会收到通知。',
  returnStation: '返回工位主页',

  consentTitle: '同意与隐私',
  consentNoPenalty: '报告高温或进行安全休息不会受到处罚。',
  consentAnonymous: '高温和危险报告只显示工位，不显示您的姓名。',
  consentIdentify: 'SOS、头晕和"不好"会显示您的身份，以便救援到达。',
  consentVoice: '默认仅使用按钮。语音录音由Google在印度境外处理。',
  consentAgree: '同意（仅按钮）',
  consentVoiceOn: '同意并开启语音',
  consentWithdraw: '撤回同意',
};

export const TABLET_STRINGS: Record<TabletLang, TabletStrings> = { te, en, hi, ja, zh };

export const fill = (text: string, station: string) => text.replace('{station}', station);
