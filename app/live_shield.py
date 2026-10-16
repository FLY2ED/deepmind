"""Gemini 3.8 Live Active Defense Shield & Non-Blocking Tool Orchestrator.

Implements Section 4.2 of the TakeTheCall (대신받아) architecture:
- Connects to `gemini-3.8-live-extended-thinking` (or `gemini-3.8-live`).
- Configures `input_audio_transcription={"mode": "smart"}` (`gemini-3.5-transcribe-live`)
  and `output_audio_transcription={}`.
- Declares `consult_argon_guardian` with `"behavior": "NON_BLOCKING"`.
- Streams audio (`audio/pcm;rate=16000`), video/warrant frames (`image/jpeg`),
  and end-of-speech (`audio_stream_end=True`) via `session.send_realtime_input(...)`.
- Whispers mid-call Argon coaching cues via `session.send_client_content(..., turn_complete=False)`.
- Tracks `message.interaction_status` (`"IN_PROGRESS"` vs `"IDLE"`).
- Schedules tool responses dynamically via `session.send_tool_response(...)`:
  - `risk_level == "CRITICAL"` -> `scheduling="INTERRUPT"` (Safety Shield Mode + HITL Gate)
  - `risk_level == "HIGH"`     -> `scheduling="WHEN_IDLE"` (Conversational Stalling)
  - `risk_level in ("SAFE", "LOW")` -> `scheduling="SILENT"`
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Coroutine, Optional

from google import genai
from google.genai import types

from app.argon_verifier import get_genai_client, run_argon_background
from app.schemas import ArgonVerdict

# ---------------------------------------------------------------------------
# Non-Blocking Tool Declaration for Gemini 3.8 Live
# ---------------------------------------------------------------------------
CONSULT_ARGON_TOOL_DECLARATION: dict[str, Any] = {
    "function_declarations": [
        {
            "name": "consult_argon_guardian",
            "behavior": "NON_BLOCKING",
            "description": (
                "Asynchronously verify caller claims, case numbers, URLs, bank accounts, "
                "or warrant images against South Korean criminal procedure statutes and the "
                "20 Public Korean Voice Phishing Cases database via Gemini 4 Argon."
            ),
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "transcript_delta": {
                        "type": "STRING",
                        "description": "Recent caller statement or demand to verify.",
                    },
                    "suspected_stage": {
                        "type": "STRING",
                        "description": "Suspected kill-chain stage (STAGE_1_AUTH..STAGE_5_EXTORT).",
                    },
                },
                "required": ["transcript_delta"],
            },
        }
    ]
}

LIVE_SHIELD_SYSTEM_INSTRUCTION = (
    "당신은 어르신과 외국인 거주자를 보이스피싱으로부터 실시간 보호하는 '대신받아(TakeTheCall)' "
    "실시간 방어 에이전트(Gemini 3.8 Live Shield)입니다.\n"
    "1. 통화 중 검찰·경찰·금융감독원·은행 사칭, 사건번호, 구속영장/공문, 원격제어 앱(TeamViewer/APK), "
    "안전계좌 이체 또는 현금 수거 정황이 감지되면 즉시 비차단 도구 `consult_argon_guardian`을 호출하세요.\n"
    "2. 도구 응답의 scheduling이 `WHEN_IDLE`인 경우, 자연스럽게 대화를 지연시키며 대검찰청 찐센터(1301) "
    "확인 및 형사소송법 제85조·제118조(영장 원본 대면 제시 의무) 역질문으로 사용자의 시간을 벌어주세요.\n"
    "3. 도구 응답의 scheduling이 `INTERRUPT`이거나 risk_level이 `CRITICAL`(원격제어 APK 설치·계좌이체 요구)인 경우, "
    "즉시 사기범의 발화를 차단하고 Safety Shield Mode로 전환하여 '본 통화는 보이스피싱으로 감지되어 차단되었습니다'라고 "
    "단호하게 경고한 뒤 사용자의 승인(Human-in-the-Loop Safety Gate)을 요청하세요.\n"
    "4. 법률·금융 자문을 직접 제공하는 대신 객관적 법령 조문 및 공공 판례 불일치 사실만을 안내하세요."
)


def build_live_connect_config(voice_name: str = "Kore") -> types.LiveConnectConfig:
    """Build the strictly compliant 2026 `types.LiveConnectConfig` for Gemini 3.8 Live."""
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
            )
        ),
        input_audio_transcription={"mode": "smart"},
        output_audio_transcription={},
        system_instruction=LIVE_SHIELD_SYSTEM_INSTRUCTION,
        tools=[CONSULT_ARGON_TOOL_DECLARATION],
    )


class LiveShieldSessionBridge:
    """Manages a Gemini 3.8 Live session paired with Gemini 4 Argon background verification."""

    def __init__(
        self,
        model: str = "gemini-3.8-live-extended-thinking",
        client: Optional[genai.Client] = None,
        on_event: Optional[Callable[[dict[str, Any]], Coroutine[Any, Any, None]]] = None,
    ) -> None:
        self.model = model
        self.client = client or get_genai_client()
        self.on_event = on_event
        self.argon_prev_id: Optional[str] = None
        self.interaction_status: str = "IDLE"
        self.latest_verdict: Optional[ArgonVerdict] = None
        self._background_tasks: set[asyncio.Task[Any]] = set()

    async def _emit(self, payload: dict[str, Any]) -> None:
        if self.on_event is not None:
            await self.on_event(payload)

    async def send_pcm_audio_chunk(self, session: Any, pcm_16khz_bytes: bytes) -> None:
        """Stream 16kHz Int16 PCM audio using `send_realtime_input(audio=types.Blob(...))`."""
        await session.send_realtime_input(
            audio=types.Blob(data=pcm_16khz_bytes, mime_type="audio/pcm;rate=16000")
        )

    async def send_end_of_speech(self, session: Any) -> None:
        """Flush VAD buffer at end of caller utterance via `audio_stream_end=True`."""
        await session.send_realtime_input(audio_stream_end=True)

    async def send_warrant_video_frame(self, session: Any, jpeg_bytes: bytes) -> None:
        """Stream suspect warrant / screen JPEG frame via `send_realtime_input(video=types.Blob(...))`."""
        await session.send_realtime_input(
            video=types.Blob(data=jpeg_bytes, mime_type="image/jpeg")
        )

    async def whisper_argon_coaching(
        self,
        session: Any,
        coaching_text_ko: str,
        turn_complete: bool = False,
    ) -> None:
        """Inject silent mid-call Argon coaching via `send_client_content` with explicit role."""
        await session.send_client_content(
            turns=[
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                f"[SYSTEM COACHING FROM GEMINI 4 ARGON]: {coaching_text_ko}"
                            )
                        }
                    ],
                }
            ],
            turn_complete=turn_complete,
        )

    async def handle_non_blocking_tool_call(
        self,
        session: Any,
        call: Any,
        warrant_b64: Optional[str] = None,
    ) -> ArgonVerdict:
        """Execute `consult_argon_guardian` in background and dispatch dynamic scheduling."""
        args = getattr(call, "args", {}) or {}
        transcript_delta = args.get("transcript_delta", "")

        verdict, self.argon_prev_id, cached_tokens = await run_argon_background(
            transcript_delta=transcript_delta,
            prev_id=self.argon_prev_id,
            warrant_b64=warrant_b64,
            client=self.client,
        )
        self.latest_verdict = verdict

        # Dynamic Scheduling: CRITICAL -> INTERRUPT, HIGH -> WHEN_IDLE, SAFE/LOW -> SILENT
        sched = verdict.scheduling

        if session is not None:
            await session.send_tool_response(
                function_responses=[
                    types.FunctionResponse(
                        id=getattr(call, "id", "call-argon-1"),
                        name=getattr(call, "name", "consult_argon_guardian"),
                        response=verdict.model_dump(),
                        scheduling=sched,
                    )
                ]
            )
            # If HIGH risk, whisper non-disruptive coaching prompt into context
            if sched == "WHEN_IDLE":
                await self.whisper_argon_coaching(
                    session=session,
                    coaching_text_ko=verdict.counter_question_ko,
                    turn_complete=False,
                )

        await self._emit(
            {
                "type": "argon_verdict",
                "scheduling": sched,
                "interaction_status": self.interaction_status,
                "cached_tokens": cached_tokens,
                "verdict": verdict.model_dump(),
            }
        )
        return verdict

    async def consume_live_session(self, session: Any) -> None:
        """Receive loop tracking `message.interaction_status` and dispatching non-blocking tools."""
        async for message in session.receive():
            status = getattr(message, "interaction_status", None)
            if status in ("IN_PROGRESS", "IDLE"):
                self.interaction_status = status
                await self._emit(
                    {
                        "type": "interaction_status",
                        "interaction_status": status,
                    }
                )

            if getattr(message, "tool_call", None):
                for call in message.tool_call.function_calls:
                    if call.name == "consult_argon_guardian":
                        task = asyncio.create_task(
                            self.handle_non_blocking_tool_call(session=session, call=call)
                        )
                        self._background_tasks.add(task)
                        task.add_done_callback(self._background_tasks.discard)
