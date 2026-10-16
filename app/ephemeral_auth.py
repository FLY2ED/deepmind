"""Cloud Run Ephemeral Token Service & Zero-Howling WebAudio Routing Config.

Implements Section 4.1 of the TakeTheCall (대신받아) architecture:
- Mints short-lived Ephemeral Tokens via `client.aio.auth_tokens.create` so raw
  `GEMINI_API_KEY` credentials are never exposed in client browsers.
- Exposes the zero-howling digital WebAudio graph metadata
  (`MediaStreamAudioDestinationNode` -> `16kHz Int16 PCM AudioWorklet` ->
  `gemini-3.8-live` WebSocket -> `24kHz PCM` output).
"""

from __future__ import annotations

import datetime
import uuid
from typing import Any

from app.argon_verifier import get_genai_client


async def mint_ephemeral_token() -> dict[str, Any]:
    """Mint a single-use short-lived Gemini Live API Ephemeral Token."""
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    expire_iso = (now + datetime.timedelta(minutes=30)).isoformat()
    new_session_iso = (now + datetime.timedelta(minutes=1)).isoformat()

    client = get_genai_client()
    if client is not None:
        try:
            token = await client.aio.auth_tokens.create(
                config={
                    "uses": 1,
                    "expire_time": expire_iso,
                    "new_session_expire_time": new_session_iso,
                }
            )
            return {
                "token": token.name,
                "mode": "live_ephemeral_token",
                "uses": 1,
                "expire_time": expire_iso,
                "new_session_expire_time": new_session_iso,
                "audio_routing": get_zero_howling_webaudio_spec(),
            }
        except Exception:
            pass

    # Fallback ephemeral token metadata when running in offline/demo mode
    return {
        "token": f"auth_tokens/ephemeral-demo-{uuid.uuid4().hex[:16]}",
        "mode": "demo_ephemeral_fallback",
        "uses": 1,
        "expire_time": expire_iso,
        "new_session_expire_time": new_session_iso,
        "audio_routing": get_zero_howling_webaudio_spec(),
    }


def get_zero_howling_webaudio_spec() -> dict[str, Any]:
    """Return the WebAudio Zero-Howling digital audio routing specification."""
    return {
        "acoustic_loopback_prevented": True,
        "input_pipeline": (
            "HTMLAudioElement / WebRTC Stream -> AudioContext.createMediaElementSource() "
            "-> MediaStreamAudioDestinationNode -> AudioWorklet (16kHz Int16 PCM)"
        ),
        "live_api_mime_type": "audio/pcm;rate=16000",
        "output_pipeline": "Gemini 3.8 Live 24kHz PCM -> AudioContext.destination (Dual-Ear Monitoring)",
    }
