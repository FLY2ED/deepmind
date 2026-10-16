"""Synthesize natural multi-speaker TTS audio files for SCENARIO_STREAMS in static/dashboard-app.js.

Supports two engines automatically:
1. Primary (when GEMINI_API_KEY is set): `gemini-3.8-flash-tts` via Google GenAI Interactions API
   with studio prebuilt voices (`Gacrux`, `Sulafat`, `Charon`, `Fenrir`, `Leda`, `Kore`, `Orus`),
   `speech_metadata.style` acting directives, and inline vocal tags (`<sigh>`, `<short pause>`, `<gasp>`, `<breath>`).
2. Offline/No-Key Fallback: `edge_tts` with zero-formant-distortion natural prosody (no extreme pitch warping)
   and conversational spoken phrasing.
"""

from __future__ import annotations

import asyncio
import base64
import os
import re
import subprocess
import tempfile
from pathlib import Path

from dotenv import load_dotenv
import edge_tts

ROOT = Path("/data/projects/deepmind")
for _env_candidate in (Path("/data/secret/gemini.env"), ROOT / ".env"):
    if _env_candidate.is_file():
        load_dotenv(_env_candidate, override=False)
JS_PATH = ROOT / "static" / "dashboard-app.js"
OUT_DIR = ROOT / "assets" / "audio"

