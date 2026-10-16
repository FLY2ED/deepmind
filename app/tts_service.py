"""Gemini 3.8 Flash TTS Voice Synthesis Service for TakeTheCall (대신받아).

Implements Section 5.1 of the architecture:
- Uses `gemini-3.8-flash-tts` via `client.aio.interactions.create` (or `client.interactions.create`).
- Uses `annotations=[{"type": "speech_metadata", "speaker": ..., "style": ...}]`
  and inline vocal tags (`<sigh>`, `<short pause>`, `<pant>`) to synthesize realistic
  voice phishing scammer evaluation samples from `data/cases-20.json` and English SaaS
  voiceover narration.
- Generates valid 24kHz RIFF WAV audio payloads (with deterministic synthetic PCM WAV
  fallback when running offline without `GEMINI_API_KEY`).
"""

from __future__ import annotations

import base64
import io
import math
import struct
import wave
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.argon_verifier import get_genai_client
from app.knowledge_base import get_case_by_id


class TTSSynthesizeRequest(BaseModel):
    """Request schema for /api/tts/synthesize."""

    case_id: Optional[str] = Field(
        default="CASE-01",
        description="Optional case ID from data/cases-20.json to synthesize scammer dialogue",
    )
    text: Optional[str] = Field(
        default=None,
        description="Custom text with optional inline vocal tags (<sigh>, <short pause>)",
    )
    speaker: str = Field(default="Charon", description="Gemini 3.8 Flash TTS speaker preset")
    style: str = Field(
        default="Cold, authoritative, bureaucratic, urgent",
        description="Expressive speech_metadata style directive",
    )
    voice_name: str = Field(default="Charon")


def generate_fallback_wav_bytes(duration_sec: float = 1.5, sample_rate: int = 24000) -> bytes:
    """Create a valid 16-bit mono 24kHz WAV buffer for offline/test verification."""
    buf = io.BytesIO()
    num_samples = int(duration_sec * sample_rate)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(num_samples):
            t = i / sample_rate
            # Subtle dual-tone cadence
            envelope = math.sin(math.pi * i / num_samples)
            val = int(3200 * envelope * math.sin(2.0 * math.pi * 440.0 * t))
            frames.extend(struct.pack("<h", val))
        wf.writeframes(bytes(frames))
    return buf.getvalue()


async def synthesize_scammer_or_narration_tts(
    request: TTSSynthesizeRequest,
) -> dict[str, Any]:
    """Synthesize speech using `gemini-3.8-flash-tts` with `speech_metadata` annotations."""
    case = get_case_by_id(request.case_id or "CASE-01") or {}
    script_text = request.text or case.get(
        "tts_script_ko",
        (
            "<sigh> 서울중앙지검 첨단범죄수사1부 김태훈 검사입니다. <short pause> "
            "본인 명의로 대포통장이 개설되어 구속영장이 청구되었습니다. <short pause> "
            "지금 즉시 카카오톡으로 보낸 사건번호 2026형제10492호 공문을 확인하십시오."
        ),
    )
    style = request.style or case.get(
        "tts_style", "Cold, authoritative, bureaucratic, pressing"
    )

    # Strictly formatted 2026 Interactions API TTS payload with speech_metadata annotations
    input_payload = [
        {
            "type": "text",
            "text": script_text,
            "annotations": [
                {
                    "type": "speech_metadata",
                    "speaker": request.speaker,
                    "style": style,
                }
            ],
        }
    ]

    client = get_genai_client()
    if client is not None:
        try:
            interaction = await client.aio.interactions.create(
                model="gemini-3.8-flash-tts",
                input=input_payload,
                response_modalities=["AUDIO"],
                generation_config={
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {
                                "voice_name": request.voice_name
                            }
                        }
                    }
                },
            )
            for output in interaction.outputs or []:
                if getattr(output, "type", None) == "audio" and getattr(output, "data", None):
                    raw_b64 = output.data if isinstance(output.data, str) else base64.b64encode(output.data).decode("ascii")
                    return {
                        "model": "gemini-3.8-flash-tts",
                        "mode": "live_tts",
                        "case_id": request.case_id,
                        "script_text": script_text,
                        "annotations": input_payload[0]["annotations"],
                        "mime_type": getattr(output, "mime_type", "audio/wav") or "audio/wav",
                        "audio_b64": raw_b64,
                    }
        except Exception:
            pass

    wav_bytes = generate_fallback_wav_bytes(duration_sec=1.5)
    return {
        "model": "gemini-3.8-flash-tts",
        "mode": "fallback_synthetic_wav",
        "case_id": request.case_id,
        "script_text": script_text,
        "annotations": input_payload[0]["annotations"],
        "mime_type": "audio/wav",
        "audio_b64": base64.b64encode(wav_bytes).decode("ascii"),
    }
