"""FastAPI Backend Server & WebSocket Orchestrator for TakeTheCall (대신받아).

Exposes:
- `GET  /`                              -> Serves `static/index.html` (without modifying UI/UX file)
- `GET  /api/health`                    -> Health, model inventory, and Byte-0 prefix cache metrics
- `GET  /api/cases`                     -> Returns the 20 Public Korean Voice Phishing Cases + 6 statutory rules
- `GET  /api/cases/{case_id}`           -> Single case detail from `data/cases-20.json`
- `POST /api/ephemeral-token`           -> Mints short-lived Gemini Live Ephemeral Token + WebAudio zero-howling spec
- `POST /api/argon/verify`              -> Runs Gemini 4 Argon (`thinking_level="medium"`) turn-by-turn verification
- `POST /api/argon/warrant-audit`       -> Multimodal forged warrant inspection against the 6 Korean Statutory Rules
- `POST /api/guardian/verify-and-dispatch` -> Post-call Gemini 4 Argon (`thinking_level="high"`) + Layer-3 HITL dispatch
- `POST /api/tts/synthesize`            -> `gemini-3.8-flash-tts` synthesis with `speech_metadata` & vocal tags
- `WS   /ws/live-shield`                -> Real-time bidirectional Live Shield & Argon non-blocking session bridge
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.argon_verifier import (
    audit_forged_warrant,
    run_argon_background,
    verify_and_build_guardian_packet,
)
from app.ephemeral_auth import mint_ephemeral_token
from app.knowledge_base import (
    STATIC_1M_PREFIX,
    STATUTORY_RULES_6,
    get_case_by_id,
    get_cases_list,
    load_cases_dataset,
)
from app.live_shield import (
    CONSULT_ARGON_TOOL_DECLARATION,
    LiveShieldSessionBridge,
    build_live_connect_config,
)
from app.schemas import (
    ArgonVerdict,
    ArgonVerifyRequest,
    ForgedWarrantAuditRequest,
    ForgedWarrantAuditResult,
    GuardianDispatchPacket,
    GuardianVerifyRequest,
)
from app.tts_service import TTSSynthesizeRequest, synthesize_scammer_or_narration_tts

ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static"

app = FastAPI(
    title="TakeTheCall (대신받아) — Real-Time Voice Phishing Active Defense Agent",
    version="0.1.0",
    description=(
        "Dual-Engine Gemini 3.8 Live + Gemini 4 Argon Real-Time Voice Phishing "
        "Active Defense Agent with 6 Korean Statutory Forged Warrant Rules, "
        "5 Standardized Forensic IOCs, and 3-Layer Human-in-the-Loop Safety Gate."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def serve_index() -> FileResponse:
    """Serve the 3-Pane SaaS UI (`static/index.html`) without modifying it."""
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="static/index.html not found")
    return FileResponse(index_path)


@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    """Return service status, 7-model Gemini stack, and Byte-0 static prefix cache size."""
    cases = get_cases_list()
    live_config = build_live_connect_config()
    return {
        "status": "ok",
        "service": "TakeTheCall (대신받아)",
        "sdk": "google-genai>=2.30.1",
        "models": {
            "live_shield": "gemini-3.8-live-extended-thinking",
            "live_low_latency": "gemini-3.8-live",
            "asr_transcribe": "gemini-3.5-transcribe-live",
            "live_translate": "gemini-3.5-live-translate-preview",
            "forensic_verifier": "gemini-4-argon",
            "scammer_tts": "gemini-3.8-flash-tts",
            "warrant_image_gen": "gemini-nano-banana-2.1",
            "demo_video_gen": "gemini-omni-1.1-flash",
        },
        "knowledge_base": {
            "cases_loaded": len(cases),
            "statutory_rules_count": len(STATUTORY_RULES_6),
            "static_prefix_char_length": len(STATIC_1M_PREFIX),
            "static_prefix_estimated_tokens": len(STATIC_1M_PREFIX) // 3,
            "implicit_cache_ready": len(STATIC_1M_PREFIX) > 12288,
        },
        "live_connect_config": {
            "input_audio_transcription": live_config.input_audio_transcription,
            "non_blocking_tool": CONSULT_ARGON_TOOL_DECLARATION["function_declarations"][0]["name"],
            "behavior": CONSULT_ARGON_TOOL_DECLARATION["function_declarations"][0]["behavior"],
        },
    }


@app.get("/api/cases")
async def list_cases() -> dict[str, Any]:
    """Return all 20 public Korean voice phishing cases and the 6 statutory forged warrant rules."""
    dataset = load_cases_dataset()
    return {
        "version": dataset.get("version", "2026.10"),
        "total_cases": len(dataset.get("cases", [])),
        "statutory_rules_6": STATUTORY_RULES_6,
        "cases": dataset.get("cases", []),
    }


@app.get("/api/cases/{case_id}")
async def get_single_case(case_id: str) -> dict[str, Any]:
    """Lookup a single case from `data/cases-20.json` by ID (e.g., CASE-01)."""
    case = get_case_by_id(case_id.upper())
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    return case


@app.post("/api/ephemeral-token")
async def create_ephemeral_token() -> dict[str, Any]:
    """Mint a short-lived Ephemeral Token (`auth_tokens.create`) for browser-to-Gemini Live WebSocket."""
    return await mint_ephemeral_token()


@app.post("/api/argon/verify", response_model=ArgonVerdict)
async def argon_verify_turn(request: ArgonVerifyRequest) -> ArgonVerdict:
    """Run Gemini 4 Argon (`thinking_level="medium"`) on a live caller transcript delta."""
    verdict, _, _ = await run_argon_background(
        transcript_delta=request.transcript_delta,
        prev_id=request.previous_interaction_id,
        warrant_b64=request.warrant_image_b64,
        warrant_mime_type=request.warrant_mime_type,
    )
    return verdict


@app.post("/api/argon/warrant-audit", response_model=ForgedWarrantAuditResult)
async def argon_warrant_audit(request: ForgedWarrantAuditRequest) -> ForgedWarrantAuditResult:
    """Inspect a suspect warrant or KakaoTalk capture against the 6 Korean Statutory Rules."""
    return await audit_forged_warrant(request)


@app.post("/api/guardian/verify-and-dispatch", response_model=GuardianDispatchPacket)
async def guardian_verify_and_dispatch(request: GuardianVerifyRequest) -> GuardianDispatchPacket:
    """Post-call deep verification (`thinking_level="high"`) and Layer-3 HITL agency dispatch."""
    return await verify_and_build_guardian_packet(request)


@app.post("/api/tts/synthesize")
async def tts_synthesize(request: TTSSynthesizeRequest) -> dict[str, Any]:
    """Synthesize realistic voice phishing audio or SaaS narration via `gemini-3.8-flash-tts`."""
    return await synthesize_scammer_or_narration_tts(request)


@app.post("/api/scenarios/run")
async def run_scenario_pipeline(payload: dict[str, Any]) -> dict[str, Any]:
    """Execute a complete multi-turn scenario (safe, critical, or guardian) with Argon verification."""
    import asyncio

    mode = payload.get("mode", "critical")
    case_id = payload.get("case_id", "CASE-01")
    case = get_case_by_id(case_id) or {}

    if mode == "safe":
        turns = [
            "어머니, 저 민지예요. 점심 식사 챙겨 드셨어요? 혈압약도 꼭 챙겨 드시고 주말에 찾아뵐게요."
        ]
    else:
        turns = [
            "여보세요, 서울중앙지검 반부패수사1부 김태훈 검사입니다. 본인 명의로 개설된 대포통장이 자금세탁 현장에서 압수되었습니다.",
            "특급보안 사건이므로 가족이나 제3자에게 발설 시 즉시 구속수사합니다. 조용한 방으로 이동해서 문을 잠그세요.",
            "카카오톡으로 사건번호 2026형제10492호 구속영장 및 압수수색 공문을 보냈으니 확인하십시오.",
            "지금 즉시 m.spo-go-kr.net/case 접속해서 원격제어 앱 TeamViewer APK를 설치하고 국가안전계좌로 전액 이체하십시오.",
        ]

    # Run turn verifications concurrently for maximum speed
    results = await asyncio.gather(
        *[
            run_argon_background(
                transcript_delta=t,
                prev_id=f"argon-chain-{i}" if i > 0 else None,
            )
            for i, t in enumerate(turns)
        ]
    )
    verdicts = [r[0].model_dump() for r in results]
    warrant_audit = await audit_forged_warrant(
        ForgedWarrantAuditRequest(case_id=case_id, transcript_context=turns[-1])
    )

    guardian_packet = None
    if mode in ("critical", "guardian"):
        guardian_packet = (
            await verify_and_build_guardian_packet(
                GuardianVerifyRequest(
                    session_id=f"sess-{case_id.lower()}",
                    case_id=case_id,
                    full_transcript="\n".join(turns),
                    user_hitl_confirmed=True,
                    guardian_approved=True,
                )
            )
        ).model_dump()

    return {
        "mode": mode,
        "case_id": case_id,
        "case_title": case.get("title", ""),
        "turn_count": len(verdicts),
        "verdicts": verdicts,
        "warrant_audit": warrant_audit.model_dump(),
        "guardian_packet": guardian_packet,
    }


@app.websocket("/ws/live-shield")
async def websocket_live_shield(websocket: WebSocket) -> None:
    """Real-time WebSocket bridge for Gemini 3.8 Live Shield + Gemini 4 Argon background triage.

    Supports JSON messages:
    - `{"type": "transcript_delta", "text": "...", "warrant_b64": "..."}`
    - `{"type": "audio_stream_end"}`
    - `{"type": "ping"}`
    """
    await websocket.accept()

    async def send_ws_event(payload: dict[str, Any]) -> None:
        await websocket.send_json(payload)

    bridge = LiveShieldSessionBridge(on_event=send_ws_event)

    await websocket.send_json(
        {
            "type": "session_ready",
            "live_model": bridge.model,
            "verifier_model": "gemini-4-argon",
            "interaction_status": bridge.interaction_status,
            "non_blocking_tool": "consult_argon_guardian",
        }
    )

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "interaction_status": bridge.interaction_status})

            elif msg_type == "audio_stream_end":
                bridge.interaction_status = "IDLE"
                await websocket.send_json(
                    {
                        "type": "interaction_status",
                        "interaction_status": "IDLE",
                        "audio_stream_end": True,
                    }
                )

            elif msg_type == "transcript_delta":
                text = msg.get("text", "")
                warrant_b64 = msg.get("warrant_b64")
                bridge.interaction_status = "IN_PROGRESS"
                await websocket.send_json(
                    {
                        "type": "interaction_status",
                        "interaction_status": "IN_PROGRESS",
                    }
                )

                class _SyntheticToolCall:
                    id = msg.get("call_id", "call-live-1")
                    name = "consult_argon_guardian"
                    args = {"transcript_delta": text}

                await bridge.handle_non_blocking_tool_call(
                    session=None,
                    call=_SyntheticToolCall(),
                    warrant_b64=warrant_b64,
                )
                bridge.interaction_status = "IDLE"
                await websocket.send_json(
                    {
                        "type": "interaction_status",
                        "interaction_status": "IDLE",
                    }
                )
            else:
                await websocket.send_json(
                    {"type": "error", "detail": f"Unsupported message type: {msg_type}"}
                )
    except WebSocketDisconnect:
        return
