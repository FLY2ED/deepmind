#!/usr/bin/env python3
"""Synthesize Scammer TTS Audio, English Narration, Forged Warrant Image, and Video Keyframes.

Uses:
- `gemini-3.8-flash-tts` via `client.interactions.create` with `speech_metadata`
  annotations and inline vocal tags (`<sigh>`, `<short pause>`).
- `gemini-nano-banana-2.1` via `client.interactions.create` with
  `response_modalities=["IMAGE"]` and `image_config={"aspect_ratio": "16:9", "image_size": "2K"}`.
"""

from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from google import genai
from app.tts_service import generate_fallback_wav_bytes

ASSETS_DIR = ROOT_DIR / "assets"

# Minimal valid 1x1 PNG fallback for offline test environments
FALLBACK_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def synthesize_tts_file(
    client: genai.Client | None,
    text: str,
    speaker: str,
    style: str,
    voice_name: str,
    output_path: Path,
) -> str:
    """Synthesize a WAV file via `gemini-3.8-flash-tts` with `speech_metadata` annotations."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if client is not None:
        try:
            interaction = client.interactions.create(
                model="gemini-3.8-flash-tts",
                input=[
                    {
                        "type": "text",
                        "text": text,
                        "annotations": [
                            {
                                "type": "speech_metadata",
                                "speaker": speaker,
                                "style": style,
                            }
                        ],
                    }
                ],
                response_modalities=["AUDIO"],
                generation_config={
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {"voice_name": voice_name}
                        }
                    }
                },
            )
            for output in interaction.outputs or []:
                if getattr(output, "type", None) == "audio" and getattr(output, "data", None):
                    raw = (
                        base64.b64decode(output.data)
                        if isinstance(output.data, str)
                        else output.data
                    )
                    output_path.write_bytes(raw)
                    return "live_gemini_3_8_flash_tts"
        except Exception as exc:
            print(f"[warn] gemini-3.8-flash-tts fallback ({output_path.name}): {exc}")

    output_path.write_bytes(generate_fallback_wav_bytes(duration_sec=2.0))
    return "fallback_wav"


def synthesize_image_file(
    client: genai.Client | None,
    prompt: str,
    aspect_ratio: str,
    output_path: Path,
) -> str:
    """Generate an image via `gemini-nano-banana-2.1` (never deprecated 3.1-flash-image)."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if client is not None:
        try:
            interaction = client.interactions.create(
                model="gemini-nano-banana-2.1",
                input=prompt,
                response_modalities=["IMAGE"],
                generation_config={
                    "image_config": {
                        "aspect_ratio": aspect_ratio,
                        "image_size": "2K",
                    }
                },
            )
            for output in interaction.outputs or []:
                if getattr(output, "type", None) == "image" and getattr(output, "data", None):
                    raw = (
                        base64.b64decode(output.data)
                        if isinstance(output.data, str)
                        else output.data
                    )
                    output_path.write_bytes(raw)
                    return "live_gemini_nano_banana_2_1"
        except Exception as exc:
            print(f"[warn] gemini-nano-banana-2.1 fallback ({output_path.name}): {exc}")

    output_path.write_bytes(base64.b64decode(FALLBACK_PNG_B64))
    return "fallback_png"


def main() -> None:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    client = genai.Client(api_key=api_key) if api_key else None

    scammer_mode = synthesize_tts_file(
        client=client,
        text=(
            "<sigh> 서울중앙지검 첨단범죄수사1부 김태훈 검사입니다. <short pause> "
            "본인 명의로 대포통장이 개설되어 구속영장이 청구되었습니다. <short pause> "
            "지금 즉시 조용한 방으로 이동해서 카카오톡으로 보낸 사건번호 2026형제10492호 공문을 확인하십시오."
        ),
        speaker="Prosecutor_Scammer",
        style="Cold, authoritative, bureaucratic, urgent, pressing",
        voice_name="Charon",
        output_path=ASSETS_DIR / "scammer_case01.wav",
    )
    print(f"[ok] scammer_case01.wav ({scammer_mode})")

    narration_mode = synthesize_tts_file(
        client=client,
        text=(
            "Every year, voice phishing syndicates steal hundreds of millions of dollars from seniors "
            "using forged prosecutor warrants and remote control malware. <short pause> "
            "TakeTheCall pairs Gemini 3.8 Live with Gemini 4 Argon to verify callers against "
            "South Korean criminal procedure statutes in real time, interrupting scammers before a single dollar is lost."
        ),
        speaker="SaaS_Narrator",
        style="Crisp, confident, professional product keynote narrator",
        voice_name="Puck",
        output_path=ASSETS_DIR / "narration_en.wav",
    )
    print(f"[ok] narration_en.wav ({narration_mode})")

    warrant_mode = synthesize_image_file(
        client=client,
        prompt=(
            "A realistic test sample of a forged Korean arrest warrant document labeled "
            "'[FORENSIC TEST SAMPLE - 모의 훈련용 위조 구속영장]' at the top, containing deliberate "
            "statutory forgery flaws for AI detection: Case No. '2026형제10492호', signed by "
            "'서울중앙지방검찰청 검사 김태훈' instead of a District Court Judge, mismatched square red seal, "
            "and a fake '국가안전계좌 자산 보호조치 명령' clause at the bottom."
        ),
        aspect_ratio="16:9",
        output_path=ASSETS_DIR / "forged_warrant_sample.png",
    )
    print(f"[ok] forged_warrant_sample.png ({warrant_mode})")

    intro_mode = synthesize_image_file(
        client=client,
        prompt=(
            "Clean, bright enterprise cybersecurity SaaS title card on a pure white and slate background, "
            "displaying 'TakeTheCall (대신받아) — Real-Time Voice Phishing Active Defense Agent' with "
            "a glowing blue shield icon and subtle acoustic waveforms, 16:9 widescreen."
        ),
        aspect_ratio="16:9",
        output_path=ASSETS_DIR / "intro_frame.png",
    )
    print(f"[ok] intro_frame.png ({intro_mode})")

    outro_mode = synthesize_image_file(
        client=client,
        prompt=(
            "Clean enterprise SaaS architecture summary card on a crisp light background showing "
            "'Gemini 3.8 Live Shield + Gemini 4 Argon Statutory Verifier -> 112 / 1332 / 1301 HITL Protection', 16:9."
        ),
        aspect_ratio="16:9",
        output_path=ASSETS_DIR / "outro_frame.png",
    )
    print(f"[ok] outro_frame.png ({outro_mode})")


if __name__ == "__main__":
    main()
