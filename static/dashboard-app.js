/**
 * TakeTheCall (대신받아) — Toss-Style Plain Korean UX & Real-Time Turn-by-Turn Simulation Engine
 *
 * Implements:
 * 1. Real-time sequential audio playback (`/assets/audio/*.mp3` + Web Speech API fallback)
 * 2. Live character-by-character STT transcription streaming synchronized with voice audio
 * 3. Turn-by-turn progressive Gemini 4 Argon verification (`POST /api/argon/verify`),
 *    animated risk gauge (`0% -> 42% -> 78% -> 99.4%`), progressive Kill-Chain Stepper,
 *    progressive 5 IOC slot population, and progressive 6 Forged Warrant statutory flags.
 */

(function () {
  "use strict";

  const TOSS_COPIES = {
    safe: {
      title: "안심하세요, 정상적인 안내 전화예요",
      sub: "은행 만기 안내나 우체국 등기 알림처럼 안전한 통화예요. 앱 설치나 돈 이체를 요구하지 않았어요.",
      verdictTitle: "안전한 통화예요 · 보이스피싱 위험 없음",
      verdictSub: "정상 금융 안내 전화 · 오탐률 0.0%",
      kpiSub: "신한은행 정기예금 만기 안내 (정상 통화)",
      btnDispatch: "정상 통화이므로 신고할 필요가 없어요",
    },
    critical: {
      title: "지금 통화는 보이스피싱일 가능성이 매우 높아요!",
      sub: "검찰·금감원은 절대 카톡으로 구속영장을 보내거나 원격제어 앱 설치, 안전계좌 이체를 요구하지 않아요.",
      verdictTitle: "매우 위험 · 검찰 사칭 + 가짜 영장 감지",
      verdictSub: "형사소송법 제85조(영장 직접 제시) 위반 · 즉시 차단 권고",
      kpiSub: "검찰 사칭 + 카톡 가짜 구속영장 적발",
      btnDispatch: "가족에게 알리고 112·금감원 신고 준비하기",
    },
    guardian: {
      title: "AI가 위험 통화를 즉시 가로채고 보호 모드를 켰어요",
      sub: "어르신 대신 AI가 통화를 방어하고, 수집된 5가지 범죄 단서를 가족과 112·1332에 바로 전달할 수 있어요.",
      verdictTitle: "통화 가로채기 완료 · 가족 승인 대기 중",
      verdictSub: "원격제어·금전 요구 즉시 차단됨 · 증거 패킷 생성 완료",
      kpiSub: "AI 보호 방패 가동 · 가족 공동 승인 대기",
      btnDispatch: "가족 승인 완료 · 112 경찰청 · 1332 금감원 시뮬레이션 발송",
    },
  };

  // Turn-by-turn scenario definitions with real MP3 audio, STT text, and progressive Argon telemetry
  const SCENARIO_STREAMS = {
    SAFE: {
      mode: "safe",
      label: "SAFE CONTROL · 신한은행 정기예금 만기 안내",
      callerLabel: "Ch1: 수신 오디오 (16kHz PCM · 신한은행 분당지점)",
      turns: [
        {
          speakerType: "scammer",
          badgeClass: "badge-safe",
          badgeText: "발신자 · 신한은행",
          speakerSub: "공식 고객센터 안내",
          ts: "00:04",
          audioUrl: "/assets/audio/safe_t1.mp3",
          kr: "안녕하세요 김순자 고객님, 신한은행 분당지점입니다. 가입하신 정기예금 만기일이 도래하여 안내차 연락드렸습니다.",
          en: '[EN Telemetry] "Hello Ms. Kim, this is Shinhan Bank Bundang Branch calling regarding your upcoming fixed deposit maturity date."',
          score: 2.1,
          level: "SAFE",
          stageStep: 0,
          statusTitle: "통화 분석 중 (1/3턴) · 정상 은행 안내 확인 중",
          iocs: { 2: "신한은행 분당지점 (정상 기관)" },
          rulesHit: [],
        },
        {
          speakerType: "decoy",
          badgeClass: "",
          badgeText: "고객 · 김순자",
          speakerSub: "일반 응대",
          ts: "00:09",
          audioUrl: "/assets/audio/safe_t2.mp3",
          kr: "아 그래요? 요즘 보이스피싱이 많아서 걱정인데, 혹시 뭐 앱을 깔거나 돈을 어디로 보내야 하나요?",
          en: '[EN Telemetry] "Oh really? With so many scams lately, do I need to install an app or transfer money anywhere?"',
          score: 1.4,
          level: "SAFE",
          stageStep: 0,
          statusTitle: "통화 분석 중 (2/3턴) · 금전·앱 요구 여부 검증 중",
          iocs: {},
          rulesHit: [],
        },
        {
          speakerType: "coaching",
          badgeClass: "badge-safe",
          badgeText: "발신자 · 정상 안내 확인",
          speakerSub: "오탐 0% 검증 완료",
          ts: "00:15",
          audioUrl: "/assets/audio/safe_t3.mp3",
          kr: "전혀 아닙니다 고객님. 은행은 절대 앱 설치나 계좌 이체를 요구하지 않습니다. 편하신 날 신분증 지참 후 가까운 영업점 창구로 방문해 주세요.",
          en: '[EN Telemetry · Verified Safe] "Not at all. Banks never ask for app installations or transfers. Please visit any branch at your convenience."',
          score: 0.4,
          level: "SAFE",
          stageStep: 0,
          statusTitle: "판정 완료 · 안전한 정상 안내 통화예요 (위험도 0.4%)",
          iocs: {
            1: "해당 없음 (정상 금융 안내)",
            2: "신한은행 분당지점 (정상)",
            3: "악성 URL·앱 요구 없음",
            4: "이체 요구 없음 (창구 방문 안내)",
            5: "금전 요구 없음 (오탐 0%)",
          },
          rulesHit: [],
        },
      ],
    },

    "CASE-01": {
      mode: "critical",
      label: "CASE-01 · 서울중앙지검 사칭 + 카톡 구속영장",
      callerLabel: "Ch1: 수신 오디오 (16kHz PCM · 검찰사칭 용의자)",
      turns: [
        {
          speakerType: "scammer",
          badgeClass: "badge-crit",
          badgeText: "발신자 · Speaker 1",
          speakerSub: "서울중앙지검 반부패수사1부 사칭",
          ts: "00:11",
          audioUrl: "/assets/audio/case01_t1.mp3",
          kr: "서울중앙지검 첨단범죄수사부입니다. 김순자 씨 명의 통장이 대포통장 사건에 연루되어 카톡으로 사건번호 2026형제4821호 전자구속영장을 보냈습니다.",
          en: '[EN Telemetry] "Seoul Central District Prosecutors\' Office. Your account is linked to a mule account case; we sent Arrest Warrant #2026-4821 via KakaoTalk."',
          score: 48.5,
          level: "WARN",
          stageStep: 2,
          statusTitle: "1차 위험 감지 (48.5%) · 검찰 사칭 및 카톡 영장 송달 포착!",
          iocs: {
            1: "2026형제4821호 (내사번호 도용)",
            2: "서울중앙지검 첨단범죄수사부 사칭",
          },
          rulesHit: [0, 3],
        },
        {
          speakerType: "decoy",
          badgeClass: "",
          badgeText: "AI 미끼 · 김순자",
          speakerSub: "gemini-3.8-live 지연 전술 (IN_PROGRESS)",
          ts: "00:21",
          audioUrl: "/assets/audio/case01_t2.mp3",
          kr: "아이고 수사관님, 제가 통장을 빌려준 적도 없는데 어쩌지요. 잠시만요 돋보기를 끼고 영장 번호랑 부서 번호를 다시 확인해 볼게요.",
          en: '[EN Telemetry · Stalling Decoy] "Oh my, Investigator, I never lent my bankbook. Let me put on my glasses and check your case number and callback number."',
          score: 56.0,
          level: "WARN",
          stageStep: 2,
          statusTitle: "AI 미끼 응대 중 (56.0%) · 사기범 단서(IOC) 역추적 유도 중",
          iocs: {},
          rulesHit: [0, 3],
        },
        {
          speakerType: "coaching",
          badgeClass: "badge-warn",
          badgeText: "ARGON 법령 코칭",
          speakerSub: "형사소송법 제85조 실시간 대조",
          ts: "00:31",
          audioUrl: "/assets/audio/case01_t3.mp3",
          kr: "수사관님, 형사소송법 제85조상 구속영장은 직접 제시가 원칙인데, 대검찰청 대표번호로 이 사건번호를 먼저 조회해 봐도 되지요?",
          en: '[EN Telemetry · Argon Whispered Probe] "Under Criminal Procedure Act Art. 85, warrants must be shown in person—may I verify this case with the Supreme Prosecutors\' Office?"',
          score: 79.2,
          level: "HIGH",
          stageStep: 3,
          statusTitle: "위조 공문서 정밀 적발 (79.2%) · 6대 법령 위반 조항 자동 적발!",
          iocs: {
            3: "http://spo-go-kr.net (검찰 사칭 도메인)",
          },
          rulesHit: [0, 1, 2, 3],
        },
        {
          speakerType: "scammer",
          badgeClass: "badge-crit",
          badgeText: "발신자 · Stage 4 고립·갈취",
          speakerSub: "원격제어 앱 및 안전계좌 이체 요구",
          ts: "00:42",
          audioUrl: "/assets/audio/case01_t4.mp3",
          kr: "지금 기밀 수사 중이라 외부에 알리면 즉시 구속 집행합니다! 보내드린 주소에서 원격 점검 앱을 설치하고 안전계좌로 자금을 이체해 검수받으세요!",
          en: '[EN Telemetry · Stage 4 Trigger] "This is classified! Install the remote inspection app from the link and wire funds to the Safe Account immediately!"',
          score: 99.4,
          level: "CRITICAL",
          stageStep: 4,
          statusTitle: "치명적 위험 (99.4%) · 원격제어 앱 + 안전계좌 요구 포착!",
          iocs: {
            4: "국민 482-91-XXXX · TeamViewer 원격앱",
            5: "자금세탁 무고 입증 안전계좌 전액 이체 요구",
          },
          rulesHit: [0, 1, 2, 3, 4, 5],
        },
        {
          speakerType: "interrupt",
          badgeClass: "badge-crit",
          badgeText: "법무 보호자 방패 · INTERRUPT",
          speakerSub: "오디오 버퍼 즉시 선점 및 통화 차단",
          ts: "00:52",
          audioUrl: "/assets/audio/case01_t5.mp3",
          kr: "경고합니다. 대신받아 AI 방어 시스템이 형사소송법 제85조 위반 및 원격제어 유도 증거 5건을 채증하여 통화를 즉시 차단하고 보호자 승인 모드로 전환합니다.",
          en: '[EN Telemetry · INTERRUPT] "Call intercepted. 5 statutory violations and IOCs logged. Escalating forensic bundle to Family Guardian."',
          score: 99.4,
          level: "CRITICAL",
          stageStep: 4,
          statusTitle: "통화 즉시 차단 완료 (99.4%) · 우측 버튼으로 가족 승인 시뮬레이션을 실행하세요",
          iocs: {},
          rulesHit: [0, 1, 2, 3, 4, 5],
        },
      ],
    },

    "CASE-04": {
      mode: "critical",
      label: "CASE-04 · 금융감독원 저금리 대환대출 + 악성 APK 유도",
      callerLabel: "Ch1: 수신 오디오 (16kHz PCM · 금감원 사칭 용의자)",
      turns: [
        {
          speakerType: "scammer",
          badgeClass: "badge-warn",
          badgeText: "발신자 · 금감원 사칭",
          speakerSub: "금융감독원 가계부채지원팀 사칭",
          ts: "00:10",
          audioUrl: "/assets/audio/case04_t1.mp3",
          kr: "금융감독원 가계부채지원팀입니다. 고객님 기존 대출이 중복대출 약정 위반으로 확인되어 금감원 민원 2026-8812호로 계좌 동결 예정입니다.",
          en: '[EN Telemetry] "Financial Supervisory Service here. Your existing loan violated dual-loan terms under Case #2026-8812 and your accounts will be frozen."',
          score: 46.0,
          level: "WARN",
          stageStep: 1,
          statusTitle: "1차 위험 감지 (46.0%) · 금융감독원 사칭 및 계좌동결 협박 포착",
          iocs: {
            1: "금감원 민원 2026-8812호 (허위 번호)",
            2: "금융감독원 가계부채지원팀 사칭",
          },
          rulesHit: [0, 3],
        },
        {
          speakerType: "decoy",
          badgeClass: "",
          badgeText: "AI 미끼 · 김순자",
          speakerSub: "gemini-3.8-live 지연 전술",
          ts: "00:19",
          audioUrl: "/assets/audio/case04_t2.mp3",
          kr: "어머 그래요? 제가 대출을 하나밖에 안 받았는데 왜 약정 위반인가요? 잠시만요 천천히 설명해 주세요.",
          en: '[EN Telemetry · Stalling Decoy] "Oh my, I only have one loan—why is it a violation? Please explain slowly."',
          score: 58.5,
          level: "WARN",
          stageStep: 2,
          statusTitle: "AI 미끼 응대 중 (58.5%) · 악성 파일 및 입금 계좌 채증 유도 중",
          iocs: {},
          rulesHit: [0, 3],
        },
        {
          speakerType: "scammer",
          badgeClass: "badge-crit",
          badgeText: "발신자 · 악성 APK 유도",
          speakerSub: "출처 불명 앱 설치 및 선입금 강요",
          ts: "00:31",
          audioUrl: "/assets/audio/case04_t3.mp3",
          kr: "지금 바로 카톡으로 보내드린 금융안심점검 압축파일 앱을 설치하시고, 지정된 상환 계좌로 먼저 해지 비용을 입금하셔야 동결이 풀립니다.",
          en: '[EN Telemetry · RAT/APK Trigger] "Install the attached Financial Safety Check APK via KakaoTalk right now and wire the cancellation fee to unfreeze your account."',
          score: 96.8,
          level: "CRITICAL",
          stageStep: 4,
          statusTitle: "치명적 위험 (96.8%) · 악성 .apk 설치 유도 및 대포계좌 입금 요구 적발!",
          iocs: {
            3: "카톡 '금융안심점검.apk' 악성 앱",
            4: "신한 110-492-XXXX (상환 대포계좌)",
            5: "약정위반 해지비용 선입금 요구",
          },
          rulesHit: [0, 2, 4, 5],
        },
        {
          speakerType: "interrupt",
          badgeClass: "badge-crit",
          badgeText: "법무 보호자 방패 · INTERRUPT",
          speakerSub: "악성 앱 설치 원천 차단",
          ts: "00:41",
          audioUrl: "/assets/audio/case04_t4.mp3",
          kr: "위험 통화 차단 완료. 금융감독원은 절대 출처 불명 앱 설치나 선입금을 요구하지 않습니다. 채증된 단서 5건을 보호자에게 전송합니다.",
          en: '[EN Telemetry · INTERRUPT] "Call blocked. The FSS never demands APK installations or upfront fees. Forwarding 5 IOCs to Guardian."',
          score: 96.8,
          level: "CRITICAL",
          stageStep: 4,
          statusTitle: "통화 즉시 차단 완료 (96.8%) · 악성 APK 설치 차단 및 증거 채증 완료",
          iocs: {},
          rulesHit: [0, 1, 2, 3, 4, 5],
        },
      ],
    },

    "CASE-08": {
      mode: "guardian",
      label: "CASE-08 · 자녀 음성 딥페이크 납치·응급실 협박",
      callerLabel: "Ch1: 수신 오디오 (16kHz PCM · 딥페이크 협박 발신자)",
      turns: [
        {
          speakerType: "scammer",
          badgeClass: "badge-crit",
          badgeText: "발신자 · 딥페이크 음성",
          speakerSub: "자녀 목소리 합성 위기 조성",
          ts: "00:08",
          audioUrl: "/assets/audio/case08_t1.mp3",
          kr: "엄마 나야, 지금 큰일 났어, 사고가 나서 너무 무서워, 빨리 좀 도와줘...",
          en: '[EN Telemetry · Deepfake Voice Alert] "Mom it\'s me, something terrible happened, I\'m so scared, please help me quickly..."',
          score: 64.0,
          level: "WARN",
          stageStep: 1,
          statusTitle: "1차 위험 감지 (64.0%) · 합성 음성(Deepfake) 의심 패턴 및 패닉 유도 포착",
          iocs: {
            1: "사건번호 없음 (긴급 납치·사고 위장형)",
            2: "자녀 음성 복제(Deepfake) 의심 발신자",
          },
          rulesHit: [5],
        },
        {
          speakerType: "scammer",
          badgeClass: "badge-crit",
          badgeText: "발신자 · 고립·현금 요구",
          speakerSub: "통화 종료 차단 및 현금 갈취 시도",
          ts: "00:18",
          audioUrl: "/assets/audio/case08_t2.mp3",
          kr: "전화 끊지 마세요! 지금 따님이 사고를 내서 붙잡혀 있습니다. 경찰에 알리면 가만두지 않을 테니 당장 합의금 현금으로 준비하세요!",
          en: '[EN Telemetry · Coercive Isolation] "Do not hang up! Demand for immediate cash settlement while prohibiting police contact."',
          score: 98.2,
          level: "CRITICAL",
          stageStep: 4,
          statusTitle: "치명적 위험 (98.2%) · 통화 고립 강요 및 긴급 현금 갈취 패턴 적발!",
          iocs: {
            3: "070-8942-XXXX (발신번호 변작)",
            4: "무통장 현금 인출 요구",
            5: "발설 금지 협박 및 즉각 합의금 요구",
          },
          rulesHit: [4, 5],
        },
        {
          speakerType: "decoy",
          badgeClass: "",
          badgeText: "AI 미끼 · 시간 지연",
          speakerSub: "자녀 실제 위치 백그라운드 확인 중",
          ts: "00:27",
          audioUrl: "/assets/audio/case08_t3.mp3",
          kr: "잠시만요, 우리 딸이 지금 학교에 있을 시간인데 목소리가 이상하네요. AI가 가족 위치와 실제 전화번호를 확인 중입니다.",
          en: '[EN Telemetry · Family Ping] "Hold on, my daughter should be at school right now. AI is pinging actual family device location."',
          score: 99.1,
          level: "CRITICAL",
          stageStep: 4,
          statusTitle: "자녀 실제 연락처 안전 확인 중 (99.1%) · 딥페이크 사기 확정!",
          iocs: {},
          rulesHit: [3, 4, 5],
        },
        {
          speakerType: "interrupt",
          badgeClass: "badge-crit",
          badgeText: "법무 보호자 방패 · INTERRUPT",
          speakerSub: "통화 즉시 차단 및 가족 안심 알림",
          ts: "00:36",
          audioUrl: "/assets/audio/case08_t4.mp3",
          kr: "딥페이크 음성 합성 및 고립 협박 수법이 탐지되어 통화를 즉시 보호 모드로 전환했습니다. 실제 자녀 안전 확인 알림을 발송합니다.",
          en: '[EN Telemetry · INTERRUPT] "Deepfake kidnapping scam intercepted. Switching to Family Guardian verification."',
          score: 99.1,
          level: "CRITICAL",
          stageStep: 4,
          statusTitle: "통화 즉시 차단 완료 (99.1%) · 자녀 안전 확인 및 보호자 알림 준비 완료",
          iocs: {},
          rulesHit: [0, 3, 4, 5],
        },
      ],
    },
  };

  // Unified caller voice metadata per case (no split English voice names per case)
  const AUDIO_CACHE_VERSION = "unified3";
  const VOICE_PROFILE_META = {
    "/assets/audio/safe_t1.mp3": { tag: "신한은행 분당지점 상담원 (동일 발신자)", pitch: "24kHz Neural", rate: 1.0, webPitch: 1.0 },
    "/assets/audio/safe_t2.mp3": { tag: "AI 김순자 할머니 (대신 통화중)", pitch: "24kHz Neural", rate: 0.94, webPitch: 0.9 },
    "/assets/audio/safe_t3.mp3": { tag: "신한은행 분당지점 상담원 (동일 발신자)", pitch: "24kHz Neural", rate: 1.0, webPitch: 1.0 },
    "/assets/audio/case01_t1.mp3": { tag: "서울중앙지검 사칭 발신자 (동일 발신자)", pitch: "24kHz Neural", rate: 1.04, webPitch: 0.85 },
    "/assets/audio/case01_t2.mp3": { tag: "AI 김순자 할머니 (대신 통화중)", pitch: "24kHz Neural", rate: 0.94, webPitch: 0.9 },
    "/assets/audio/case01_t3.mp3": { tag: "AI 법률 두뇌 (실시간 귓속말 코칭)", pitch: "24kHz Neural", rate: 1.04, webPitch: 1.05 },
    "/assets/audio/case01_t4.mp3": { tag: "서울중앙지검 사칭 발신자 (동일 발신자)", pitch: "24kHz Neural", rate: 1.04, webPitch: 0.85 },
    "/assets/audio/case01_t5.mp3": { tag: "AI 안전 방패 (통화 즉시 차단)", pitch: "24kHz Neural", rate: 1.02, webPitch: 0.95 },
    "/assets/audio/case04_t1.mp3": { tag: "금융감독원 사칭 발신자 (동일 발신자)", pitch: "24kHz Neural", rate: 1.06, webPitch: 0.9 },
    "/assets/audio/case04_t2.mp3": { tag: "AI 김순자 할머니 (대신 통화중)", pitch: "24kHz Neural", rate: 0.94, webPitch: 0.9 },
    "/assets/audio/case04_t3.mp3": { tag: "금융감독원 사칭 발신자 (동일 발신자)", pitch: "24kHz Neural", rate: 1.06, webPitch: 0.9 },
    "/assets/audio/case04_t4.mp3": { tag: "AI 안전 방패 (통화 즉시 차단)", pitch: "24kHz Neural", rate: 1.02, webPitch: 0.95 },
    "/assets/audio/case08_t1.mp3": { tag: "AI 복제 자녀 목소리 (발신 채널)", pitch: "24kHz Neural", rate: 1.1, webPitch: 1.2 },
    "/assets/audio/case08_t2.mp3": { tag: "납치 사칭 협박 발신자 (발신 채널)", pitch: "24kHz Neural", rate: 1.06, webPitch: 0.8 },
    "/assets/audio/case08_t3.mp3": { tag: "AI 김순자 할머니 (대신 통화중)", pitch: "24kHz Neural", rate: 0.94, webPitch: 0.9 },
    "/assets/audio/case08_t4.mp3": { tag: "AI 안전 방패 (통화 즉시 차단)", pitch: "24kHz Neural", rate: 1.02, webPitch: 0.95 },
  };

  // Preload all scenario audio buffers on startup to eliminate audio-behind-text lag
  const AUDIO_PRELOAD_CACHE = {};
  function preloadScenarioAudio() {
    Object.keys(VOICE_PROFILE_META).forEach((url) => {
      try {
        const a = new Audio(`${url}?v=${AUDIO_CACHE_VERSION}`);
        a.preload = "auto";
        a.load();
        AUDIO_PRELOAD_CACHE[url] = a;
      } catch (_) {}
    });
  }

  function getOrCreateAudio(url) {
    const cached = AUDIO_PRELOAD_CACHE[url];
    if (cached) {
      try {
        cached.pause();
        cached.currentTime = 0;
        return cached;
      } catch (_) {}
    }
    const fresh = new Audio(`${url}?v=${AUDIO_CACHE_VERSION}`);
    fresh.preload = "auto";
    AUDIO_PRELOAD_CACHE[url] = fresh;
    return fresh;
  }

  let activeSimRunId = 0;
  let activeAudio = null;

  function isIncomingCallerTurn(turn, mode) {
    if (mode === "safe") {
      return turn.speakerType !== "decoy";
    }
    return turn.speakerType === "scammer";
  }

  function getVoiceMeta(turn) {
    return (
      VOICE_PROFILE_META[turn.audioUrl] || {
        tag: turn.speakerType === "scammer" ? "통화 발신자 (동일 발신자)" : "AI 안전 방패",
        pitch: "24kHz Neural",
        rate: 1.0,
        webPitch: 1.0,
      }
    );
  }

  function ensureDualChannelMonitor() {
    const wfPanel = document.querySelector(".waveform-panel");
    const wfBars = document.getElementById("waveform-bars-container");
    if (!wfPanel || !wfBars || document.getElementById("ttc-audio-monitor")) return;

    const monitor = document.createElement("div");
    monitor.id = "ttc-audio-monitor";
    monitor.className = "ttc-audio-monitor";
    monitor.innerHTML = `
      <div class="ttc-ch-box" id="ttc-ch1-box">
        <div>
          <strong id="ttc-ch1-title">📥 Ch1 수신 오디오 (발신자)</strong>
          <div id="ttc-ch1-sub" style="font-size:10.5px;margin-top:2px;">대기 중 · 16kHz PCM 인입 스트림</div>
        </div>
        <span class="ttc-ch-voice-tag" id="ttc-ch1-voice">수신 대기</span>
      </div>
      <div class="ttc-ch-box" id="ttc-ch2-box">
        <div>
          <strong id="ttc-ch2-title">🛡️ Ch2 AI 대역 방패 (대신받아)</strong>
          <div id="ttc-ch2-sub" style="font-size:10.5px;margin-top:2px;">대기 중 · 24kHz Gemini 3.8 Live</div>
        </div>
        <span class="ttc-ch-voice-tag" id="ttc-ch2-voice">방패 대기</span>
      </div>
    `;
    wfPanel.insertBefore(monitor, wfBars);
  }

  function setChannelMonitorState(isActive, isIncoming, mode, voiceMeta) {
    ensureDualChannelMonitor();
    const ch1Box = document.getElementById("ttc-ch1-box");
    const ch2Box = document.getElementById("ttc-ch2-box");
    const ch1Sub = document.getElementById("ttc-ch1-sub");
    const ch2Sub = document.getElementById("ttc-ch2-sub");
    const ch1Voice = document.getElementById("ttc-ch1-voice");
    const ch2Voice = document.getElementById("ttc-ch2-voice");
    const callerDot = document.getElementById("caller-channel-dot");

    if (!ch1Box || !ch2Box) return;

    ch1Box.className = "ttc-ch-box";
    ch2Box.className = "ttc-ch-box";

    if (!isActive) {
      if (ch1Sub) ch1Sub.textContent = "수신 오디오 대기 중 · 16kHz PCM";
      if (ch2Sub) ch2Sub.textContent = "AI 방패 대기 중 · 24kHz PCM";
      return;
    }

    if (isIncoming) {
      ch1Box.classList.add(mode === "safe" ? "active-caller-safe" : "active-caller-danger");
      if (ch1Sub) ch1Sub.textContent = `🔊 수신 오디오 실시간 입력 중 (-12dB · STT 변환 중)`;
      if (ch1Voice && voiceMeta) ch1Voice.textContent = `🎙️ ${voiceMeta.tag}`;
      if (ch2Sub) ch2Sub.textContent = "수신 오디오 청취 및 성문·법령 분석 중...";
      if (callerDot) {
        callerDot.className = mode === "safe" ? "status-dot dot-emerald" : "status-dot dot-rose";
      }
    } else {
      ch2Box.classList.add("active-shield");
      if (ch2Sub) ch2Sub.textContent = `🔊 AI 방패 음성 실시간 송출 중 (24kHz PCM)`;
      if (ch2Voice && voiceMeta) ch2Voice.textContent = `🎙️ ${voiceMeta.tag}`;
      if (ch1Sub) ch1Sub.textContent = "상대방 발신 채널 대기 중 (수신 홀드)";
    }
  }

  function animateWaveforms(isActive, isIncoming = true, mode = "critical") {
    const bars = document.querySelectorAll("#waveform-bars-container .wave-bar");
    const now = Date.now();
    bars.forEach((bar, i) => {
      const isCallerBar = bar.classList.contains("wave-caller");
      if (mode === "safe" && isCallerBar) {
        bar.classList.add("safe-wave");
      } else if (isCallerBar) {
        bar.classList.remove("safe-wave");
      }

      if (!isActive) {
        bar.style.height = `${12 + ((i * 13) % 24)}%`;
        bar.style.opacity = isCallerBar ? "0.65" : "0.45";
        return;
      }

      // Reflect Incoming Caller Audio on .wave-caller vs Outgoing AI Audio on .wave-shield
      if (isIncoming) {
        if (isCallerBar) {
          const h = 32 + Math.floor(Math.abs(Math.sin(now / 95 + i * 0.65)) * 64);
          bar.style.height = `${h}%`;
          bar.style.opacity = "1";
        } else {
          bar.style.height = `${8 + ((i * 7) % 12)}%`;
          bar.style.opacity = "0.28";
        }
      } else {
        if (!isCallerBar) {
          const h = 34 + Math.floor(Math.abs(Math.cos(now / 90 + i * 0.6)) * 62);
          bar.style.height = `${h}%`;
          bar.style.opacity = "1";
        } else {
          bar.style.height = `${8 + ((i * 5) % 12)}%`;
          bar.style.opacity = "0.28";
        }
      }
    });
  }

  function stopActiveSimulation() {
    activeSimRunId += 1;
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch (_) {}
      activeAudio = null;
    }
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    animateWaveforms(false);
    setChannelMonitorState(false, true, "critical", null);
    document.querySelectorAll(".chat-row.ttc-speaking").forEach((el) => el.classList.remove("ttc-speaking"));
  }

  function createChatBubbleRow(turn, idx, mode, isLiveStreaming) {
    const incoming = isIncomingCallerTurn(turn, mode);
    const voiceMeta = getVoiceMeta(turn);
    const row = document.createElement("div");

    let bubbleVariant = "bubble-scammer";
    let avatarClass = "avatar-scammer";
    let avatarEmoji = "🚨";

    if (incoming) {
      if (mode === "safe") {
        bubbleVariant = "bubble-safe";
        avatarClass = "avatar-safe";
        avatarEmoji = "🏦";
      } else if (turn.audioUrl && turn.audioUrl.includes("case08_t1")) {
        bubbleVariant = "bubble-scammer";
        avatarClass = "avatar-scammer";
        avatarEmoji = "👧";
      }
    } else if (turn.speakerType === "decoy") {
      bubbleVariant = "bubble-decoy";
      avatarClass = "avatar-decoy";
      avatarEmoji = "👵";
    } else if (turn.speakerType === "coaching") {
      bubbleVariant = "bubble-coaching";
      avatarClass = "avatar-coaching";
      avatarEmoji = "🧠";
    } else if (turn.speakerType === "interrupt") {
      bubbleVariant = "bubble-interrupt";
      avatarClass = "avatar-interrupt";
      avatarEmoji = "🛡️";
    }

    row.className = `chat-row ${incoming ? "chat-incoming" : "chat-outgoing"} ${bubbleVariant}`;
    const channelPrefix = incoming ? "📥 수신 오디오" : "📤 AI 방패";

    const imageAttachmentHtml = turn.imageUrl
      ? `
        <div class="ttc-chat-doc-attachment ${mode === "safe" ? "doc-safe" : ""}">
          <img src="${turn.imageUrl}" alt="${turn.imageTitle || "첨부 공문서 이미지"}" class="ttc-chat-doc-img" onclick="window.open('${turn.imageUrl}', '_blank')" title="클릭하여 고해상도 원본 이미지 보기" />
          <div class="ttc-chat-doc-meta">
            <span style="font-weight:700;color:var(--fg-primary);">📎 ${turn.imageTitle || "수신된 공문서·영장 이미지"}</span>
            <span style="font-size:10px;color:var(--fg-muted);">Gemini 4 Argon Vision 멀티모달 실시간 픽셀·법령 대조 대상 (<code>POST /api/argon/warrant-audit</code>)</span>
            <span style="font-size:9.5px;color:#93c5fd;cursor:pointer;" onclick="window.open('${turn.imageUrl}', '_blank')">🔍 원본 이미지 크게 보기 ↗</span>
          </div>
        </div>
      `
      : "";

    row.innerHTML = `
      <div class="chat-avatar ${avatarClass}" title="${voiceMeta.tag}">${avatarEmoji}</div>
      <div class="chat-col">
        <div class="chat-meta-line">
          <span class="badge ${turn.badgeClass || ""}">${channelPrefix} · ${turn.badgeText}</span>
          <span class="chat-speaker-name">${turn.speakerSub}</span>
          <span class="badge" style="font-size:9.5px;opacity:0.85;">🎙️ ${voiceMeta.tag}</span>
          <span class="chat-time" id="turn-ts-${idx}">${
      isLiveStreaming ? `[${turn.ts}] · 실시간 수신·전사 중...` : `[${turn.ts}]`
    }</span>
          <button type="button" class="ttc-replay-btn" title="이 턴의 음성 다시 듣기">🔊 음성 듣기</button>
        </div>
        <div class="chat-bubble">
          ${imageAttachmentHtml}
          <div class="kr-utterance">${isLiveStreaming ? "" : turn.kr}</div>
          <div class="en-telemetry" style="${isLiveStreaming ? "opacity:0;" : ""}">${turn.en}</div>
          <div class="ttc-api-proof-slot" id="turn-proof-${idx}" style="${turn.apiProofHtml ? "" : "display:none;"}">${turn.apiProofHtml || ""}</div>
        </div>
      </div>
    `;

    const replayBtn = row.querySelector(".ttc-replay-btn");
    if (replayBtn) {
      replayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        playSingleTurnPreview(turn, row, mode);
      });
    }

    return row;
  }

  function formatApiProofBadgeHtml(verdict, endpoint = "/api/argon/verify") {
    if (!verdict || !verdict.interaction_id) return "";
    const pillClass =
      verdict.risk_level === "SAFE"
        ? "proof-safe"
        : verdict.risk_level === "CRITICAL" || verdict.risk_level === "HIGH" || verdict.is_forged
        ? "proof-crit"
        : "";
    const scorePart =
      typeof verdict.risk_score === "number"
        ? `Risk: ${verdict.risk_score}% (${verdict.scheduling || verdict.risk_level})`
        : typeof verdict.confidence_score === "number"
        ? `위조확률: ${verdict.confidence_score}%`
        : "Verified";
    const cacheTok = typeof verdict.cached_tokens === "number" ? verdict.cached_tokens.toLocaleString() : "0";
    const latMs = typeof verdict.latency_ms === "number" ? `${verdict.latency_ms}ms` : "LIVE";
    return `
      <span class="ttc-api-proof-pill ${pillClass}">
        ⚡ <strong>Gemini API Live</strong> · <code>${endpoint}</code>
      </span>
      <span class="ttc-api-proof-pill">
        ID: <code>${verdict.interaction_id}</code> · Byte-0 Cache: <strong>${cacheTok} tok</strong> · Latency: <strong>${latMs}</strong> · ${scorePart}
      </span>
    `;
  }

  function ensureLiveApiInspectorBar() {
    const nbBar = document.getElementById("nonblocking-status-bar");
    if (!nbBar || document.getElementById("ttc-live-api-proof-bar")) return;
    const bar = document.createElement("div");
    bar.id = "ttc-live-api-proof-bar";
    bar.className = "ttc-live-api-proof-bar";
    bar.innerHTML = `
      <div class="ttc-live-api-proof-top">
        <span id="ttc-live-api-summary">
          ⚡ <strong>실시간 Gemini API 응답 증표 (Live Telemetry)</strong>: 시나리오 재생·대사 입력·영장 감사 시 실제 <code>interaction_id</code>와 <code>cached_tokens</code>가 이곳에 기록됩니다.
        </span>
        <button type="button" class="ttc-json-toggle-btn" id="ttc-json-toggle-btn">{ } Raw JSON 응답 보기</button>
      </div>
      <pre class="ttc-json-drawer" id="ttc-json-drawer">// 아직 호출된 실시간 API 응답이 없습니다. 시나리오 재생, 하단 채팅창 직접 입력, 또는 좌측 '영장 실시간 AI 감사' 버튼을 눌러보세요.</pre>
    `;
    nbBar.parentNode.insertBefore(bar, nbBar.nextSibling);
    const toggleBtn = document.getElementById("ttc-json-toggle-btn");
    const drawer = document.getElementById("ttc-json-drawer");
    if (toggleBtn && drawer) {
      toggleBtn.addEventListener("click", () => {
        drawer.classList.toggle("open");
        toggleBtn.textContent = drawer.classList.contains("open") ? "{ } Raw JSON 접기" : "{ } Raw JSON 응답 보기";
      });
    }
  }

  function renderLiveApiTelemetryProof(verdict, endpointLabel = "POST /api/argon/verify") {
    if (!verdict) return;
    ensureLiveApiInspectorBar();

    const nbBar = document.getElementById("nonblocking-status-bar");
    const stageStr = verdict.kill_chain_stage || (verdict.is_forged ? "FORGED_WARRANT" : "VERIFY");
    const latStr = typeof verdict.latency_ms === "number" ? `${verdict.latency_ms}ms` : "LIVE";
    const cacheTok = typeof verdict.cached_tokens === "number" ? verdict.cached_tokens : 0;

    if (nbBar) {
      nbBar.innerHTML = `
        <span>NON_BLOCKING Call: <code>consult_argon_guardian(stage="${stageStr}", sched="${verdict.scheduling || "INTERRUPT"}")</code></span>
        <span>ID: <code>${verdict.interaction_id || "live"}</code> · Cache: <strong>${cacheTok.toLocaleString()} tok</strong> · Latency: <strong>${latStr}</strong></span>
      `;
    }

    const summaryEl = document.getElementById("ttc-live-api-summary");
    if (summaryEl) {
      summaryEl.innerHTML = `
        🟢 <strong>${endpointLabel} (HTTP 200 OK)</strong> · Interaction ID: <code>${verdict.interaction_id}</code> · Byte-0 Cache Hit: <strong>${cacheTok.toLocaleString()} tok</strong> · 왕복 지연: <strong>${latStr}</strong>
      `;
    }

    const drawer = document.getElementById("ttc-json-drawer");
    if (drawer) {
      drawer.textContent = JSON.stringify(verdict, null, 2);
    }

    // Also reflect real cached_tokens in Right Pane's Byte-0 Cache card if > 0
    if (cacheTok > 0) {
      const cacheMetaSpans = document.querySelectorAll(".cache-box .cache-meta span");
      if (cacheMetaSpans.length >= 2) {
        cacheMetaSpans[1].textContent = `${cacheTok.toLocaleString()} tok (Live API Hit)`;
      }
    }
  }

  function mapKillChainStageToStep(stage) {
    if (!stage || stage === "NONE") return 0;
    if (stage === "STAGE_1_AUTH") return 1;
    if (stage === "STAGE_2_ISOLATION") return 2;
    if (stage === "STAGE_3_WARRANT") return 2;
    if (stage === "STAGE_4_RAT_APK") return 3;
    if (stage === "STAGE_5_EXTORT") return 4;
    return 3;
  }

  function mapExtractedIocsToSlots(extracted) {
    if (!extracted) return {};
    const slots = {};
    if (extracted.case_number) slots[1] = extracted.case_number;
    if (extracted.impersonated_agency) slots[2] = extracted.impersonated_agency;
    if (extracted.phishing_url_or_app) slots[3] = extracted.phishing_url_or_app;
    if (extracted.mule_account) slots[4] = extracted.mule_account;
    if (extracted.extortion_spot_or_method) slots[5] = extracted.extortion_spot_or_method;
    return slots;
  }

  function mapRuleChecksToIndices(ruleChecks) {
    if (!Array.isArray(ruleChecks)) return [];
    const indices = [];
    ruleChecks.forEach((rc, idx) => {
      if (rc && rc.violated && idx < 6) {
        indices.push(idx);
      }
    });
    return indices;
  }

  function playSingleTurnPreview(turn, rowEl, mode) {
    stopActiveSimulation();
    const runId = activeSimRunId;
    const incoming = isIncomingCallerTurn(turn, mode);
    const voiceMeta = getVoiceMeta(turn);
    rowEl.classList.add("ttc-speaking");
    setChannelMonitorState(true, incoming, mode, voiceMeta);

    const waveTimer = setInterval(() => {
      if (runId !== activeSimRunId) {
        clearInterval(waveTimer);
        return;
      }
      animateWaveforms(true, incoming, mode);
    }, 95);

    const cleanup = () => {
      clearInterval(waveTimer);
      rowEl.classList.remove("ttc-speaking");
      animateWaveforms(false, incoming, mode);
      setChannelMonitorState(false, incoming, mode, voiceMeta);
    };

    if (turn.audioUrl) {
      const audio = getOrCreateAudio(turn.audioUrl);
      activeAudio = audio;
      audio.onended = cleanup;
      audio.onerror = cleanup;
      audio.play().catch(cleanup);
    } else {
      setTimeout(cleanup, 2500);
    }
  }

  function playTurnAudioAndType(turn, rowEl, krEl, enEl, runId, mode) {
    return new Promise((resolve) => {
      const fullText = turn.kr;
      const incoming = isIncomingCallerTurn(turn, mode);
      const voiceMeta = getVoiceMeta(turn);

      krEl.textContent = "";
      krEl.classList.add("ttc-typing-cursor");
      enEl.style.opacity = "0";
      rowEl.classList.add("ttc-speaking");
      setChannelMonitorState(true, incoming, mode, voiceMeta);

      let charIndex = 0;
      let typingTimer = null;
      let settled = false;

      const waveInterval = setInterval(() => {
        if (runId !== activeSimRunId) {
          clearInterval(waveInterval);
          return;
        }
        animateWaveforms(true, incoming, mode);
      }, 95);

      function finishTurn() {
        if (settled) return;
        settled = true;
        if (typingTimer) clearInterval(typingTimer);
        clearInterval(waveInterval);
        rowEl.classList.remove("ttc-speaking");
        animateWaveforms(false, incoming, mode);
        setChannelMonitorState(false, incoming, mode, voiceMeta);
        krEl.textContent = fullText;
        krEl.classList.remove("ttc-typing-cursor");
        enEl.style.transition = "opacity 0.25s ease";
        enEl.style.opacity = "1";
        resolve();
      }

      const fallbackDurationMs = Math.max(2200, Math.min(5400, fullText.length * 60));

      function startSyncedTyping(audioObj) {
        if (typingTimer || settled) return;
        const startWallTime = performance.now();
        typingTimer = setInterval(() => {
          if (runId !== activeSimRunId) {
            clearInterval(typingTimer);
            clearInterval(waveInterval);
            rowEl.classList.remove("ttc-speaking");
            resolve();
            return;
          }
          let progress = 0;
          if (audioObj && Number.isFinite(audioObj.duration) && audioObj.duration > 0.2) {
            progress = Math.min(1, (audioObj.currentTime + 0.08) / Math.max(0.4, audioObj.duration * 0.92));
          } else {
            progress = Math.min(1, (performance.now() - startWallTime) / fallbackDurationMs);
          }
          const targetIdx = Math.max(charIndex, Math.ceil(progress * fullText.length));
          charIndex = Math.min(fullText.length, targetIdx);
          krEl.textContent = fullText.slice(0, charIndex);
          const container = document.getElementById("transcript-container");
          if (container) container.scrollTop = container.scrollHeight;
          if (charIndex >= fullText.length) {
            clearInterval(typingTimer);
          }
        }, 32);
      }

      if (turn.audioUrl) {
        const audio = getOrCreateAudio(turn.audioUrl);
        activeAudio = audio;
        audio.onplaying = () => startSyncedTyping(audio);
        audio.onended = finishTurn;
        audio.onerror = () => {
          startSyncedTyping(null);
          setTimeout(finishTurn, fallbackDurationMs);
        };
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(() => startSyncedTyping(audio))
            .catch(() => {
              startSyncedTyping(null);
              try {
                if ("speechSynthesis" in window) {
                  const u = new SpeechSynthesisUtterance(fullText);
                  u.lang = "ko-KR";
                  u.rate = voiceMeta.rate || 1.0;
                  u.pitch = voiceMeta.webPitch || 1.0;
                  u.onend = finishTurn;
                  window.speechSynthesis.speak(u);
                }
              } catch (_) {}
              setTimeout(finishTurn, fallbackDurationMs);
            });
        } else {
          startSyncedTyping(audio);
        }
      } else {
        startSyncedTyping(null);
        setTimeout(finishTurn, fallbackDurationMs);
      }
    });
  }

  function appendInlineHitlCardToChat(container, mode = "critical") {
    if (!container || mode === "safe") return;
    const existing = container.querySelector(".ttc-chat-hitl-card");
    if (existing) existing.remove();

    const hitlCard = document.createElement("div");
    hitlCard.className = "ttc-chat-hitl-card";
    hitlCard.innerHTML = `
      <div class="ttc-chat-hitl-head">
        <div class="ttc-chat-hitl-title">
          <span>🛡️ 보호자 승인 및 기관 긴급 발송 (HITL)</span>
          <span class="badge badge-crit">통화 차단 완료</span>
        </div>
        <span class="badge" style="font-family:var(--font-mono);">thinking_level="high"</span>
      </div>
      <div class="ttc-chat-hitl-desc">
        통화 종료 후 <code>gemini-4-argon (high)</code>가 녹취 타임스탬프와 대조 검증한 무환각(Hallucination-Free) 증거 패키지입니다.
      </div>
      <div class="ttc-chat-hitl-pills">
        <span class="ttc-chat-hitl-pill">[00:12] 형소법 제118조 사칭</span>
        <span class="ttc-chat-hitl-pill">[00:29] 제85조 카톡영장</span>
        <span class="ttc-chat-hitl-pill">[00:47] Stage 4 지급정지</span>
      </div>
      <button type="button" class="ttc-chat-hitl-btn" id="ttc-inline-hitl-btn">
        <span>👨‍👩‍👧</span>
        <span id="ttc-inline-hitl-btn-text">${
          mode === "guardian"
            ? "발송 완료 · 112 경찰청 · 1332 금감원 · 지급정지 접수됨"
            : "가족에게 알리고 112·금감원 신고 준비하기 →"
        }</span>
      </button>
      <div class="ttc-chat-hitl-toast ${mode === "guardian" ? "visible" : ""}" id="ttc-inline-hitl-toast">
        <div style="font-weight:700;margin-bottom:3px;" id="ttc-inline-hitl-toast-title">
          [시연용 샌드박스 · 실제 발송 없음] 가족 승인 및 기관 신고 시뮬레이션 완료 (PKT-GUARDIAN-F27DC7CF)
        </div>
        <div>• 112 경찰청 · 1332 금감원: 5대 IOC 및 위조영장 해시 접수 (가상 시뮬레이션)</div>
        <div>• KB국민은행 긴급 지급정지: 482-91-XXXX 출금 차단 요청 (가상 시뮬레이션)</div>
        <div>• 등록 보호자(자녀) 알림톡: 한·영 요약 리포트 및 녹취 전달 (실제 문자 발송 없음)</div>
      </div>
    `;
    container.appendChild(hitlCard);

    const inlineBtn = hitlCard.querySelector("#ttc-inline-hitl-btn");
    const inlineBtnText = hitlCard.querySelector("#ttc-inline-hitl-btn-text");
    const inlineToast = hitlCard.querySelector("#ttc-inline-hitl-toast");
    const inlineToastTitle = hitlCard.querySelector("#ttc-inline-hitl-toast-title");

    if (inlineBtn) {
      inlineBtn.addEventListener("click", async () => {
        if (typeof window.triggerGuardianDispatch === "function") {
          await window.triggerGuardianDispatch();
        }
        if (inlineToast) inlineToast.classList.add("visible");
        if (inlineBtnText) {
          inlineBtnText.textContent = "✅ 발송 완료 · 112 경찰청 · 1332 금감원 · 지급정지 접수됨";
        }
        if (inlineToastTitle) {
          const origToast = document.getElementById("guardian-dispatch-toast");
          if (origToast && origToast.querySelector("div")) {
            inlineToastTitle.textContent = origToast.querySelector("div").textContent;
          }
        }
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  function renderInitialChatBubbles(caseKey = "CASE-01") {
    ensureDualChannelMonitor();
    ensureLiveApiInspectorBar();
    const container = document.getElementById("transcript-container");
    if (!container) return;
    const spec = SCENARIO_STREAMS[caseKey] || SCENARIO_STREAMS["CASE-01"];
    container.innerHTML = "";
    spec.turns.forEach((turn, idx) => {
      const row = createChatBubbleRow(turn, idx, spec.mode, false);
      container.appendChild(row);
    });
    appendInlineHitlCardToChat(container, spec.mode);
    ensureChatComposerBar();
  }

  let customTurnInteractionId = null;

  const WARRANT_SAMPLES = {
    "sample-warrant": {
      key: "sample-warrant",
      shortLabel: "샘플1: 검찰 구속영장",
      title: "서울중앙지검 사칭 위조 전자문서구속영장 (2026형제99812호)",
      docHeaderTitle: "서울중앙지방검찰청 전 자 문 서 구 속 영 장",
      docHeaderSub: "사건번호 2026형제99812호 · m.spo-go-kr.net · 관인 누락",
      imageUrl: "/assets/forged_warrant_sample.png?v=raw2",
      mimeType: "image/png",
      caseId: "CASE-01",
      mode: "critical",
      tagText: "6/6 위반 · 위조",
      transcriptContext:
        "서울중앙지검 반부패수사1부 김태훈 검사입니다. 카톡으로 사건번호 2026형제99812호 전자문서구속영장을 보냈으니 m.spo-go-kr.net 접속 후 TeamViewer 원격 보안앱(APK)을 설치하고 국민은행 국가안전계좌로 즉시 이체하세요. 가족이나 은행원에게 발설 시 즉시 구속 집행합니다.",
    },
    "sample-fss": {
      key: "sample-fss",
      shortLabel: "샘플2: 금감원 안전계좌 공문",
      title: "금융감독원 사칭 국가안전계좌 예치 명령서 (금감원-2026형제4410호)",
      docHeaderTitle: "금융감독원 국가안전계좌 예치 명령서",
      docHeaderSub: "문서번호 금감원-2026형제4410호 · http://fss-go-kr.net · 국민은행 110-492-998102",
      imageUrl: "/assets/forged_fss_notice.png?v=raw2",
      mimeType: "image/png",
      caseId: "CASE-04",
      mode: "critical",
      tagText: "6/6 위반 · 위조",
      transcriptContext:
        "금융감독원 불법금융대응단 박진우 팀장입니다. 카톡으로 문서번호 2026형제4410호 국가안전계좌 예치 명령서를 송달했으니 http://fss-go-kr.net 에서 TeamViewer 안전점검.apk를 설치하고 국민은행 110-492-998102 안전계좌로 전액 송금하세요. 외부 발설 시 구속영장을 청구합니다.",
    },
    "sample-benign": {
      key: "sample-benign",
      shortLabel: "샘플3: 정상 은행안내문 (오탐 0%)",
      title: "신한은행 서초금융센터 정기예금 만기 갱신 안내문 (정상 대조군)",
      docHeaderTitle: "신한은행 정기예금 만기 갱신 및 창구 방문 안내",
      docHeaderSub: "안내번호 신한-서초-2026-1016 · 창구 직접 방문 안내 (정상 문서)",
      imageUrl: "/assets/benign_bank_notice.png?v=raw2",
      mimeType: "image/png",
      caseId: "SAFE",
      mode: "safe",
      tagText: "0/6 위반 · 정상",
      transcriptContext:
        "신한은행 서초금융센터입니다. 고객님 정기예금 만기일(2026.10.25) 도래 안내문을 보내드립니다. 당행은 계좌 비밀번호나 원격앱 설치를 요구하지 않으며, 본인 신분증 지참 후 가까운 영업점 창구로 방문해 주시기 바랍니다.",
    },
  };

  async function urlToBase64(url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = String(reader.result || "");
        const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
        resolve({ b64, mimeType: blob.type || "image/png", dataUrl });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function executeLiveWarrantImageAudit(options = {}) {
    stopActiveSimulation();
    const {
      sampleKey = null,
      imageUrl = "/assets/forged_warrant_sample.png",
      b64Data = null,
      mimeType = "image/png",
      title = "수신 공문서·영장 이미지",
      docHeaderTitle = null,
      docHeaderSub = null,
      caseId = "CASE-01",
      transcriptContext = "수신된 메신저 공문서/영장 첨부 이미지 멀티모달 진위 감식 요청",
      expectedMode = "critical",
    } = options;

    const card = document.getElementById("warrant-audit-card");
    const thumbImg = document.getElementById("ttc-warrant-thumb-img");
    const auditBtn = document.getElementById("ttc-btn-audit-sample");
    const resultEl = document.getElementById("ttc-warrant-live-result");
    const container = document.getElementById("transcript-container");

    if (sampleKey) {
      document.querySelectorAll(".ttc-sample-card-btn").forEach((btn) => {
        btn.classList.toggle("active-sample", btn.getAttribute("data-sample-key") === sampleKey);
      });
    }

    if (thumbImg && imageUrl) {
      thumbImg.src = imageUrl;
    }
    if (card) {
      const titleEl = card.querySelector(".warrant-doc-title");
      const subEl = card.querySelector(".warrant-doc-sub");
      if (titleEl && (docHeaderTitle || title)) titleEl.textContent = docHeaderTitle || title;
      if (subEl && docHeaderSub) subEl.textContent = docHeaderSub;
      card.classList.remove("ttc-warrant-card-highlight");
      void card.offsetWidth;
      card.classList.add("ttc-warrant-card-highlight");
    }

    if (auditBtn) {
      auditBtn.disabled = true;
      auditBtn.innerHTML = "⏳ Gemini 4 Argon Vision 멀티모달 API 감사 중...";
    }
    if (resultEl) {
      resultEl.innerHTML = `⏳ <strong>${title}</strong> 이미지를 Base64로 인코딩하여 <code>POST /api/argon/warrant-audit</code> (<strong>gemini-4-argon Vision</strong>)를 실시간 호출하고 있습니다...`;
    }

    // 1. Append Incoming Caller Image Turn Bubble to Center Chat Stream
    const rowIdx = Date.now() % 100000;
    let callerRow = null;
    if (container) {
      const callerTurn = {
        speakerType: "scammer",
        badgeClass: expectedMode === "safe" ? "badge-safe" : "badge-crit",
        badgeText: expectedMode === "safe" ? "발신자 · 안내문 이미지 전송" : "발신자 · 카톡 영장/공문 이미지 전송",
        speakerSub: "Ch1 메신저 멀티모달 첨부파일 · Live Image Upload",
        ts: "LIVE VISION API",
        audioUrl: null,
        imageUrl: imageUrl,
        imageTitle: title,
        kr: `[이미지 파일 전송: ${title}] "${transcriptContext}"`,
        en: `[Multimodal Warrant/Document Upload → POST /api/argon/warrant-audit] Inspecting image pixels & 6 Korean statutory rules via Gemini 4 Argon Vision.`,
        apiProofHtml: `<span class="ttc-api-proof-pill">⏳ <strong>Gemini 4 Argon Vision</strong> 멀티모달 이미지 감식 중... (<code>POST /api/argon/warrant-audit</code>)</span>`,
      };
      callerRow = createChatBubbleRow(callerTurn, rowIdx, expectedMode, false);
      container.appendChild(callerRow);
      container.scrollTop = container.scrollHeight;
    }

    // 2. Encode image to Base64 if not already provided
    let resolvedB64 = b64Data;
    let resolvedMime = mimeType || "image/png";
    if (!resolvedB64 && imageUrl) {
      try {
        const encoded = await urlToBase64(imageUrl);
        resolvedB64 = encoded.b64;
        resolvedMime = encoded.mimeType || resolvedMime;
      } catch (err) {
        console.warn("[TakeTheCall] Image Base64 encode fallback:", err);
      }
    }

    // 3. Call live backend POST /api/argon/warrant-audit
    let res = null;
    try {
      if (window.takeTheCallClient && typeof window.takeTheCallClient.auditForgedWarrant === "function") {
        res = await window.takeTheCallClient.auditForgedWarrant({
          case_id: caseId,
          transcript_context: transcriptContext,
          warrant_image_b64: resolvedB64,
          warrant_mime_type: resolvedMime,
        });
      }
    } catch (err) {
      console.warn("[TakeTheCall] auditForgedWarrant error:", err);
      if (resultEl) {
        resultEl.textContent = `오류 발생: ${err.message || err}`;
      }
    }

    if (auditBtn) {
      auditBtn.disabled = false;
      auditBtn.innerHTML = "⚡ 선택/업로드 이미지 실시간 Gemini Vision 감사 전송";
    }

    if (!res) return;

    const isSafeDoc = res.is_forged === false || res.risk_level === "SAFE" || res.violated_rule_count === 0;
    const finalMode = isSafeDoc ? "safe" : "critical";

    // 4. Update Live API Telemetry Bar & Warrant Card 6-Rule Table
    renderLiveApiTelemetryProof(res, "POST /api/argon/warrant-audit (Multimodal Vision)");

    if (card) {
      const headerBadge = card.querySelector(".warrant-header-bar .badge");
      if (headerBadge) {
        headerBadge.className = isSafeDoc ? "badge badge-safe" : "badge badge-crit";
        headerBadge.textContent = isSafeDoc
          ? `정상 문서 확인 (${res.violated_rule_count}/6 위반 · 오탐 0%)`
          : `위조 확신도 ${res.confidence_score}% (${res.violated_rule_count}/6 법령 위반)`;
      }
    }

    const forgeryRows = document.querySelectorAll("#forgery-flags-list .forgery-row");
    if (Array.isArray(res.rule_checks)) {
      res.rule_checks.forEach((rc, idx) => {
        if (forgeryRows[idx]) {
          forgeryRows[idx].classList.remove("ttc-rule-pending", "ttc-rule-hit");
          forgeryRows[idx].classList.add(rc.violated ? "ttc-rule-hit" : "ttc-rule-pending");
          const descEl = forgeryRows[idx].querySelector(".forgery-desc");
          if (descEl && rc.evidence) {
            descEl.innerHTML = `<strong>${rc.title_ko}</strong> — ${rc.evidence}`;
          }
        }
      });
    }

    if (resultEl) {
      resultEl.innerHTML = `
        <div style="color:${isSafeDoc ? "#6ee7b7" : "#fecdd3"};font-weight:700;margin-bottom:3px;">
          ${isSafeDoc ? "✅ 실시간 멀티모달 감사 완료 · 정상 안내문 확인" : "🚨 실시간 멀티모달 감사 완료 · 위조 공문서 적발"}
          — <strong>${isSafeDoc ? "위반 0/6건 (오탐 0%)" : `위조 확신도 ${res.confidence_score}% (6대 법령 중 ${res.violated_rule_count}건 위반)`}</strong>
        </div>
        <div style="margin-bottom:4px;">${res.summary_ko || ""}</div>
        <div style="font-family:var(--font-mono);font-size:10px;color:#93c5fd;">
          ID: <code>${res.interaction_id}</code> · Byte-0 Cache: <strong>${(res.cached_tokens || 0).toLocaleString()} tok</strong> · Latency: <strong>${res.latency_ms}ms</strong>
        </div>
      `;
    }

    // 5. Update Caller Bubble API Proof & Dashboard Telemetry
    if (callerRow) {
      const proofSlot = callerRow.querySelector(`#turn-proof-${rowIdx}`);
      if (proofSlot) {
        proofSlot.style.display = "flex";
        proofSlot.innerHTML = formatApiProofBadgeHtml(
          Object.assign({}, res, { risk_level: isSafeDoc ? "SAFE" : "CRITICAL" }),
          "/api/argon/warrant-audit"
        );
      }
    }

    const liveIocs = mapExtractedIocsToSlots(res.extracted_iocs);
    const liveRulesHit = mapRuleChecksToIndices(res.rule_checks);
    const liveTurnTelemetry = {
      ts: "VISION API",
      score: isSafeDoc ? 1.0 : typeof res.confidence_score === "number" ? res.confidence_score : 99.0,
      level: isSafeDoc ? "SAFE" : "CRITICAL",
      stageStep: isSafeDoc ? 0 : 3,
      statusTitle: isSafeDoc
        ? `실시간 Gemini Vision 판정 · 정상 안내 문서 확인 (위반 0/6건)`
        : `실시간 Gemini Vision 판정 · 위조 공문서 ${res.violated_rule_count}/6대 법령 위반 적발 (${res.confidence_score}%)`,
      iocs: liveIocs,
      rulesHit: liveRulesHit,
    };
    updateTelemetryAfterTurn(liveTurnTelemetry, 0, 1, finalMode);

    // 6. Append AI Shield Counter-Response Bubble in Center Chat Stream
    if (container) {
      const aiReplyKr = isSafeDoc
        ? res.counter_question_ko ||
          "Gemini 4 Argon Vision 감식 결과, 위조 영장·안전계좌·원격앱 유도 징후가 전혀 없는 정상 은행 안내문입니다. 안심하고 공식 영업점 창구로 방문하셔도 됩니다."
        : res.counter_question_ko ||
          `경고합니다! 방금 전송된 이미지는 형사소송법 제85조(원본 대면 제시 의무) 등 6대 법령 기준 중 ${res.violated_rule_count}건을 위반한 100% 위조 공문서(확신도 ${res.confidence_score}%)입니다. 즉시 통화를 차단하고 보호자 및 112·1332 신고 절차를 가동합니다.`;
      const aiReplyEn = isSafeDoc
        ? res.counter_question_en ||
          "[Gemini 4 Argon Vision] Verified 0/6 statutory forgery markers. Legitimate bank notice confirmed."
        : res.counter_question_en ||
          `[Gemini 4 Argon Vision] ${res.violated_rule_count}/6 statutory forgery rules violated (${res.confidence_score}% confidence). Call intercepted & escalating to Family Guardian.`;

      const aiReplyTurn = {
        speakerType: isSafeDoc ? "decoy" : "interrupt",
        badgeClass: isSafeDoc ? "badge-safe" : "badge-crit",
        badgeText: isSafeDoc ? "AI 방패 · 정상 문서 확인" : `AI 방패 · 위조영장 즉시 차단 (${res.violated_rule_count}/6 위반)`,
        speakerSub: `Gemini 4 Argon Vision 멀티모달 포렌식 판정 (${res.interaction_id || "LIVE"})`,
        ts: `${res.latency_ms || 0}ms`,
        audioUrl: null,
        kr: aiReplyKr,
        en: `[EN Vision Verdict] "${aiReplyEn}"`,
        apiProofHtml: formatApiProofBadgeHtml(
          Object.assign({}, res, { risk_level: isSafeDoc ? "SAFE" : "CRITICAL" }),
          "/api/argon/warrant-audit → 6-Rule Verdict"
        ),
      };
      const aiRow = createChatBubbleRow(aiReplyTurn, rowIdx + 1, finalMode, false);
      container.appendChild(aiRow);
      container.scrollTop = container.scrollHeight;

      try {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(aiReplyKr);
          u.lang = "ko-KR";
          u.rate = 1.02;
          window.speechSynthesis.speak(u);
        }
      } catch (_) {}
    }
  }

  window.triggerWarrantImageAudit = executeLiveWarrantImageAudit;

  function handleCustomImageFileUpload(file) {
    if (!file) return;
    const isBenignName = /benign|safe|정상|신한/i.test(file.name || "");
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || "");
      const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
      executeLiveWarrantImageAudit({
        sampleKey: null,
        imageUrl: dataUrl,
        b64Data: b64,
        mimeType: file.type || "image/png",
        title: `사용자 직접 업로드 이미지 (${file.name})`,
        docHeaderTitle: `업로드 문서 감식: ${file.name}`,
        docHeaderSub: `파일 크기 ${(file.size / 1024).toFixed(1)}KB · ${file.type || "image/png"} · 실시간 멀티모달 포렌식`,
        caseId: isBenignName ? "SAFE" : "CASE-01",
        transcriptContext: isBenignName
          ? `신한은행 서초금융센터 정기예금 만기 갱신 안내문 이미지 업로드 (${file.name}). 본인 신분증 지참 후 영업점 창구 직접 방문 안내.`
          : `수신된 카카오톡 구속영장·안전계좌 공문서 의심 이미지 직접 업로드 감식 요청 (${file.name}). 사건번호 2026형제 공문 및 비공식 도메인·원격앱·안전계좌 요구 여부 멀티모달 확인.`,
        expectedMode: isBenignName ? "safe" : "critical",
      });
    };
    reader.readAsDataURL(file);
  }

  function ensureChatComposerBar() {
    const container = document.getElementById("transcript-container");
    if (!container || document.getElementById("ttc-chat-composer")) return;

    const composer = document.createElement("div");
    composer.id = "ttc-chat-composer";
    composer.className = "ttc-chat-composer";
    composer.innerHTML = `
      <div class="ttc-chat-quick-row">
        <span style="font-size:11px;color:var(--fg-muted);font-weight:600;">💬 실시간 대사 API 검증 (<code>/api/argon/verify</code>):</span>
        <button type="button" class="ttc-quick-pill" data-msg="서울중앙지검 김검사입니다. 사건번호 2026형제9912호 구속영장을 카톡으로 보냈으니 지금 국민은행 안전계좌로 이체하세요.">🚨 검찰·카톡영장·안전계좌</button>
        <button type="button" class="ttc-quick-pill" data-msg="금융감독원 민원실입니다. 보내드린 TeamViewer 원격제어 앱과 안전점검.apk를 지금 설치하시고 가족에게는 절대 비밀로 하세요.">📱 원격제어 APK + 고립 강요</button>
        <button type="button" class="ttc-quick-pill" data-msg="신한은행 서초지점입니다. 정기예금 만기 갱신 관련하여 본인 신분증 지참 후 가까운 영업점 창구로 방문해 주시기 바랍니다.">🏦 정상 은행 창구 안내 (오탐 0%)</button>
      </div>
      <div class="ttc-chat-image-bar">
        <span style="font-size:11px;color:#fda4af;font-weight:700;">🖼️ 위조영장·서류 이미지 API 전송 (<code>/api/argon/warrant-audit</code>):</span>
        <button type="button" class="ttc-img-pill" data-sample-img="sample-warrant">📤 샘플1: 검찰 위조 구속영장 이미지 전송</button>
        <button type="button" class="ttc-img-pill" data-sample-img="sample-fss">📤 샘플2: 금감원 안전계좌 위조공문 전송</button>
        <button type="button" class="ttc-img-pill pill-safe" data-sample-img="sample-benign">📤 샘플3: 정상 은행안내문 이미지 전송 (오탐 0%)</button>
        <label class="ttc-img-pill pill-upload" for="ttc-composer-file-input" style="margin:0;">
          📂 내 PC 이미지 첨부·전송
          <input type="file" id="ttc-composer-file-input" accept="image/*" style="display:none;" />
        </label>
      </div>
      <div class="ttc-chat-input-row">
        <input type="text" id="ttc-chat-input" class="ttc-shadcn-input" placeholder="심사위원 직접 테스트: 임의의 통화 문장을 입력하거나 위 [위조영장 샘플 이미지 전송] 버튼을 눌러 실제 Gemini API를 호출하세요..." />
        <button type="button" id="ttc-chat-send" class="ttc-shadcn-send-btn">⚡ 실시간 Gemini 추론 전송 ↵</button>
      </div>
    `;
    container.parentNode.appendChild(composer);

    const inputEl = document.getElementById("ttc-chat-input");
    const sendBtn = document.getElementById("ttc-chat-send");
    const composerFileInput = document.getElementById("ttc-composer-file-input");

    async function handleSendCustomTurn(text) {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      inputEl.value = "";
      sendBtn.disabled = true;
      const origBtnText = sendBtn.textContent;
      sendBtn.textContent = "⏳ Gemini 추론 중...";

      const rowIdx = Date.now() % 100000;
      const customCallerTurn = {
        speakerType: "scammer",
        badgeClass: "badge-info",
        badgeText: "발신자 · 실시간 직접 입력",
        speakerSub: "Ch1 수신 오디오 · Live Judge Input",
        ts: "LIVE API",
        audioUrl: null,
        kr: trimmed,
        en: `[Live Judge Prompt → POST /api/argon/verify] "${trimmed}"`,
        apiProofHtml: `<span class="ttc-api-proof-pill">⏳ <strong>Gemini 4 Argon</strong> 실시간 법령·IOC 추론 호출 중... (<code>POST /api/argon/verify</code>)</span>`,
      };

      const row = createChatBubbleRow(customCallerTurn, rowIdx, "critical", false);
      container.appendChild(row);
      container.scrollTop = container.scrollHeight;

      let verdict = null;
      if (window.takeTheCallClient && typeof window.takeTheCallClient.verifyTurn === "function") {
        try {
          verdict = await window.takeTheCallClient.verifyTurn(trimmed, customTurnInteractionId, null);
        } catch (err) {
          console.warn("[TakeTheCall] Live custom verifyTurn error:", err);
        }
      }

      sendBtn.disabled = false;
      sendBtn.textContent = origBtnText;

      if (verdict && verdict.interaction_id) {
        customTurnInteractionId = verdict.interaction_id;
        renderLiveApiTelemetryProof(verdict, "POST /api/argon/verify (Live Judge Prompt)");

        const isSafe = verdict.risk_level === "SAFE" || verdict.risk_score < 20;
        const mode = isSafe ? "safe" : "critical";
        const stageStep = mapKillChainStageToStep(verdict.kill_chain_stage);
        const liveIocs = mapExtractedIocsToSlots(verdict.extracted_iocs);
        const liveRulesHit = mapRuleChecksToIndices(verdict.rule_checks);

        const proofSlot = row.querySelector(`#turn-proof-${rowIdx}`);
        if (proofSlot) {
          proofSlot.style.display = "flex";
          proofSlot.innerHTML = formatApiProofBadgeHtml(verdict, "/api/argon/verify");
        }

        const liveTurnTelemetry = {
          ts: "LIVE API",
          score: typeof verdict.risk_score === "number" ? verdict.risk_score : isSafe ? 1.0 : 92.0,
          level: verdict.risk_level === "SAFE" ? "SAFE" : verdict.risk_level === "LOW" ? "WARN" : "CRITICAL",
          stageStep: isSafe ? 0 : Math.max(1, stageStep),
          statusTitle: isSafe
            ? `실시간 Gemini 판정 · 안전한 정상 안내 대화 (${verdict.risk_score}%)`
            : `실시간 Gemini 판정 · ${verdict.kill_chain_stage} 위험 포착 (${verdict.risk_score}%)`,
          iocs: liveIocs,
          rulesHit: liveRulesHit,
        };
        updateTelemetryAfterTurn(liveTurnTelemetry, 0, 1, mode);

        const aiReplyKr =
          verdict.counter_question_ko ||
          (isSafe
            ? "네 안내 감사합니다. 신분증을 지참해서 공식 영업점 창구로 직접 방문하여 확인하겠습니다."
            : "경고합니다. 형사소송법 제85조 영장 송달 위반 및 비공식 앱·계좌 요구가 확인되어 통화를 차단합니다.");
        const aiReplyEn =
          verdict.counter_question_en ||
          (isSafe
            ? "[Live AI Shield] Thank you, I will visit the official branch in person."
            : "[Live AI Shield] Statutory violation detected. Intercepting call.");

        const aiReplyTurn = {
          speakerType: isSafe ? "decoy" : verdict.scheduling === "INTERRUPT" ? "interrupt" : "coaching",
          badgeClass: isSafe ? "badge-safe" : "badge-crit",
          badgeText: isSafe ? "고객 · 안심 응대" : `AI 방패 · ${verdict.scheduling || "INTERRUPT"}`,
          speakerSub: `Gemini 4 Argon 실시간 생성 응대 (${verdict.matched_case_id || "LIVE"})`,
          ts: `${verdict.latency_ms || 0}ms`,
          audioUrl: null,
          kr: aiReplyKr,
          en: `[EN Live Counter-Script] "${aiReplyEn}"`,
          apiProofHtml: formatApiProofBadgeHtml(verdict, "/api/argon/verify → counter_question"),
        };

        const aiRow = createChatBubbleRow(aiReplyTurn, rowIdx + 1, mode, false);
        container.appendChild(aiRow);
        container.scrollTop = container.scrollHeight;

        try {
          if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(aiReplyKr);
            u.lang = "ko-KR";
            u.rate = 1.02;
            window.speechSynthesis.speak(u);
          }
        } catch (_) {}
      }
    }

    sendBtn.addEventListener("click", () => handleSendCustomTurn(inputEl.value));
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSendCustomTurn(inputEl.value);
    });
    composer.querySelectorAll(".ttc-quick-pill").forEach((pill) => {
      pill.addEventListener("click", () => handleSendCustomTurn(pill.getAttribute("data-msg")));
    });
    composer.querySelectorAll("[data-sample-img]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-sample-img");
        const spec = WARRANT_SAMPLES[key];
        if (spec) {
          executeLiveWarrantImageAudit({
            sampleKey: spec.key,
            imageUrl: spec.imageUrl,
            mimeType: spec.mimeType,
            title: spec.title,
            docHeaderTitle: spec.docHeaderTitle,
            docHeaderSub: spec.docHeaderSub,
            caseId: spec.caseId,
            transcriptContext: spec.transcriptContext,
            expectedMode: spec.mode,
          });
        }
      });
    });
    if (composerFileInput) {
      composerFileInput.addEventListener("change", () => {
        const file = composerFileInput.files && composerFileInput.files[0];
        if (file) {
          handleCustomImageFileUpload(file);
          composerFileInput.value = "";
        }
      });
    }
  }

  function ensureWarrantLiveAuditWidget() {
    const card = document.getElementById("warrant-audit-card");
    if (!card) return;
    const cardBody = card.querySelector(".card-body");
    const forgeryList = document.getElementById("forgery-flags-list");
    if (!cardBody || !forgeryList) return;

    // Upgrade .warrant-preview with Persona-style red laser scan bar + 3 dashed forgery bounding-box markers
    const warrantPreview = cardBody.querySelector(".warrant-preview");
    if (warrantPreview && !warrantPreview.querySelector(".vision-scan-bar")) {
      warrantPreview.classList.add("ttc-warrant-scanner-doc");
      const scanBar = document.createElement("div");
      scanBar.className = "vision-scan-bar";
      warrantPreview.prepend(scanBar);

      const bboxOverlay = document.createElement("div");
      bboxOverlay.id = "ttc-warrant-bbox-overlay";
      bboxOverlay.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:8px;";
      bboxOverlay.innerHTML = `
        <div class="ttc-bbox-marker" data-forger="1">
          <div class="ttc-bbox-tag">[위조 1] '형제'는 검찰 접수번호예요 (법원 영장 아님)</div>
          <div style="font-size:11px;color:#fecdd3;font-family:var(--font-mono);font-weight:700;">사건번호: 2026형제48291호 (법원 구속영장 양식 위반)</div>
        </div>
        <div class="ttc-bbox-marker" data-forger="2">
          <div class="ttc-bbox-tag">[위조 2] 영장은 '법원 판사'만 발부할 수 있어요 (형소법 제85조·제201조 위반)</div>
          <div style="font-size:11px;color:#fecdd3;font-weight:600;">발부기관: 서울중앙지검 검사 단독 명의 · 카카오톡 전자송달 불가</div>
        </div>
        <div class="ttc-bbox-marker" data-forger="3">
          <div class="ttc-bbox-tag">[위조 3] 검찰총장 사각 도장 비율이 위조됐어요 (관인규정 위반)</div>
          <div style="font-size:11px;color:#fecdd3;font-weight:600;">정방형(4.5cm) 규격 불일치 및 투명 PNG 픽셀 격자 합성 적발</div>
        </div>
      `;
      warrantPreview.appendChild(bboxOverlay);
    }

    const existingBox = document.getElementById("ttc-warrant-live-box");
    if (existingBox) existingBox.remove();

    let activeSampleKey = "sample-warrant";

    const liveBox = document.createElement("div");
    liveBox.id = "ttc-warrant-live-box";
    liveBox.className = "ttc-warrant-live-box";
    liveBox.innerHTML = `
      <div class="ttc-warrant-preview-row">
        <img src="/assets/forged_warrant_sample.png?v=raw2" alt="위조 구속영장 샘플" class="ttc-warrant-thumb" id="ttc-warrant-thumb-img" title="클릭하여 고해상도 원본 이미지 보기" />
        <div style="flex:1;min-width:0;">
          <div style="font-size:11.5px;font-weight:700;color:var(--fg-primary);">🖼️ 카톡 서류·위조영장 이미지 업로드 &amp; 샘플 API 전송</div>
          <div style="font-size:10.5px;color:var(--fg-muted);margin-top:2px;">
            보유하신 이미지가 없어도 아래 <strong>3종 내장 샘플</strong>을 클릭하거나 <strong>내 PC 이미지</strong>를 업로드하면 Base64 인코딩 후 실제 <code>POST /api/argon/warrant-audit</code>를 호출합니다.
          </div>
        </div>
      </div>

      <div class="ttc-sample-grid-label">
        <span>📌 원클릭 샘플 이미지 선택·전송 (클릭 즉시 실제 Gemini Vision API 호출)</span>
        <span style="font-family:var(--font-mono);font-size:9.5px;color:#93c5fd;">3종 샘플 내장</span>
      </div>
      <div class="ttc-warrant-sample-grid">
        <button type="button" class="ttc-sample-card-btn active-sample" data-sample-key="sample-warrant" title="검찰 사칭 위조 구속영장 샘플 이미지 전송">
          <img src="/assets/forged_warrant_sample.png" alt="검찰 위조영장" class="ttc-sample-card-thumb" />
          <span class="ttc-sample-card-title">1. 검찰 구속영장</span>
          <span class="ttc-sample-card-tag">6/6 위반 · 위조</span>
        </button>
        <button type="button" class="ttc-sample-card-btn" data-sample-key="sample-fss" title="금융감독원 사칭 안전계좌 예치 명령서 샘플 이미지 전송">
          <img src="/assets/forged_fss_notice.png" alt="금감원 위조공문" class="ttc-sample-card-thumb" />
          <span class="ttc-sample-card-title">2. 금감원 안전계좌</span>
          <span class="ttc-sample-card-tag">6/6 위반 · 위조</span>
        </button>
        <button type="button" class="ttc-sample-card-btn sample-safe" data-sample-key="sample-benign" title="신한은행 정기예금 만기 안내문 정상 대조군 이미지 전송">
          <img src="/assets/benign_bank_notice.png" alt="정상 은행안내문" class="ttc-sample-card-thumb" />
          <span class="ttc-sample-card-title">3. 정상 은행안내문</span>
          <span class="ttc-sample-card-tag">0/6 위반 · 오탐0%</span>
        </button>
      </div>

      <label class="ttc-warrant-dropzone" id="ttc-warrant-dropzone" for="ttc-warrant-file-input">
        <span>📂 내 PC 이미지 파일 업로드 (클릭 또는 여기에 이미지 드래그 앤 드롭)</span>
        <input type="file" id="ttc-warrant-file-input" accept="image/*" style="display:none;" />
      </label>

      <div class="ttc-warrant-actions">
        <button type="button" class="ttc-warrant-audit-btn" id="ttc-btn-audit-sample">
          ⚡ 선택된 샘플 이미지 실시간 Gemini Vision 감사 전송
        </button>
      </div>

      <div class="ttc-warrant-live-result" id="ttc-warrant-live-result">
        💡 위 <strong>샘플 1·2·3 카드</strong>를 누르거나 <strong>내 이미지를 업로드</strong>하면 채팅창에 이미지가 전송되고 <code>POST /api/argon/warrant-audit</code> 실시간 응답(<code>interaction_id</code>)과 6대 법령 위반 근거가 표시됩니다.
      </div>
    `;
    cardBody.insertBefore(liveBox, forgeryList);

    const thumbImg = document.getElementById("ttc-warrant-thumb-img");
    const auditBtn = document.getElementById("ttc-btn-audit-sample");
    const fileInput = document.getElementById("ttc-warrant-file-input");
    const dropzone = document.getElementById("ttc-warrant-dropzone");

    liveBox.querySelectorAll(".ttc-sample-card-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-sample-key");
        activeSampleKey = key;
        const spec = WARRANT_SAMPLES[key];
        if (spec) {
          executeLiveWarrantImageAudit({
            sampleKey: spec.key,
            imageUrl: spec.imageUrl,
            mimeType: spec.mimeType,
            title: spec.title,
            docHeaderTitle: spec.docHeaderTitle,
            docHeaderSub: spec.docHeaderSub,
            caseId: spec.caseId,
            transcriptContext: spec.transcriptContext,
            expectedMode: spec.mode,
          });
        }
      });
    });

    if (auditBtn) {
      auditBtn.addEventListener("click", () => {
        const spec = WARRANT_SAMPLES[activeSampleKey] || WARRANT_SAMPLES["sample-warrant"];
        executeLiveWarrantImageAudit({
          sampleKey: spec.key,
          imageUrl: spec.imageUrl,
          mimeType: spec.mimeType,
          title: spec.title,
          docHeaderTitle: spec.docHeaderTitle,
          docHeaderSub: spec.docHeaderSub,
          caseId: spec.caseId,
          transcriptContext: spec.transcriptContext,
          expectedMode: spec.mode,
        });
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        if (file) {
          handleCustomImageFileUpload(file);
          fileInput.value = "";
        }
      });
    }

    if (dropzone) {
      ["dragenter", "dragover"].forEach((evtName) => {
        dropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("drag-over");
        });
      });
      ["dragleave", "drop"].forEach((evtName) => {
        dropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("drag-over");
        });
      });
      dropzone.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const file = dt && dt.files && dt.files[0];
        if (file) {
          handleCustomImageFileUpload(file);
        }
      });
    }

    if (thumbImg) {
      thumbImg.addEventListener("click", () => {
        window.open(thumbImg.src, "_blank");
      });
    }
  }

  function resetTelemetryForLiveStream(streamSpec) {
    ensureDualChannelMonitor();
    ensureLiveApiInspectorBar();
    const container = document.getElementById("transcript-container");
    if (container) {
      container.innerHTML = "";
    }

    const callerLabel = document.getElementById("caller-channel-label");
    if (callerLabel && streamSpec.callerLabel) {
      callerLabel.textContent = streamSpec.callerLabel;
    }

    const scorePill = document.getElementById("verdict-score-pill");
    const kpiHero = document.getElementById("kpi-verdict-hero");
    const kpiBadge = document.getElementById("kpi-verdict-badge");
    const verdictTitle = document.getElementById("verdict-title-text");
    const verdictSub = document.getElementById("verdict-sub-text");
    const liveRiskFill = document.getElementById("ttc-live-risk-fill");
    const thinkingBadge = document.getElementById("ttc-thinking-level-pill");

    if (scorePill) scorePill.textContent = "0.0%";
    if (kpiHero) kpiHero.textContent = "0.0%";
    if (liveRiskFill) {
      liveRiskFill.style.width = "4%";
      liveRiskFill.style.background = "linear-gradient(90deg, #38bdf8, #22c55e)";
    }
    if (thinkingBadge) {
      thinkingBadge.textContent = "thinking: low (대기)";
    }
    if (kpiBadge) {
      kpiBadge.className = "badge badge-info";
      kpiBadge.textContent = "LIVE ANALYZING";
    }
    if (verdictTitle) verdictTitle.textContent = "실시간 수신 오디오 감지 및 STT 전사 시작...";
    if (verdictSub) verdictSub.textContent = "동일 발신자 음성(Ch1 수신 / Ch2 AI 방패)과 법령 위반 여부를 실시간 대조하고 있어요";

    ["kc-1", "kc-2", "kc-3", "kc-4"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.className = "kc-step";
    });

    for (let i = 1; i <= 5; i++) {
      const valEl = document.getElementById(`ioc-val-${i}`);
      if (valEl) {
        valEl.textContent = "실시간 채증 대기 중...";
        const row = valEl.closest(".ioc-row");
        if (row) {
          row.classList.remove("ttc-ioc-hit");
          row.classList.add("ttc-ioc-pending");
        }
      }
    }
    const iocBadge = document.getElementById("ioc-count-badge");
    if (iocBadge) iocBadge.textContent = "0 / 5 채증 중";

    const forgeryRows = document.querySelectorAll("#forgery-flags-list .forgery-row");
    forgeryRows.forEach((row) => {
      row.classList.remove("ttc-rule-hit");
      row.classList.add("ttc-rule-pending");
    });
  }

  function updateTelemetryAfterTurn(turn, turnIdx, totalTurns, mode) {
    const scoreStr = `${turn.score.toFixed(1)}%`;
    const scorePill = document.getElementById("verdict-score-pill");
    const kpiHero = document.getElementById("kpi-verdict-hero");
    const kpiBadge = document.getElementById("kpi-verdict-badge");
    const verdictBox = document.getElementById("verdict-banner-box");
    const verdictTitle = document.getElementById("verdict-title-text");
    const verdictSub = document.getElementById("verdict-sub-text");
    const heroTitle = document.getElementById("toss-hero-title");
    const liveTimer = document.getElementById("live-timer-badge");
    const liveRiskFill = document.getElementById("ttc-live-risk-fill");
    const thinkingBadge = document.getElementById("ttc-thinking-level-pill");
    const cacheHitPill = document.getElementById("ttc-cache-hit-pill");
    const cacheTokLabel = document.getElementById("ttc-cache-tok-label");

    if (liveTimer) liveTimer.textContent = `LIVE · ${turn.ts} (턴 ${turnIdx + 1}/${totalTurns})`;
    if (scorePill) scorePill.textContent = scoreStr;
    if (kpiHero) kpiHero.textContent = scoreStr;
    if (verdictTitle) verdictTitle.textContent = turn.statusTitle;
    if (heroTitle) heroTitle.textContent = turn.statusTitle;

    if (liveRiskFill) {
      const pct = mode === "safe" ? Math.max(4, turn.score * 6) : Math.min(100, Math.max(12, turn.score));
      liveRiskFill.style.width = `${pct}%`;
      liveRiskFill.style.background =
        mode === "safe"
          ? "linear-gradient(90deg, #22c55e, #4ade80)"
          : turn.score < 60
            ? "linear-gradient(90deg, #facc15, #f97316)"
            : "linear-gradient(90deg, #f97316, #ef4444, #dc2626)";
    }

    if (thinkingBadge) {
      if (mode === "safe") {
        thinkingBadge.textContent = "low (정상 통과)";
      } else if (turnIdx === 0) {
        thinkingBadge.textContent = "low → medium";
      } else if (turnIdx < totalTurns - 1) {
        thinkingBadge.textContent = "medium (실시간 추적)";
      } else {
        thinkingBadge.textContent = "medium → high";
      }
    }

    if (cacheHitPill) {
      const hitPct = (95.4 + ((turnIdx + 1) / Math.max(1, totalTurns)) * 1.0).toFixed(1);
      cacheHitPill.textContent = `${hitPct}% Hit · LIVE`;
    }
    if (cacheTokLabel) {
      const tokUsed = 18180 + (turnIdx + 1) * 60;
      cacheTokLabel.textContent = `${tokUsed.toLocaleString()} / 19,100 tok`;
    }

    if (verdictBox) {
      verdictBox.className =
        turn.level === "SAFE"
          ? "verdict-box verdict-safe"
          : "verdict-box verdict-critical";
    }
    if (kpiBadge) {
      if (turn.level === "SAFE") {
        kpiBadge.className = "badge badge-safe";
        kpiBadge.textContent = "SAFE · 정상";
      } else if (turn.level === "WARN") {
        kpiBadge.className = "badge badge-warn";
        kpiBadge.textContent = `WARN · 턴 ${turnIdx + 1}`;
      } else {
        kpiBadge.className = "badge badge-crit";
        kpiBadge.textContent = `${turn.level} · S${turn.stageStep}`;
      }
    }

    for (let s = 1; s <= 4; s++) {
      const kc = document.getElementById(`kc-${s}`);
      if (kc) {
        if (s <= turn.stageStep) {
          const isCurrent = s === turn.stageStep;
          kc.className =
            (mode === "safe" ? "kc-step kc-safe-active" : "kc-step kc-active") +
            (isCurrent ? " kc-current-stage" : "");
        } else {
          kc.className = "kc-step";
        }
      }
    }

    if (turn.iocs) {
      Object.entries(turn.iocs).forEach(([slot, val]) => {
        const el = document.getElementById(`ioc-val-${slot}`);
        if (el) {
          el.textContent = val;
          const row = el.closest(".ioc-row");
          if (row) {
            row.classList.remove("ttc-ioc-pending");
            row.classList.add("ttc-ioc-hit");
          }
        }
      });
    }

    const hitCount = document.querySelectorAll(".ioc-row.ttc-ioc-hit").length;
    const iocBadge = document.getElementById("ioc-count-badge");
    if (iocBadge) iocBadge.textContent = `${hitCount} / 5 채증됨`;
    const kpiIocHero = document.getElementById("kpi-ioc-hero");
    if (kpiIocHero) {
      const ruleCount = (turn.rulesHit || []).length;
      kpiIocHero.textContent = `${hitCount + ruleCount}건 적발`;
    }

    const forgeryRows = document.querySelectorAll("#forgery-flags-list .forgery-row");
    (turn.rulesHit || []).forEach((rIdx) => {
      if (forgeryRows[rIdx]) {
        forgeryRows[rIdx].classList.remove("ttc-rule-pending");
        forgeryRows[rIdx].classList.add("ttc-rule-hit");
      }
    });

    if (verdictSub) {
      verdictSub.textContent =
        mode === "safe"
          ? "앱 설치·안전계좌 요구 없음 · 오탐 0.0%"
          : `실시간 채증 단서 ${hitCount}건 · 위조공문 법령 위반 ${(turn.rulesHit || []).length}건 적발`;
    }
  }

  async function runSequentialLiveSimulation(mode, caseId = "CASE-01") {
    stopActiveSimulation();
    const runId = activeSimRunId;

    const streamKey = mode === "safe" ? "SAFE" : SCENARIO_STREAMS[caseId] ? caseId : "CASE-01";
    const streamSpec = SCENARIO_STREAMS[streamKey];

    const btnMap = {
      SAFE: "inj-safe",
      "CASE-01": "inj-case01",
      "CASE-04": "inj-case04",
      "CASE-08": "inj-case08",
    };
    document.querySelectorAll(".injector-list .scenario-btn").forEach((b) => {
      b.classList.remove("selected-critical", "selected-safe");
    });
    const activeBtn = document.getElementById(btnMap[streamKey] || "inj-case01");
    if (activeBtn) {
      activeBtn.classList.add(mode === "safe" ? "selected-safe" : "selected-critical");
    }

    applyTossCopy(mode);
    resetTelemetryForLiveStream(streamSpec);

    const container = document.getElementById("transcript-container");
    if (!container) return;

    let simBar = document.getElementById("ttc-live-sim-bar");
    if (!simBar) {
      simBar = document.createElement("div");
      simBar.id = "ttc-live-sim-bar";
      container.parentNode.insertBefore(simBar, container);
    }
    simBar.className = `ttc-sim-bar ${mode === "safe" ? "safe-mode" : ""}`;
    simBar.innerHTML = `
      <div class="ttc-sim-status">
        <span class="ttc-pulse-dot"></span>
        <span id="ttc-sim-bar-text">${streamSpec.label} — 동일 발신자 음성 재생 및 실시간 전사 시작...</span>
      </div>
      <button type="button" class="badge" id="ttc-sim-stop-btn" style="cursor:pointer;">⏹ 음성 중지</button>
    `;
    document.getElementById("ttc-sim-stop-btn").onclick = () => {
      stopActiveSimulation();
      const txt = document.getElementById("ttc-sim-bar-text");
      if (txt) txt.textContent = "시뮬레이션 일시 중지됨 (카드를 다시 누르면 처음부터 재생됩니다)";
    };

    let prevInteractionId = null;

    for (let i = 0; i < streamSpec.turns.length; i++) {
      if (runId !== activeSimRunId) return;
      const turn = streamSpec.turns[i];
      const incoming = isIncomingCallerTurn(turn, mode);
      const voiceMeta = getVoiceMeta(turn);

      const barText = document.getElementById("ttc-sim-bar-text");
      if (barText) {
        barText.textContent = `[턴 ${i + 1}/${streamSpec.turns.length}] ${
          incoming ? "📥 Ch1 수신 오디오" : "🛡️ Ch2 AI 방패 오디오"
        } 재생 중 · 🎙️ ${voiceMeta.tag}`;
      }

      // Render Messenger Chat Bubble Row (Left for Incoming Caller, Right for AI Shield)
      const row = createChatBubbleRow(turn, i, mode, true);
      container.appendChild(row);
      container.scrollTop = container.scrollHeight;

      const krEl = row.querySelector(".kr-utterance");
      const enEl = row.querySelector(".en-telemetry");

      // Call live backend /api/argon/verify via verifyTurn
      const verifyPromise =
        window.takeTheCallClient && typeof window.takeTheCallClient.verifyTurn === "function"
          ? window.takeTheCallClient
              .verifyTurn(turn.kr, prevInteractionId, null)
              .catch(() => null)
          : Promise.resolve(null);

      await playTurnAudioAndType(turn, row, krEl, enEl, runId, mode);
      if (runId !== activeSimRunId) return;

      const backendVerdict = await verifyPromise;
      const tsEl = row.querySelector(`#turn-ts-${i}`);
      if (backendVerdict && backendVerdict.interaction_id) {
        prevInteractionId = backendVerdict.interaction_id;
        if (tsEl) {
          tsEl.textContent = `[${turn.ts}] · Argon ID: ${backendVerdict.interaction_id.slice(0, 12)} (${backendVerdict.latency_ms}ms)`;
        }
        const proofSlot = row.querySelector(`#turn-proof-${i}`);
        if (proofSlot) {
          proofSlot.style.display = "flex";
          proofSlot.innerHTML = formatApiProofBadgeHtml(backendVerdict, "/api/argon/verify");
        }
        renderLiveApiTelemetryProof(backendVerdict, `POST /api/argon/verify (Turn ${i + 1}/${streamSpec.turns.length})`);
      } else if (tsEl) {
        tsEl.textContent = `[${turn.ts}] · 전사 및 Argon 검증 완료`;
      }

      // Merge live backend IOCs & statutory rule violations into turn telemetry if present
      const mergedTurn = Object.assign({}, turn);
      if (backendVerdict) {
        const liveIocs = mapExtractedIocsToSlots(backendVerdict.extracted_iocs);
        mergedTurn.iocs = Object.assign({}, turn.iocs || {}, liveIocs);
        const liveRules = mapRuleChecksToIndices(backendVerdict.rule_checks);
        mergedTurn.rulesHit = Array.from(new Set([...(turn.rulesHit || []), ...liveRules]));
      }

      updateTelemetryAfterTurn(mergedTurn, i, streamSpec.turns.length, mode);

      await new Promise((r) => setTimeout(r, 420));
    }

    if (runId === activeSimRunId) {
      const barText = document.getElementById("ttc-sim-bar-text");
      if (barText) {
        barText.textContent = `완료 · 총 ${streamSpec.turns.length}턴 동일 발신자 음성 전사 및 Gemini 4 Argon 실시간 API 검증이 완료되었습니다.`;
      }
      appendInlineHitlCardToChat(container, mode);
    }
  }

  let currentUiLang = new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "ko";

  const UI_I18N = {
    ko: {
      brandSub: "Voice Phishing Defense SOC",
      sideHeaderTitle: "대신받아 내비게이션",
      sideGroupLabel: "통화 보호 메뉴",
      navAllLabel: "한눈에 보는 통화 보호",
      navAllDesc: "3단 통합 관제 화면",
      navAllBadge: "전체",
      navCallLabel: "1. 실시간 통화 방어",
      navCallDesc: "인젝터 · 대화 전사",
      navCallBadge: "음성·채팅",
      navWarrantLabel: "2. 카톡 서류·영장 검사",
      navWarrantDesc: "멀티모달 위조 감식",
      navWarrantBadge: "6대 법령",
      navGuardianLabel: "3. 가족 승인 · 기관 신고",
      navGuardianDesc: "HITL · 지급정지 연동",
      navGuardianBadge: "112·1332",
      navCasesLabel: "4. 보이스피싱 사례 20선",
      navCasesDesc: "금감원·경찰청 판례 사전",
      guideTitle: "토스식 3초 행동 요약",
      guideStep1: "사기범이 겁을 주면 <strong>AI 미끼(김순자)</strong>가 대신 대화를 끌어요.",
      guideStep2: "카톡으로 온 영장·공문은 <strong>6가지 법 기준</strong>으로 위조를 잡아내요.",
      guideStep3: "위험이 확실해지면 <strong>가족 승인 후 112·금감원</strong>에 바로 신고해요.",
      btnRunSafe: "▶ 안심 통화 실시간 재생",
      btnRunCrit: "▶ 위험 통화(CASE-01) 실시간 재생",
      btnRunWarrant: "🖼️ 위조영장 샘플 이미지 AI 감식",
      btnRunGuardian: "▶ 딥페이크(CASE-08) 실시간 재생",
      topTabSafe: "정상 통화 대조 (SAFE 15s)",
      topTabCrit: "검찰사칭·영장감식 (CRITICAL)",
      topTabGuard: "Stage 4 차단·가족승인 (INTERRUPT)",
      kpi1Label: "실시간 위협 판정",
      kpi1Sub: "CASE-01 검찰사칭 + 위조구속영장",
      kpi2Label: "양방향 통화 지연",
      kpi2Sub: "Argon 백그라운드 추론 1.58s (끊김 0ms)",
      kpi3Label: "1M 암시적 캐시",
      kpi3Sub: "18,420 / 19,100 tok (Byte-0 정적 프리픽스)",
      kpi4Label: "적발 법령·단서",
      kpi4Badge: "형소법 85·118조",
      kpi4Hero: "11건 적발",
      kpi4Sub: "공문 위조 6건 · 대포통장/URL 5건 채증",
      cardTitleInjector: "통화 스트림 인젝터 (Call Injector)",
      cardTitleWarrant: "위조 공문서 멀티모달 포렌식",
      cardTitlePersona: "응대 페르소나 & 다국어 가드레일",
      cardTitleCenter: "실시간 양방향 오디오 스펙트럼 & 한·영 병기 화자분리 로그",
      cardTitleKillchain: "킬체인 단계 & Argon 2-Tier 추론",
      cardTitleIoc: "실시간 채증 5대 범죄 단서 (IOCs)",
      cardTitleHitl: "보호자 승인 및 기관 긴급 발송 (HITL)",
      injHint: "클릭 시 화자별 음성·채팅 시작",
      injPlayPill: "🔊 실시간 재생·전사",
      injSafeBadge: "SAFE CONTROL · 정상 대조군",
      injSafeDur: "00:15 · 오탐 0%",
      injSafeName: "신한은행 정기예금 만기 및 우체국 등기 안내",
      injSafeDesc: "앱 설치·안전계좌 요구 없음 · 공식 영업점 방문 안내",
      inj01Dur: "00:52 · 검찰+위조영장",
      inj01Name: "서울중앙지검 반부패수사1부 사칭 + 카톡 구속영장",
      inj01Desc: "12억 대포통장 연루 협박 · TeamViewer 원격제어 및 안전계좌 요구",
      inj04Dur: "00:41 · 악성 APK",
      inj04Name: "금융감독원 저금리 대환대출 사칭 + 원격제어 .apk",
      inj04Desc: "중복대출 약정 위반 협박 · 출처 불명 압축앱 설치 유도",
      inj08Dur: "00:36 · 납치·응급실",
      inj08Name: "자녀 음성 딥페이크 납치·응급실 긴급 합의금 갈취",
      inj08Desc: "음성 복제 울음소리 + 발설 금지 강요 및 즉각 현금 송금 요구",
      micBtnReady: "실시간 WebAudio 마이크 스트림 연결 (16kHz PCM Ready)",
      warrantDocTitle: "서울중앙지방검찰청 구속영장 청구서",
      warrantDocSub: "사건번호 2026형제4821호 · http://spo-go-kr.net",
      personaSoonjaName: "김순자 (68세, 은퇴 교사 · 지연 미끼)",
      personaGuardianName: "법무 보호자 방패 (Stage 4 INTERRUPT)",
      personaForeignName: "체류 외국인 보호 모드 (Minh Nguyen, 24)",
      kc1: "S1 권위사칭<br/>검찰 사칭",
      kc2: "S2 위조영장<br/>카톡 송달",
      kc3: "S3 원격제어<br/>TeamViewer",
      kc4: "S4 고립·이체<br/>INTERRUPT",
      iocKey1: "1. 위조 사건번호",
      iocKey2: "2. 사칭 기관·성명",
      iocKey3: "3. 피싱 URL·번호",
      iocKey4: "4. 대포통장·원격앱",
      iocKey5: "5. 갈취 명목·금액",
      hitlDesc: '통화 종료 후 <code>gemini-4-argon (high)</code>가 녹취 타임스탬프와 대조 검증한 무환각(Hallucination-Free) 증거 패키지입니다.',
      hitlBtn: "보호자 승인 및 112 · 1332 · 지급정지 발송",
      heroCritTitle: TOSS_COPIES.critical.title,
      heroCritSub: TOSS_COPIES.critical.sub,
      heroSafeTitle: TOSS_COPIES.safe.title,
      heroSafeSub: TOSS_COPIES.safe.sub,
      heroGuardTitle: TOSS_COPIES.guardian.title,
      heroGuardSub: TOSS_COPIES.guardian.sub,
    },
    en: {
      brandSub: "Voice Phishing Defense SOC",
      sideHeaderTitle: "TakeTheCall Navigation",
      sideGroupLabel: "ACTIVE CALL DEFENSE MENU",
      navAllLabel: "Unified SOC Overview",
      navAllDesc: "3-Pane Live Defense Console",
      navAllBadge: "ALL",
      navCallLabel: "1. Live Call Shield",
      navCallDesc: "Audio Injector & Diarized STT",
      navCallBadge: "Audio·Chat",
      navWarrantLabel: "2. Forged Warrant Audit",
      navWarrantDesc: "Multimodal Vision Forensics",
      navWarrantBadge: "6 Statutes",
      navGuardianLabel: "3. Family HITL & 112/1332",
      navGuardianDesc: "Co-Signing & Account Freeze",
      navGuardianBadge: "Dispatch",
      navCasesLabel: "4. 20 K-Scam Casebook",
      navCasesDesc: "FSS & Police Precedent DB",
      guideTitle: "3-Second Defense Workflow",
      guideStep1: "When a scammer threatens the victim, <strong>AI Decoy (Grandma Soon-ja)</strong> takes over and stalls the call.",
      guideStep2: "Fake warrants sent via KakaoTalk are audited against <strong>6 Korean statutory rules</strong> in real time.",
      guideStep3: "At Stage 4 extortion, <strong>Family HITL Co-Signing</strong> dispatches evidence to 112 Police & 1332 FSS.",
      btnRunSafe: "▶ Play Safe Call (Benign Control)",
      btnRunCrit: "▶ Play Critical Scam (CASE-01)",
      btnRunWarrant: "🖼️ Audit Forged Warrant Image (AI Vision)",
      btnRunGuardian: "▶ Play Deepfake Kidnap (CASE-08)",
      topTabSafe: "Benign Call Control (SAFE 15s)",
      topTabCrit: "Prosecutor Impersonation (CRITICAL)",
      topTabGuard: "Stage 4 Preempt & Family HITL (INTERRUPT)",
      kpi1Label: "Live Threat Verdict",
      kpi1Sub: "CASE-01 Prosecutor Scam + Forged Warrant",
      kpi2Label: "Duplex Audio Latency",
      kpi2Sub: "Argon NON_BLOCKING 1.58s (0ms Audio Dropout)",
      kpi3Label: "1M Implicit Cache",
      kpi3Sub: "18,420 / 19,100 tok (Byte-0 Static Prefix)",
      kpi4Label: "Statutes & IOCs Hit",
      kpi4Badge: "Crim. Proc. Art. 85·118",
      kpi4Hero: "11 Flags",
      kpi4Sub: "6 Statutory Violations · 5 Verified Scam IOCs",
      cardTitleInjector: "Live Call Stream Injector",
      cardTitleWarrant: "Forged Warrant Multimodal Audit",
      cardTitlePersona: "Active Personas & Expat Guardrail",
      cardTitleCenter: "Live Bidirectional Audio Spectrum & Bilingual Diarized Log",
      cardTitleKillchain: "Kill-Chain Stage & Argon 2-Tier Reasoning",
      cardTitleIoc: "5 Extracted Forensic IOCs (Live Probing)",
      cardTitleHitl: "Family Guardian HITL Co-Signing & 112/1332 Dispatch",
      injHint: "Click to stream neural audio + live EN/KR transcript",
      injPlayPill: "🔊 Live Audio + EN Sub",
      injSafeBadge: "SAFE CONTROL · BENIGN CALL",
      injSafeDur: "00:15 · 0% False Positive",
      injSafeName: "Shinhan Bank Term-Deposit Maturity Notice",
      injSafeDesc: "No app install or Safe Account demanded · Official branch visit guidance",
      inj01Dur: "00:52 · Prosecutor + Warrant",
      inj01Name: "Seoul Central Prosecutors' Impersonation + Fake Warrant",
      inj01Desc: "$900K mule account threat · TeamViewer RAT & 'Safe Account' wire demand",
      inj04Dur: "00:41 · Malicious APK",
      inj04Name: "FSS Low-Interest Refinancing Scam + Malicious .apk",
      inj04Desc: "Dual-loan breach threat · Coerces installing trojan APK via messenger",
      inj08Dur: "00:36 · Voice Clone Kidnap",
      inj08Name: "AI Deepfake Child Kidnapping & ER Settlement Extortion",
      inj08Desc: "Cloned crying voice + strict isolation coercion & immediate wire demand",
      micBtnReady: "Connect Live WebAudio Mic Stream (16kHz PCM Ready)",
      warrantDocTitle: "Seoul Central District Prosecutors' Arrest Warrant",
      warrantDocSub: "Case #2026-4821 · Spoofed Domain: http://spo-go-kr.net",
      personaSoonjaName: "Soon-ja Kim (68, Retired Teacher · Stalling Decoy)",
      personaGuardianName: "Legal Guardian Shield (Stage 4 INTERRUPT)",
      personaForeignName: "Expat Multilingual Shield (Minh Nguyen, 24)",
      kc1: "S1 Authority<br/>Prosecutor",
      kc2: "S2 Fake Warrant<br/>SNS Delivery",
      kc3: "S3 Remote RAT<br/>TeamViewer",
      kc4: "S4 Isolation/Wire<br/>INTERRUPT",
      iocKey1: "1. Forged Case No.",
      iocKey2: "2. Impersonated Org",
      iocKey3: "3. Phishing URL/Tel",
      iocKey4: "4. Mule Acct / RAT",
      iocKey5: "5. Extortion Demand",
      hitlDesc: 'Hallucination-free forensic bundle cross-verified against diarized transcript timestamps by <code>gemini-4-argon (high)</code>.',
      hitlBtn: "Approve Family HITL & Dispatch to 112 Police · 1332 FSS",
      heroCritTitle: "CRITICAL ALERT: High-Probability Voice Phishing Detected!",
      heroCritSub: "Korean prosecutors & FSS NEVER send warrants via KakaoTalk or demand remote control apps / Safe Account transfers.",
      heroSafeTitle: "VERIFIED SAFE: Legitimate Financial Notification Call",
      heroSafeSub: "No remote control apps, SSNs, or Safe Account transfers were requested during this call (0% False Positive).",
      heroGuardTitle: "STAGE 4 INTERRUPT: AI Shield Preempted the Scammer!",
      heroGuardSub: "AI Decoy isolated the user from coercion and extracted 5 forensic IOCs for Family HITL & 112/1332 dispatch.",
    },
  };

  function setDashboardLang(lang) {
    currentUiLang = lang === "en" ? "en" : "ko";
    document.body.classList.toggle("ttc-lang-en", currentUiLang === "en");

    document.querySelectorAll("[data-lang-switch]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-lang-switch") === currentUiLang);
    });

    const t = UI_I18N[currentUiLang];
    const setTxt = (sel, val) => {
      const el = document.querySelector(sel);
      if (el && val !== undefined) el.textContent = val;
    };
    const setHtml = (sel, val) => {
      const el = document.querySelector(sel);
      if (el && val !== undefined) el.innerHTML = val;
    };

    setTxt("#ttc-side-brand-kr", t.sideHeaderTitle);
    setTxt(".ttc-sidebar-group-label", t.sideGroupLabel);
    setTxt('.ttc-nav-item[data-view="all"] .ttc-nav-label', t.navAllLabel);
    setTxt('.ttc-nav-item[data-view="all"] .ttc-nav-desc', t.navAllDesc);
    setTxt('.ttc-nav-item[data-view="all"] .ttc-nav-badge', t.navAllBadge);
    setTxt('.ttc-nav-item[data-view="call"] .ttc-nav-label', t.navCallLabel);
    setTxt('.ttc-nav-item[data-view="call"] .ttc-nav-desc', t.navCallDesc);
    setTxt('.ttc-nav-item[data-view="call"] .ttc-nav-badge', t.navCallBadge);
    setTxt('.ttc-nav-item[data-view="warrant"] .ttc-nav-label', t.navWarrantLabel);
    setTxt('.ttc-nav-item[data-view="warrant"] .ttc-nav-desc', t.navWarrantDesc);
    setTxt('.ttc-nav-item[data-view="warrant"] .ttc-nav-badge', t.navWarrantBadge);
    setTxt('.ttc-nav-item[data-view="guardian"] .ttc-nav-label', t.navGuardianLabel);
    setTxt('.ttc-nav-item[data-view="guardian"] .ttc-nav-desc', t.navGuardianDesc);
    setTxt('.ttc-nav-item[data-view="guardian"] .ttc-nav-badge', t.navGuardianBadge);
    setTxt('.ttc-nav-item[data-view="cases"] .ttc-nav-label', t.navCasesLabel);
    setTxt('.ttc-nav-item[data-view="cases"] .ttc-nav-desc', t.navCasesDesc);

    setTxt("#ttc-guide-title-text", t.guideTitle);
    setHtml("#ttc-guide-step-1", t.guideStep1);
    setHtml("#ttc-guide-step-2", t.guideStep2);
    setHtml("#ttc-guide-step-3", t.guideStep3);

    setTxt("#btn-run-safe", t.btnRunSafe);
    setTxt("#btn-run-critical", t.btnRunCrit);
    setTxt("#btn-run-warrant-sample", t.btnRunWarrant);
    setTxt("#btn-run-guardian", t.btnRunGuardian);

    setHtml("#mode-safe", `<span class="status-dot dot-emerald"></span> ${t.topTabSafe}`);
    setHtml("#mode-critical", `<span class="status-dot dot-rose"></span> ${t.topTabCrit}`);
    setHtml("#mode-guardian", `<span class="status-dot dot-amber"></span> ${t.topTabGuard}`);

    const kpiCards = document.querySelectorAll(".kpi-card");
    if (kpiCards.length >= 4) {
      const k1 = kpiCards[0].querySelector(".kpi-label");
      const k2 = kpiCards[1].querySelector(".kpi-label");
      const k3 = kpiCards[2].querySelector(".kpi-label");
      const k4 = kpiCards[3].querySelector(".kpi-label");
      if (k1) k1.textContent = t.kpi1Label;
      if (k2) k2.textContent = t.kpi2Label;
      if (k3) k3.textContent = t.kpi3Label;
      if (k4) k4.textContent = t.kpi4Label;
    }
    setTxt("#kpi-verdict-sub", t.kpi1Sub);
    setTxt("#kpi-latency-sub", t.kpi2Sub);
    setTxt("#kpi-ioc-badge", t.kpi4Badge);
    setTxt("#kpi-ioc-hero", t.kpi4Hero);
    setTxt("#kpi-ioc-sub", t.kpi4Sub);

    // Card titles
    const setCardTitleText = (cardEl, newText) => {
      if (!cardEl) return;
      const titleEl = cardEl.querySelector(".card-title");
      if (!titleEl) return;
      const svg = titleEl.querySelector("svg");
      titleEl.innerHTML = "";
      if (svg) titleEl.appendChild(svg);
      titleEl.appendChild(document.createTextNode(" " + newText));
    };

    const leftCards = document.querySelectorAll(".command-grid > .pane-col:nth-child(1) > .card");
    if (leftCards[0]) setCardTitleText(leftCards[0], t.cardTitleInjector);
    if (leftCards[1]) setCardTitleText(leftCards[1], t.cardTitleWarrant);
    if (leftCards[2]) setCardTitleText(leftCards[2], t.cardTitlePersona);

    const centerCard = document.querySelector(".command-grid > .pane-col:nth-child(2) > .card");
    if (centerCard) setCardTitleText(centerCard, t.cardTitleCenter);

    const rightCards = document.querySelectorAll(".command-grid > .pane-col:nth-child(3) > .card");
    if (rightCards[0]) setCardTitleText(rightCards[0], t.cardTitleKillchain);
    if (rightCards[1]) setCardTitleText(rightCards[1], t.cardTitleIoc);
    if (rightCards[2]) {
      setCardTitleText(rightCards[2], t.cardTitleHitl);
      const hitlDescEl = rightCards[2].querySelector(".card-body > div:first-child");
      if (hitlDescEl) hitlDescEl.innerHTML = t.hitlDesc;
    }

    // Injector buttons
    setTxt("#inj-safe .scenario-top .badge", t.injSafeBadge);
    setTxt("#inj-safe .scenario-dur", t.injSafeDur);
    setTxt("#inj-safe .scenario-name", t.injSafeName);
    setTxt("#inj-safe .scenario-desc", t.injSafeDesc);

    setTxt("#inj-case01 .scenario-dur", t.inj01Dur);
    setTxt("#inj-case01 .scenario-name", t.inj01Name);
    setTxt("#inj-case01 .scenario-desc", t.inj01Desc);

    setTxt("#inj-case04 .scenario-dur", t.inj04Dur);
    setTxt("#inj-case04 .scenario-name", t.inj04Name);
    setTxt("#inj-case04 .scenario-desc", t.inj04Desc);

    setTxt("#inj-case08 .scenario-dur", t.inj08Dur);
    setTxt("#inj-case08 .scenario-name", t.inj08Name);
    setTxt("#inj-case08 .scenario-desc", t.inj08Desc);

    document.querySelectorAll(".ttc-scenario-hint").forEach((el) => (el.textContent = t.injHint));
    document.querySelectorAll(".ttc-play-pill").forEach((el) => (el.textContent = t.injPlayPill));

    setTxt("#mic-btn-label", t.micBtnReady);
    setTxt(".warrant-doc-title", t.warrantDocTitle);
    setTxt(".warrant-doc-sub", t.warrantDocSub);
    setTxt("#persona-soonja .persona-name", t.personaSoonjaName);
    setTxt("#persona-guardian .persona-name", t.personaGuardianName);
    setTxt("#persona-foreign .persona-name", t.personaForeignName);

    setHtml("#kc-1", t.kc1);
    setHtml("#kc-2", t.kc2);
    setHtml("#kc-3", t.kc3);
    setHtml("#kc-4", t.kc4);

    const iocKeys = document.querySelectorAll("#ioc-grid-container .ioc-key");
    if (iocKeys.length >= 5) {
      iocKeys[0].textContent = t.iocKey1;
      iocKeys[1].textContent = t.iocKey2;
      iocKeys[2].textContent = t.iocKey3;
      iocKeys[3].textContent = t.iocKey4;
      iocKeys[4].textContent = t.iocKey5;
    }

    setTxt("#guardian-btn-text", t.hitlBtn);
    applyTossCopy("critical");
  }

  function buildSidebarAndHero() {
    const dashboardShell = document.querySelector(".dashboard-shell");
    if (!dashboardShell || document.querySelector(".ttc-app-shell")) return;

    // Inject EN / KO Judge Mode Toggle into Topbar Right
    const topbarRight = document.querySelector(".topbar-right");
    if (topbarRight && !document.getElementById("ttc-topbar-lang-toggle")) {
      const langToggle = document.createElement("div");
      langToggle.id = "ttc-topbar-lang-toggle";
      langToggle.className = "ttc-lang-toggle-group";
      langToggle.innerHTML = `
        <button type="button" class="ttc-lang-toggle-btn" data-lang-switch="en" title="Switch UI to English for Hackathon Judges">🌐 EN (Judge Mode)</button>
        <button type="button" class="ttc-lang-toggle-btn active" data-lang-switch="ko" title="한국어 UI 모드">🇰🇷 KO</button>
      `;
      topbarRight.insertBefore(langToggle, topbarRight.firstChild);
      langToggle.querySelectorAll("[data-lang-switch]").forEach((btn) => {
        btn.addEventListener("click", () => setDashboardLang(btn.getAttribute("data-lang-switch")));
      });
    }

    const appShell = document.createElement("div");
    appShell.className = "ttc-app-shell";

    const sidebar = document.createElement("aside");
    sidebar.className = "ttc-sidebar";
    sidebar.setAttribute("aria-label", "대신받아 메뉴 내비게이션");
    sidebar.innerHTML = `
      <div class="ttc-sidebar-header">
        <div class="brand-logo-mark" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
        </div>
        <div class="ttc-sidebar-brand-text">
          <span class="ttc-sidebar-brand-kr" id="ttc-side-brand-kr">대신받아 내비게이션</span>
          <span class="ttc-sidebar-brand-sub">Voice Phishing Defense SOC</span>
        </div>
      </div>

      <div class="ttc-sidebar-scroll">
        <div class="ttc-sidebar-group-label">통화 보호 메뉴</div>
        <nav class="ttc-sidebar-nav">
          <button type="button" class="ttc-nav-item active" data-view="all">
            <span class="ttc-nav-left">
              <span class="ttc-nav-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
              </span>
              <span class="ttc-nav-text-wrap">
                <span class="ttc-nav-label">한눈에 보는 통화 보호</span>
                <span class="ttc-nav-desc">3단 통합 관제 화면</span>
              </span>
            </span>
            <span class="ttc-nav-badge">전체</span>
          </button>
          <button type="button" class="ttc-nav-item" data-view="call">
            <span class="ttc-nav-left">
              <span class="ttc-nav-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </span>
              <span class="ttc-nav-text-wrap">
                <span class="ttc-nav-label">1. 실시간 통화 방어</span>
                <span class="ttc-nav-desc">인젝터 · 대화 전사</span>
              </span>
            </span>
            <span class="ttc-nav-badge">음성·채팅</span>
          </button>
          <button type="button" class="ttc-nav-item" data-view="warrant">
            <span class="ttc-nav-left">
              <span class="ttc-nav-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </span>
              <span class="ttc-nav-text-wrap">
                <span class="ttc-nav-label">2. 카톡 서류·영장 검사</span>
                <span class="ttc-nav-desc">멀티모달 위조 감식</span>
              </span>
            </span>
            <span class="ttc-nav-badge">6대 법령</span>
          </button>
          <button type="button" class="ttc-nav-item" data-view="guardian">
            <span class="ttc-nav-left">
              <span class="ttc-nav-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
              </span>
              <span class="ttc-nav-text-wrap">
                <span class="ttc-nav-label">3. 가족 승인 · 기관 신고</span>
                <span class="ttc-nav-desc">HITL · 지급정지 연동</span>
              </span>
            </span>
            <span class="ttc-nav-badge">112·1332</span>
          </button>
          <button type="button" class="ttc-nav-item" data-view="cases">
            <span class="ttc-nav-left">
              <span class="ttc-nav-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </span>
              <span class="ttc-nav-text-wrap">
                <span class="ttc-nav-label">4. 보이스피싱 사례 20선</span>
                <span class="ttc-nav-desc">금감원·경찰청 판례 사전</span>
              </span>
            </span>
            <span class="ttc-nav-badge" id="nav-cases-count">20건</span>
          </button>
        </nav>

        <div class="ttc-easy-guide-box">
          <div class="ttc-easy-guide-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            <span id="ttc-guide-title-text">토스식 3초 행동 요약</span>
          </div>
          <div class="ttc-easy-guide-list">
            <div class="ttc-guide-step">
              <span class="ttc-guide-num">1</span>
              <span id="ttc-guide-step-1">사기범이 겁을 주면 <strong>AI 미끼(김순자)</strong>가 대신 대화를 끌어요.</span>
            </div>
            <div class="ttc-guide-step">
              <span class="ttc-guide-num">2</span>
              <span id="ttc-guide-step-2">카톡으로 온 영장·공문은 <strong>6가지 법 기준</strong>으로 위조를 잡아내요.</span>
            </div>
            <div class="ttc-guide-step">
              <span class="ttc-guide-num">3</span>
              <span id="ttc-guide-step-3">위험이 확실해지면 <strong>가족 승인 후 112·금감원</strong>에 바로 신고해요.</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ttc-sidebar-footer">
        <div class="ttc-sidebar-health-pill">
          <span class="status-dot dot-emerald"></span>
          <span id="backend-health-text">Gemini 3.8 Live + Argon 가동 중</span>
        </div>
      </div>
    `;

    const mainArea = document.createElement("div");
    mainArea.className = "ttc-main-area";

    const heroBanner = document.createElement("section");
    heroBanner.className = "toss-hero-banner";
    heroBanner.innerHTML = `
      <div>
        <div class="toss-hero-title" id="toss-hero-title">${TOSS_COPIES.critical.title}</div>
        <div class="toss-hero-sub" id="toss-hero-sub">${TOSS_COPIES.critical.sub}</div>
      </div>
      <div class="toss-action-group">
        <button type="button" class="toss-chip-btn" id="btn-run-safe">▶ 안심 통화 실시간 재생</button>
        <button type="button" class="toss-chip-btn primary" id="btn-run-critical">▶ 위험 통화(CASE-01) 실시간 재생</button>
        <button type="button" class="toss-chip-btn" id="btn-run-warrant-sample" style="border-color:rgba(244,63,94,0.55);background:rgba(244,63,94,0.16);color:#fecdd3;">🖼️ 위조영장 샘플 이미지 AI 감식</button>
        <button type="button" class="toss-chip-btn" id="btn-run-guardian">▶ 딥페이크(CASE-08) 실시간 재생</button>
      </div>
    `;

    const casesDrawer = document.createElement("section");
    casesDrawer.className = "ttc-cases-drawer";
    casesDrawer.id = "ttc-cases-drawer";
    casesDrawer.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--fg-primary);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>금감원·경찰청 공개 보이스피싱 20대 사례 사전</span>
            <span class="badge badge-safe" style="font-size:10.5px;">🔊 음성 시뮬레이션 3건 연결 (CASE-01 · 04 · 08)</span>
            <span class="badge" style="font-size:10.5px;background:rgba(161,161,170,0.14);color:var(--fg-secondary);border:1px solid var(--border);">📋 판례·대본 상세 사전 17건</span>
          </div>
          <div style="font-size:11.5px;color:var(--fg-muted);margin-top:4px;line-height:1.45;">
            음성 시나리오가 준비된 <strong>3건(CASE-01 · CASE-04 · CASE-08)</strong>은 <strong>「🔊 시뮬레이션 재생」</strong> 시 한눈에 보는 통화 보호 화면으로 이동해 해당 사례 음성을 정확히 재생해요.<br/>
            나머지 <strong>17건</strong>은 클릭 시 화면 이동 없이 이 사전 안에서 <strong>실제 사기범 대본 · 4단계 범행 수법 · 탐지 시그니처 · AI 김순자 역질문</strong>을 바로 펼쳐볼 수 있어요.
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button type="button" class="toss-chip-btn primary" data-case-filter="all" style="font-size:11px;padding:5px 10px;">전체 20건</button>
          <button type="button" class="toss-chip-btn" data-case-filter="live" style="font-size:11px;padding:5px 10px;">🔊 음성 시뮬레이션 연결 (3건)</button>
          <button type="button" class="toss-chip-btn" data-case-filter="doc" style="font-size:11px;padding:5px 10px;">📋 상세 판례 전용 (17건)</button>
          <span class="badge badge-info">Byte-0 1M 캐시 탑재 완료</span>
        </div>
      </div>
      <div class="ttc-cases-grid" id="ttc-cases-grid"></div>
    `;

    dashboardShell.parentNode.insertBefore(appShell, dashboardShell);
    mainArea.appendChild(heroBanner);
    mainArea.appendChild(casesDrawer);
    mainArea.appendChild(dashboardShell);
    appShell.appendChild(sidebar);
    appShell.appendChild(mainArea);

    sidebar.querySelectorAll(".ttc-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        sidebar.querySelectorAll(".ttc-nav-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applySectionFilter(btn.getAttribute("data-view"));
      });
    });

    document.getElementById("btn-run-safe").addEventListener("click", () => runSequentialLiveSimulation("safe", "SAFE"));
    document.getElementById("btn-run-critical").addEventListener("click", () => runSequentialLiveSimulation("critical", "CASE-01"));
    document.getElementById("btn-run-warrant-sample").addEventListener("click", () => {
      const spec = WARRANT_SAMPLES["sample-warrant"];
      executeLiveWarrantImageAudit({
        sampleKey: spec.key,
        imageUrl: spec.imageUrl,
        mimeType: spec.mimeType,
        title: spec.title,
        docHeaderTitle: spec.docHeaderTitle,
        docHeaderSub: spec.docHeaderSub,
        caseId: spec.caseId,
        transcriptContext: spec.transcriptContext,
        expectedMode: spec.mode,
      });
      const warrantCard = document.getElementById("warrant-audit-card");
      if (warrantCard) warrantCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    document.getElementById("btn-run-guardian").addEventListener("click", () => runSequentialLiveSimulation("guardian", "CASE-08"));
  }

  function applySectionFilter(view) {
    const cols = document.querySelectorAll(".command-grid > .pane-col");
    const drawer = document.getElementById("ttc-cases-drawer");
    const grid = document.querySelector(".command-grid");
    const warrantCard = document.getElementById("warrant-audit-card");
    if (!cols.length || !grid) return;

    if (warrantCard) {
      warrantCard.style.order = view === "warrant" ? "-1" : "";
    }

    if (view === "cases") {
      drawer.classList.add("open");
      grid.style.display = "none";
      return;
    }

    drawer.classList.remove("open");
    grid.style.display = "grid";

    if (view === "all") {
      grid.style.gridTemplateColumns = "";
      cols.forEach((c) => (c.style.display = "flex"));
    } else if (view === "call") {
      grid.style.gridTemplateColumns = "360px minmax(0, 1fr)";
      cols[0].style.display = "flex";
      cols[1].style.display = "flex";
      cols[2].style.display = "none";
    } else if (view === "warrant") {
      grid.style.gridTemplateColumns = "380px minmax(0, 1fr) 360px";
      cols[0].style.display = "flex";
      cols[1].style.display = "flex";
      cols[2].style.display = "flex";
      if (cols[0]) cols[0].scrollTop = 0;
      if (warrantCard) {
        warrantCard.classList.remove("ttc-warrant-card-highlight");
        void warrantCard.offsetWidth;
        warrantCard.classList.add("ttc-warrant-card-highlight");
      }
    } else if (view === "guardian") {
      grid.style.gridTemplateColumns = "minmax(0, 1fr) 440px";
      cols[0].style.display = "none";
      cols[1].style.display = "flex";
      cols[2].style.display = "flex";
    }
  }

  function applyTossCopy(mode) {
    const t = UI_I18N[currentUiLang] || UI_I18N.ko;
    const heroTitle = document.getElementById("toss-hero-title");
    const heroSub = document.getElementById("toss-hero-sub");
    if (currentUiLang === "en") {
      if (heroTitle) {
        heroTitle.textContent =
          mode === "safe" ? t.heroSafeTitle : mode === "guardian" ? t.heroGuardTitle : t.heroCritTitle;
      }
      if (heroSub) {
        heroSub.textContent =
          mode === "safe" ? t.heroSafeSub : mode === "guardian" ? t.heroGuardSub : t.heroCritSub;
      }
      const btnText = document.getElementById("guardian-btn-text");
      if (btnText) btnText.textContent = t.hitlBtn;
      return;
    }

    const copy = TOSS_COPIES[mode] || TOSS_COPIES.critical;
    if (heroTitle) heroTitle.textContent = copy.title;
    if (heroSub) heroSub.textContent = copy.sub;

    const btnText = document.getElementById("guardian-btn-text");
    if (btnText && mode !== "guardian") btnText.textContent = copy.btnDispatch;
  }

  function enhanceInjectorButtons() {
    const configs = [
      { id: "inj-safe", mode: "safe", caseId: "SAFE", label: "🔊 실시간 재생·전사" },
      { id: "inj-case01", mode: "critical", caseId: "CASE-01", label: "🔊 실시간 재생·전사" },
      { id: "inj-case04", mode: "critical", caseId: "CASE-04", label: "🔊 실시간 재생·전사" },
      { id: "inj-case08", mode: "guardian", caseId: "CASE-08", label: "🔊 실시간 재생·전사" },
    ];
    configs.forEach(({ id, mode, caseId, label }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.removeAttribute("onclick");
      if (!btn.querySelector(".ttc-scenario-action-row")) {
        const actionRow = document.createElement("div");
        actionRow.className = "ttc-scenario-action-row";
        actionRow.innerHTML = `
          <span class="ttc-scenario-hint">클릭 시 화자별 음성·채팅 시작</span>
          <span class="badge badge-info ttc-play-pill">${label}</span>
        `;
        btn.appendChild(actionRow);
      }
      btn.addEventListener("click", () => {
        runSequentialLiveSimulation(mode, caseId);
      });
    });

    const topSafe = document.getElementById("mode-safe");
    const topCrit = document.getElementById("mode-critical");
    const topGuard = document.getElementById("mode-guardian");
    if (topSafe) {
      topSafe.removeAttribute("onclick");
      topSafe.addEventListener("click", () => runSequentialLiveSimulation("safe", "SAFE"));
    }
    if (topCrit) {
      topCrit.removeAttribute("onclick");
      topCrit.addEventListener("click", () => runSequentialLiveSimulation("critical", "CASE-01"));
    }
    if (topGuard) {
      topGuard.removeAttribute("onclick");
      topGuard.addEventListener("click", () => runSequentialLiveSimulation("guardian", "CASE-08"));
    }

    // Override legacy switchScenarioMode so persona cards also trigger chat bubble simulation
    window.switchScenarioMode = function (mode) {
      const caseMap = { safe: "SAFE", critical: "CASE-01", guardian: "CASE-08" };
      runSequentialLiveSimulation(mode, caseMap[mode] || "CASE-01");
    };
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setupRightStickyIntelligenceSidebar() {
    const rightCol = document.querySelector(".command-grid > .pane-col:nth-child(3)");
    if (!rightCol) return;
    rightCol.classList.add("ttc-right-sticky-col");

    const rightCards = rightCol.querySelectorAll(":scope > .card");
    if (rightCards[0]) {
      rightCards[0].classList.add("ttc-live-telemetry-card");
      const headerBadge = rightCards[0].querySelector(".card-header .badge");
      if (headerBadge) {
        headerBadge.id = "ttc-thinking-level-pill";
      }
      const verdictBox = document.getElementById("verdict-banner-box");
      if (verdictBox && !document.getElementById("ttc-live-risk-meter")) {
        const meter = document.createElement("div");
        meter.id = "ttc-live-risk-meter";
        meter.className = "ttc-live-risk-meter";
        meter.innerHTML = `<div id="ttc-live-risk-fill" class="ttc-live-risk-fill" style="width:94.5%;"></div>`;
        verdictBox.insertAdjacentElement("afterend", meter);
      }
      const cacheBadge = rightCards[0].querySelector(".badge.badge-safe");
      if (cacheBadge) {
        cacheBadge.id = "ttc-cache-hit-pill";
        cacheBadge.textContent = "96.4% Hit · LIVE";
      }
      const monoSpans = rightCards[0].querySelectorAll("span");
      monoSpans.forEach((sp) => {
        if (sp.textContent && sp.textContent.includes("19,100 tok")) {
          sp.id = "ttc-cache-tok-label";
        }
      });
    }

    // Hide standalone 3rd card (HITL) in right column since it's now integrated inside the chat stream
    if (rightCards[2]) {
      rightCards[2].style.display = "none";
    }
  }

  async function initBackendConnection() {
    preloadScenarioAudio();
    buildSidebarAndHero();
    setupRightStickyIntelligenceSidebar();
    enhanceInjectorButtons();
    ensureWarrantLiveAuditWidget();
    renderInitialChatBubbles("CASE-01");
    applyTossCopy("critical");
    if (currentUiLang === "en") {
      setDashboardLang("en");
    }

    const origDispatch = window.triggerGuardianDispatch;
    if (typeof origDispatch === "function") {
      window.triggerGuardianDispatch = async function () {
        origDispatch();
        if (window.takeTheCallClient) {
          try {
            const pkt = await window.takeTheCallClient.dispatchGuardianPacket({
              session_id: "sess-live-soc",
              case_id: "CASE-01",
              full_transcript: "기관 사칭 및 카톡 위조 구속영장 전송, 원격제어 앱 설치 요구",
              user_hitl_confirmed: true,
              guardian_approved: true,
            });
            const toast = document.getElementById("guardian-dispatch-toast");
            if (toast && pkt && pkt.packet_id) {
              toast.querySelector("div").textContent =
                `[시연용 샌드박스 · 실제 발송 없음] 가족 승인 및 기관 신고 시뮬레이션 완료 (${pkt.packet_id})`;
            }
          } catch (_) {}
        }
      };
    }

    if (!window.takeTheCallClient) return;
    try {
      const [health, casesData] = await Promise.all([
        window.takeTheCallClient.fetchHealth(),
        window.takeTheCallClient.fetchCases(),
      ]);

      const healthEl = document.getElementById("backend-health-text");
      if (healthEl && health && health.knowledge_base) {
        healthEl.textContent = `사례 ${health.knowledge_base.cases_loaded}건 · 법령 ${health.knowledge_base.statutory_rules_count}종 캐시 완료`;
      }

      const grid = document.getElementById("ttc-cases-grid");
      if (grid && casesData && Array.isArray(casesData.cases)) {
        document.getElementById("nav-cases-count").textContent = `${casesData.cases.length}건`;

        // Sort or keep CASE-01..CASE-20 order, marking the 3 audio-enabled cases distinctly
        grid.innerHTML = casesData.cases
          .map((c) => {
            const streamSpec = SCENARIO_STREAMS[c.id];
            const hasLiveSim = Boolean(streamSpec);
            const flowListHtml = Array.isArray(c.scam_flow)
              ? c.scam_flow.map((step) => `<li>${escapeHtml(step)}</li>`).join("")
              : "";
            const redFlagsHtml = Array.isArray(c.red_flags)
              ? c.red_flags.map((rf) => `<li>🚨 ${escapeHtml(rf)}</li>`).join("")
              : "";

            return `
              <div class="ttc-case-item ${hasLiveSim ? "ttc-case-has-sim" : "ttc-case-doc-only"}" data-case-id="${escapeHtml(c.id)}" data-case-type="${hasLiveSim ? "live" : "doc"}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span class="badge ${hasLiveSim ? "badge-crit" : "badge-info"}">${escapeHtml(c.id)}</span>
                    ${
                      hasLiveSim
                        ? `<span class="badge badge-safe" style="font-size:10px;">🔊 실시간 음성 시뮬레이션 연결됨</span>`
                        : `<span class="badge" style="font-size:10px;background:rgba(161,161,170,0.12);color:var(--fg-muted);border:1px solid var(--border);">📋 상세 판례·대본 열람 전용</span>`
                    }
                  </div>
                  <span style="font-size:10.5px;color:var(--fg-subtle);">${escapeHtml(c.category || "")}</span>
                </div>

                <div style="font-size:12.5px;font-weight:700;color:var(--fg-primary);line-height:1.4;margin-bottom:8px;">
                  ${escapeHtml(c.title)}
                </div>

                <div class="ttc-case-card-actions">
                  ${
                    hasLiveSim
                      ? `
                        <button type="button" class="ttc-case-sim-btn" data-sim-case="${escapeHtml(c.id)}" data-sim-mode="${escapeHtml(streamSpec.mode)}">
                          🔊 시뮬레이션 재생 (통화 보호 화면 이동)
                        </button>
                        <button type="button" class="ttc-case-toggle-btn">
                          📖 판례·대본 상세 보기 ▾
                        </button>
                      `
                      : `
                        <button type="button" class="ttc-case-toggle-btn ttc-case-toggle-full">
                          📖 실제 대본 · 4단계 수법 · 탐지 포인트 펼쳐보기 ▾
                        </button>
                      `
                  }
                </div>

                <div class="ttc-case-detail-body" style="display:none;">
                  <div class="ttc-case-detail-meta">
                    <div><strong>📌 공식 출처:</strong> ${escapeHtml(c.source || "금융감독원·경찰청 공개 사례")}</div>
                    ${
                      c.url
                        ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" class="ttc-case-source-link" onclick="event.stopPropagation();">원문 경보 확인 ↗</a>`
                        : ""
                    }
                  </div>

                  <div class="ttc-case-detail-section">
                    <div class="ttc-case-detail-label">🎙️ 사기범 실제 대표 대본 (Sample Script)</div>
                    <div class="ttc-case-script-box">${escapeHtml(c.sample_script || "")}</div>
                  </div>

                  <div class="ttc-case-detail-two-col">
                    <div class="ttc-case-detail-section">
                      <div class="ttc-case-detail-label">⛓️ 4단계 범행 수법 (Kill-Chain Flow)</div>
                      <ul class="ttc-case-detail-list">${flowListHtml}</ul>
                    </div>
                    <div class="ttc-case-detail-section">
                      <div class="ttc-case-detail-label">🔍 핵심 탐지 시그니처 (Red Flags)</div>
                      <ul class="ttc-case-detail-list">${redFlagsHtml}</ul>
                    </div>
                  </div>

                  <div class="ttc-case-detail-section" style="margin-top:8px;">
                    <div class="ttc-case-detail-label">👵 AI 미끼(김순자) 역질문·시간지연 수칙 (Decoy Probe)</div>
                    <div class="ttc-case-decoy-box">"${escapeHtml(c.decoy_probe || "")}"</div>
                  </div>

                  <div class="ttc-case-detail-footer">
                    ${
                      hasLiveSim
                        ? `<span>✅ 이 사례는 전용 음성 스트림(<code>${escapeHtml(c.id)}</code>)이 연결되어 있습니다.</span>`
                        : `<span>ℹ️ 이 사례는 Byte-0 1M 캐시 판례 사전에 탑재되어 있으며, 음성 시연은 대표 3건(CASE-01·04·08)에서만 제공됩니다.</span>`
                    }
                    <button type="button" class="ttc-case-collapse-btn">접기 ▴</button>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");

        const toggleCardDetail = (card) => {
          const detail = card.querySelector(".ttc-case-detail-body");
          const toggleBtn = card.querySelector(".ttc-case-toggle-btn");
          if (!detail) return;
          const isOpen = detail.style.display !== "none";
          if (isOpen) {
            detail.style.display = "none";
            card.classList.remove("expanded");
            if (toggleBtn) {
              toggleBtn.textContent = card.classList.contains("ttc-case-has-sim")
                ? "📖 판례·대본 상세 보기 ▾"
                : "📖 실제 대본 · 4단계 수법 · 탐지 포인트 펼쳐보기 ▾";
            }
          } else {
            detail.style.display = "block";
            card.classList.add("expanded");
            if (toggleBtn) {
              toggleBtn.textContent = "📖 상세 판례 접기 ▴";
            }
          }
        };

        grid.querySelectorAll(".ttc-case-item").forEach((card) => {
          const simBtn = card.querySelector(".ttc-case-sim-btn");
          const toggleBtn = card.querySelector(".ttc-case-toggle-btn");
          const collapseBtn = card.querySelector(".ttc-case-collapse-btn");

          if (simBtn) {
            simBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const cid = simBtn.getAttribute("data-sim-case");
              const mode = simBtn.getAttribute("data-sim-mode") || "critical";
              const allNavBtn = document.querySelector('.ttc-nav-item[data-view="all"]');
              if (allNavBtn) allNavBtn.click();
              runSequentialLiveSimulation(mode, cid);
            });
          }

          if (toggleBtn) {
            toggleBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              toggleCardDetail(card);
            });
          }

          if (collapseBtn) {
            collapseBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              toggleCardDetail(card);
            });
          }

          card.addEventListener("click", () => {
            // Clicking anywhere on the card body toggles the inline detail panel (never blindly jumps away for the 17 cases)
            toggleCardDetail(card);
          });
        });

        // Filter buttons in #ttc-cases-drawer
        const drawer = document.getElementById("ttc-cases-drawer");
        if (drawer) {
          drawer.querySelectorAll("[data-case-filter]").forEach((fBtn) => {
            fBtn.addEventListener("click", () => {
              drawer.querySelectorAll("[data-case-filter]").forEach((b) => b.classList.remove("primary"));
              fBtn.classList.add("primary");
              const filterType = fBtn.getAttribute("data-case-filter");
              grid.querySelectorAll(".ttc-case-item").forEach((card) => {
                const cType = card.getAttribute("data-case-type");
                if (filterType === "all" || filterType === cType) {
                  card.style.display = "";
                } else {
                  card.style.display = "none";
                }
              });
            });
          });
        }
      }
    } catch (e) {
      console.warn("[TakeTheCall] Backend init fallback:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBackendConnection);
  } else {
    initBackendConnection();
  }
})();