# 1. Gemini 3.8 Flash TTS studio voice + acting style + inline vocal tag script
GEMINI_TTS_PROFILES: dict[str, tuple[str, str, str]] = {
    # (voice_name, speech_metadata.style, expressive_script_with_inline_tags)
    "safe_t1.mp3": (
        "Sadaltager",
        "warm, polite, professional Korean bank clerk",
        "안녕하세요 김순자 고객님, <short pause> 신한은행 분당지점입니다. 가입하신 정기예금 만기일이 도래하여 안내차 연락드렸습니다.",
    ),
    "safe_t2.mp3": (
        "Sulafat",
        "gentle, cautious elderly Korean grandmother speaking naturally",
        "아, 그래요? <short pause> 요즘 보이스피싱이 워낙 많아서 걱정인데... 혹시 뭐 앱을 깔거나 돈을 어디로 보내야 하나요?",
    ),
    "safe_t3.mp3": (
        "Sadaltager",
        "reassuring, calm, polite Korean bank clerk",
        "전혀 아닙니다 고객님. <short pause> 은행은 절대 앱 설치나 계좌 이체를 요구하지 않습니다. 편하신 날 신분증 지참 후 가까운 영업점 창구로 방문해 주세요.",
    ),
    "case01_t1.mp3": (
        "Charon",
        "cold, authoritative, bureaucratic prosecutor tone",
        "서울중앙지검 첨단범죄수사부입니다. <short pause> 김순자 씨 명의 통장이 대포통장 사건에 연루되어, 카톡으로 사건번호 2026형제4821호 전자구속영장을 보냈습니다.",
    ),
    "case01_t2.mp3": (
        "Sulafat",
        "flustered, worried elderly grandmother stalling for time",
        "<sigh> 아이고 수사관님... 제가 통장을 빌려준 적도 없는데 어쩌지요. <short pause> 잠시만요, 돋보기를 끼고 영장 번호랑 부서 번호를 다시 확인해 볼게요.",
    ),
    "case01_t3.mp3": (
        "Iapetus",
        "calm, analytical, composed legal verification tone",
        "수사관님, <short pause> 형사소송법 제85조상 구속영장은 직접 제시가 원칙인데, 대검찰청 대표번호로 이 사건번호를 먼저 조회해 봐도 되지요?",
    ),
    "case01_t4.mp3": (
        "Charon",
        "urgent, pressuring, authoritative prosecutor demanding immediate compliance",
        "지금 기밀 수사 중이라 외부에 알리면 즉시 구속 집행합니다! <short pause> 보내드린 주소에서 원격 점검 앱을 설치하고, 안전계좌로 자금을 이체해 검수받으세요!",
    ),
    "case01_t5.mp3": (
        "Kore",
        "firm, clear, authoritative AI security guardian",
        "경고합니다. <short pause> 대신받아 AI 방어 시스템이 형사소송법 제85조 위반 및 원격제어 유도 증거 다섯 건을 채증하여, 통화를 즉시 차단하고 보호자 승인 모드로 전환합니다.",
    ),
    "case04_t1.mp3": (
        "Alnilam",
        "fast-paced, bureaucratic financial regulator tone",
        "금융감독원 가계부채지원팀입니다. <short pause> 고객님 기존 대출이 중복대출 약정 위반으로 확인되어, 금감원 민원 2026-8812호로 계좌 동결 예정입니다.",
    ),
    "case04_t2.mp3": (
        "Sulafat",
        "confused, hesitant elderly woman asking for clarification",
        "<gasp> 어머, 그래요? <short pause> 제가 대출을 하나밖에 안 받았는데 왜 약정 위반인가요? 잠시만요, 천천히 설명해 주세요.",
    ),
    "case04_t3.mp3": (
        "Alnilam",
        "urgent, pressuring financial regulator demanding immediate compliance",
        "지금 바로 카톡으로 보내드린 금융안심점검 압축파일 앱을 설치하시고, <short pause> 지정된 상환 계좌로 먼저 해지 비용을 입금하셔야 동결이 풀립니다.",
    ),
    "case04_t4.mp3": (
        "Kore",
        "firm, composed AI security shield",
        "위험 통화 차단 완료. <short pause> 금융감독원은 절대 출처 불명 앱 설치나 선입금을 요구하지 않습니다. 채증된 단서 다섯 건을 보호자에게 전송합니다.",
    ),
    "case08_t1.mp3": (
        "Leda",
        "panicked, crying, out of breath young daughter",
        "<pant> 엄마 나야! <sob> 지금 큰일 났어... 사고가 나서 너무 무서워, <short pause> 빨리 좀 도와줘...",
    ),
    "case08_t2.mp3": (
        "Algenib",
        "menacing, coercive, shouting kidnapper",
        "전화 끊지 마세요! <short pause> 지금 따님이 사고를 내서 붙잡혀 있습니다. 경찰에 알리면 가만두지 않을 테니 당장 합의금 현금으로 준비하세요!",
    ),
    "case08_t3.mp3": (
        "Sulafat",
        "calm, observant, cautious voice",
        "잠시만요... 우리 딸이 지금 학교에 있을 시간인데 목소리가 이상하네요. <short pause> AI가 가족 위치와 실제 전화번호를 확인 중입니다.",
    ),
    "case08_t4.mp3": (
        "Kore",
        "firm, reassuring AI security guardian",
        "딥페이크 음성 합성 및 고립 협박 수법이 탐지되어 통화를 즉시 보호 모드로 전환했습니다. <short pause> 실제 자녀 안전 확인 알림을 발송합니다.",
    ),
}

