"""Comprehensive test suite for TakeTheCall (대신받아) backend, schemas, and 2026 Gemini SDK compliance."""

from __future__ import annotations

import inspect
from fastapi.testclient import TestClient

import app.argon_verifier as argon_verifier
import app.live_shield as live_shield
from app.knowledge_base import STATIC_1M_PREFIX, STATUTORY_RULES_6, get_cases_list
from app.main import app


client = TestClient(app)


def test_health_and_byte0_prefix_cache_size() -> None:
    """Verify /api/health and that STATIC_1M_PREFIX exceeds the 4,096-token implicit cache threshold."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["knowledge_base"]["cases_loaded"] == 20
    assert data["knowledge_base"]["statutory_rules_count"] == 6
    assert len(STATIC_1M_PREFIX) > 15000
    assert data["knowledge_base"]["implicit_cache_ready"] is True
    assert data["live_connect_config"]["behavior"] == "NON_BLOCKING"


def test_cases_dataset_endpoints() -> None:
    """Verify all 20 public Korean voice phishing cases and 6 statutory rules are served."""
    cases = get_cases_list()
    assert len(cases) == 20
    resp = client.get("/api/cases")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_cases"] == 20
    assert len(body["statutory_rules_6"]) == 6

    c1 = client.get("/api/cases/CASE-01")
    assert c1.status_code == 200
    assert c1.json()["id"] == "CASE-01"


def test_ephemeral_token_and_webaudio_spec() -> None:
    """Verify /api/ephemeral-token returns short-lived token and zero-howling WebAudio spec."""
    resp = client.post("/api/ephemeral-token")
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["uses"] == 1
    assert data["audio_routing"]["acoustic_loopback_prevented"] is True
    assert data["audio_routing"]["live_api_mime_type"] == "audio/pcm;rate=16000"


def test_argon_verify_safe_high_and_critical_scheduling() -> None:
    """Verify SAFE -> SILENT, HIGH -> WHEN_IDLE, and CRITICAL -> INTERRUPT + HITL Gate."""
    # 1. SAFE call
    r_safe = client.post(
        "/api/argon/verify",
        json={"transcript_delta": "어머니, 저 민지예요. 점심 식사 챙겨 드셨어요? 주말에 찾아뵐게요."},
    )
    assert r_safe.status_code == 200
    v_safe = r_safe.json()
    assert v_safe["risk_level"] == "SAFE"
    assert v_safe["scheduling"] == "SILENT"
    assert v_safe["safety_shield_activated"] is False

    # 2. HIGH risk call (Stage 2/3)
    r_high = client.post(
        "/api/argon/verify",
        json={
            "transcript_delta": (
                "서울중앙지검 김태훈 검사입니다. 사건번호 2026형제10492호 카톡으로 구속영장 공문 보냈으니 "
                "혼자 계신 방으로 이동해서 확인하세요."
            )
        },
    )
    assert r_high.status_code == 200
    v_high = r_high.json()
    assert v_high["risk_level"] == "HIGH"
    assert v_high["scheduling"] == "WHEN_IDLE"
    assert v_high["family_silent_alert"] is True
    assert v_high["extracted_iocs"]["case_number"] == "2026형제10492호"

    # 3. CRITICAL risk call (Stage 4 RAT APK / Safe Account)
    r_crit = client.post(
        "/api/argon/verify",
        json={
            "transcript_delta": (
                "지금 즉시 m.spo-go-kr.net/case 접속해서 원격제어 앱 TeamViewer APK 설치하고 "
                "국민은행 국가안전계좌로 전액 이체하세요."
            ),
            "previous_interaction_id": v_high["interaction_id"],
        },
    )
    assert r_crit.status_code == 200
    v_crit = r_crit.json()
    assert v_crit["risk_level"] == "CRITICAL"
    assert v_crit["kill_chain_stage"] == "STAGE_4_RAT_APK"
    assert v_crit["scheduling"] == "INTERRUPT"
    assert v_crit["safety_shield_activated"] is True
    assert v_crit["hitl_gate_required"] is True
    assert v_crit["cached_tokens"] >= 8000


def test_forged_warrant_6_rule_audit() -> None:
    """Verify multimodal forged warrant audit checks all 6 Korean statutory rules."""
    resp = client.post(
        "/api/argon/warrant-audit",
        json={
            "case_id": "CASE-01",
            "transcript_context": (
                "서울중앙지검 김태훈 검사입니다. 카톡으로 사건번호 2026형제10492호 구속영장 약식공문 보냈으니 "
                "m.spo-go-kr.net/case 에서 원격지원 앱 설치 후 국가안전계좌로 이체하세요."
            ),
        },
    )
    assert resp.status_code == 200
    audit = resp.json()
    assert audit["is_forged"] is True
    assert audit["violated_rule_count"] == 6
    assert len(audit["rule_checks"]) == 6


def test_guardian_hitl_gate_and_dispatch() -> None:
    """Verify Layer-3 Family Guardian HITL approval is enforced for 112/1332/1301 dispatch."""
    resp = client.post(
        "/api/guardian/verify-and-dispatch",
        json={
            "session_id": "sess-test-01",
            "case_id": "CASE-01",
            "full_transcript": (
                "서울중앙지검 김태훈 검사입니다. 사건번호 2026형제10492호 구속영장 카톡 전송 및 "
                "TeamViewer APK 설치·국가안전계좌 이체 요구."
            ),
            "user_hitl_confirmed": True,
            "guardian_approved": True,
            "guardian_name": "김민지 (딸 / 보호자)",
        },
    )
    assert resp.status_code == 200
    pkt = resp.json()
    assert pkt["thinking_level_used"] == "high"
    assert pkt["hitl_status"] == "APPROVED_AND_DISPATCHED"
    assert len(pkt["agency_receipts"]) == 3
    assert all(r["status"] == "DISPATCHED_WITH_HITL_APPROVAL" for r in pkt["agency_receipts"])


def test_tts_synthesis_endpoint() -> None:
    """Verify /api/tts/synthesize returns valid audio_b64 and speech_metadata annotations."""
    resp = client.post("/api/tts/synthesize", json={"case_id": "CASE-01"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["model"] == "gemini-3.8-flash-tts"
    assert data["annotations"][0]["type"] == "speech_metadata"
    assert len(data["audio_b64"]) > 100


def test_websocket_live_shield_flow() -> None:
    """Verify /ws/live-shield streams interaction_status transitions and Argon verdicts."""
    with client.websocket_connect("/ws/live-shield") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "session_ready"
        assert ready["non_blocking_tool"] == "consult_argon_guardian"

        ws.send_json(
            {
                "type": "transcript_delta",
                "text": "지금 즉시 TeamViewer APK 설치하고 국가안전계좌로 이체하세요.",
            }
        )
        in_prog = ws.receive_json()
        assert in_prog["type"] == "interaction_status"
        assert in_prog["interaction_status"] == "IN_PROGRESS"

        verdict_msg = ws.receive_json()
        assert verdict_msg["type"] == "argon_verdict"
        assert verdict_msg["scheduling"] == "INTERRUPT"
        assert verdict_msg["verdict"]["risk_level"] == "CRITICAL"

        idle_msg = ws.receive_json()
        assert idle_msg["type"] == "interaction_status"
        assert idle_msg["interaction_status"] == "IDLE"


def test_strict_2026_sdk_no_forbidden_legacy_params() -> None:
    """Verify no forbidden legacy flags exist in argon_verifier or live_shield code."""
    src_argon = inspect.getsource(argon_verifier)
    src_live = inspect.getsource(live_shield)
    for forbidden in (
        "thinking_budget",
        "cached_content",
        "GenerateContentConfig",
        "enable_affective_dialog",
        "gemini-3.1-flash-image",
        "session.send(",
    ):
        assert forbidden not in src_argon
        assert forbidden not in src_live


def test_parallel_scenario_runner_and_client_sdk() -> None:
    """Verify /api/scenarios/run executes multi-turn verification in parallel and serves client SDK."""
    resp = client.post("/api/scenarios/run", json={"mode": "critical", "case_id": "CASE-01"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["turn_count"] == 4
    assert data["verdicts"][-1]["scheduling"] == "INTERRUPT"
    assert data["warrant_audit"]["is_forged"] is True
    assert data["guardian_packet"]["hitl_status"] == "APPROVED_AND_DISPATCHED"

    sdk_resp = client.get("/static/takethecall-client.js")
    assert sdk_resp.status_code == 200
    assert "TakeTheCallAudioRouter" in sdk_resp.text

    index_resp = client.get("/")
    assert index_resp.status_code == 200
    assert "/static/dashboard.css" in index_resp.text
    assert "/static/dashboard-app.js" in index_resp.text

    css_resp = client.get("/static/dashboard.css")
    assert css_resp.status_code == 200
    assert "ttc-sidebar" in css_resp.text

    app_js_resp = client.get("/static/dashboard-app.js")
    assert app_js_resp.status_code == 200
    assert "TOSS_COPIES" in app_js_resp.text