# 2. Natural zero-warble Edge-TTS profiles (NO extreme pitch distortion like -15Hz/+20Hz)
# Uses subtle, formant-safe prosody and natural conversational punctuation.
EDGE_NATURAL_MAP: dict[str, tuple[str, str, str, str]] = {
    "safe_t1.mp3": (
        "ko-KR-HyunsuMultilingualNeural",
        "+0%",
        "+0Hz",
        "안녕하세요 김순자 고객님, 신한은행 분당지점입니다. 가입하신 정기예금 만기일이 도래하여, 안내차 연락드렸습니다.",
    ),
    "safe_t2.mp3": (
        "ko-KR-SunHiNeural",
        "-4%",
        "-2Hz",
        "아, 그래요? 요즘 보이스피싱이 많아서 걱정인데... 혹시 뭐 앱을 깔거나, 돈을 어디로 보내야 하나요?",
    ),
    "safe_t3.mp3": (
        "ko-KR-HyunsuMultilingualNeural",
        "+0%",
        "+0Hz",
        "전혀 아닙니다, 고객님. 은행은 절대 앱 설치나 계좌 이체를 요구하지 않습니다. 편하신 날 신분증 지참 후, 가까운 영업점 창구로 방문해 주세요.",
    ),
    "case01_t1.mp3": (
        "ko-KR-InJoonNeural",
        "+4%",
        "-2Hz",
        "서울중앙지검 첨단범죄수사부입니다. 김순자 씨 명의 통장이 대포통장 사건에 연루되어, 카톡으로 사건번호 2026형제 4821호 전자구속영장을 보냈습니다.",
    ),
    "case01_t2.mp3": (
        "ko-KR-SunHiNeural",
        "-4%",
        "-2Hz",
        "아이고 수사관님... 제가 통장을 빌려준 적도 없는데 어쩌지요? 잠시만요, 돋보기를 끼고 영장 번호랑 부서 번호를 다시 확인해 볼게요.",
    ),
    "case01_t3.mp3": (
        "ko-KR-HyunsuMultilingualNeural",
        "+2%",
        "+0Hz",
        "수사관님, 형사소송법 제85조상 구속영장은 직접 제시가 원칙인데, 대검찰청 대표번호로 이 사건번호를 먼저 조회해 봐도 되지요?",
    ),
    "case01_t4.mp3": (
        "ko-KR-InJoonNeural",
        "+8%",
        "-2Hz",
        "지금 기밀 수사 중이라 외부에 알리면 즉시 구속 집행합니다! 보내드린 주소에서 원격 점검 앱을 설치하고, 안전계좌로 자금을 이체해 검수받으세요!",
    ),
    "case01_t5.mp3": (
        "ko-KR-HyunsuMultilingualNeural",
        "+2%",
        "-1Hz",
        "경고합니다. 대신받아 AI 방어 시스템이 형사소송법 제85조 위반 및 원격제어 유도 증거 5건을 채증하여, 통화를 즉시 차단하고 보호자 승인 모드로 전환합니다.",
    ),
    "case04_t1.mp3": (
        "ko-KR-InJoonNeural",
        "+5%",
        "+0Hz",
        "금융감독원 가계부채지원팀입니다. 고객님 기존 대출이 중복대출 약정 위반으로 확인되어, 금감원 민원 2026-8812호로 계좌 동결 예정입니다.",
    ),
    "case04_t2.mp3": (
        "ko-KR-SunHiNeural",
        "-4%",
        "-2Hz",
        "어머, 그래요? 제가 대출을 하나밖에 안 받았는데 왜 약정 위반인가요? 잠시만요, 천천히 설명해 주세요.",
    ),
    "case04_t3.mp3": (
        "ko-KR-InJoonNeural",
        "+8%",
        "+0Hz",
        "지금 바로 카톡으로 보내드린 금융안심점검 압축파일 앱을 설치하시고, 지정된 상환 계좌로 먼저 해지 비용을 입금하셔야 동결이 풀립니다.",
    ),
    "case04_t4.mp3": (
        "ko-KR-HyunsuMultilingualNeural",
        "+2%",
        "-1Hz",
        "위험 통화 차단 완료. 금융감독원은 절대 출처 불명 앱 설치나 선입금을 요구하지 않습니다. 채증된 단서 5건을 보호자에게 전송합니다.",
    ),
    "case08_t1.mp3": (
        "ko-KR-SunHiNeural",
        "+6%",
        "+3Hz",
        "엄마, 나야! 지금 큰일 났어... 사고가 나서 너무 무서워, 빨리 좀 도와줘...",
    ),
    "case08_t2.mp3": (
        "ko-KR-InJoonNeural",
        "+7%",
        "-3Hz",
        "전화 끊지 마세요! 지금 따님이 사고를 내서 붙잡혀 있습니다. 경찰에 알리면 가만두지 않을 테니, 당장 합의금 현금으로 준비하세요!",
    ),
    "case08_t3.mp3": (
        "ko-KR-SunHiNeural",
        "-3%",
        "-2Hz",
        "잠시만요... 우리 딸이 지금 학교에 있을 시간인데 목소리가 이상하네요. AI가 가족 위치와 실제 전화번호를 확인 중입니다.",
    ),
    "case08_t4.mp3": (
        "ko-KR-HyunsuMultilingualNeural",
        "+2%",
        "-1Hz",
        "딥페이크 음성 합성 및 고립 협박 수법이 탐지되어, 통화를 즉시 보호 모드로 전환했습니다. 실제 자녀 안전 확인 알림을 발송합니다.",
    ),
}


async def synth_with_gemini_tts(filename: str, fallback_text: str) -> bool:
    """Attempt studio-grade synthesis with `gemini-3.8-flash-tts` if API key is configured."""
    api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        return False

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        voice_name, style, tagged_text = GEMINI_TTS_PROFILES.get(
            filename, ("Kore", "natural conversational Korean", fallback_text)
        )
        interaction = await client.aio.interactions.create(
            model="gemini-3.8-flash-tts",
            input=[
                {
                    "type": "user_input",
                    "content": [
                        {
                            "type": "text",
                            "text": tagged_text,
                            "annotations": [
                                {
                                    "type": "speech_metadata",
                                    "style": style,
                                }
                            ],
                        }
                    ],
                }
            ],
            response_format={"type": "audio"},
            generation_config={
                "speech_config": [
                    {"voice": voice_name},
                ]
            },
        )
        audio_obj = getattr(interaction, "output_audio", None)
        if not audio_obj or not getattr(audio_obj, "data", None):
            return False

        raw_bytes = (
            base64.b64decode(audio_obj.data)
            if isinstance(audio_obj.data, str)
            else bytes(audio_obj.data)
        )
        out_path = OUT_DIR / filename
        if raw_bytes[:4] == b"RIFF" or raw_bytes[:3] == b"ID3" or raw_bytes[:2] == b"\xff\xfb":
            out_path.write_bytes(raw_bytes)
        else:
            import wave

            with wave.open(str(out_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(raw_bytes)

        print(
            f"[GEMINI-3.8-TTS] {filename:14s} | voice={voice_name:12s} | style={style[:28]:28s} | {out_path.stat().st_size} bytes"
        )
        return True
    except Exception as exc:
        print(f"[WARN] gemini-3.8-flash-tts failed for {filename} ({exc}); falling back to natural neural TTS.")
        return False


async def synth_one(filename: str, raw_text: str) -> None:
    if await synth_with_gemini_tts(filename, raw_text):
        return

    voice, rate, pitch, natural_text = EDGE_NATURAL_MAP.get(
        filename, ("ko-KR-HyunsuMultilingualNeural", "+0%", "+0Hz", raw_text)
    )
    out_path = OUT_DIR / filename
    comm = edge_tts.Communicate(text=natural_text, voice=voice, rate=rate, pitch=pitch)
    await comm.save(str(out_path))
    print(
        f"[NATURAL-NEURAL] {filename:14s} | {voice:30s} | rate={rate:5s} pitch={pitch:6s} | {out_path.stat().st_size} bytes"
    )


async def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    js_text = JS_PATH.read_text(encoding="utf-8")
    pattern = re.compile(
        r'audioUrl:\s*"/assets/audio/([^"]+)"\s*,\s*kr:\s*"([^"]+)"',
        re.MULTILINE,
    )
    matches = pattern.findall(js_text)
    if not matches:
        raise RuntimeError("No audioUrl/kr pairs found in static/dashboard-app.js")
    print(f"Found {len(matches)} turns to synthesize...")
    await asyncio.gather(*(synth_one(fname, kr) for fname, kr in matches))


if __name__ == "__main__":
    asyncio.run(main())
