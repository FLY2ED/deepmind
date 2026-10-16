"""Pydantic data contracts for TakeTheCall (대신받아).

Strictly aligns with the 2026 Gemini SDK Structured Outputs specification,
the 5-Stage Voice Phishing Kill-Chain, 5 Standardized Forensic IOCs,
6 Statutory Forged Warrant Verification Rules, and the 3-Layer HITL Safety Gate.
"""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


RiskLevel = Literal["SAFE", "LOW", "HIGH", "CRITICAL"]

KillChainStage = Literal[
    "NONE",
    "STAGE_1_AUTH",
    "STAGE_2_ISOLATION",
    "STAGE_3_WARRANT",
    "STAGE_4_RAT_APK",
    "STAGE_5_EXTORT",
]

SchedulingMode = Literal["SILENT", "WHEN_IDLE", "INTERRUPT"]


class IOCSlots(BaseModel):
    """5 Standardized Forensic Indicators of Compromise (IOC) slots."""

    impersonated_agency: Optional[str] = Field(
        default=None,
        description="Slot 1: Impersonated agency and officer name (사칭 기관·담당자명)",
    )
    case_number: Optional[str] = Field(
        default=None,
        description="Slot 2: Claimed case or warrant number (사건·영장 번호)",
    )
    phishing_url_or_app: Optional[str] = Field(
        default=None,
        description="Slot 3: Malicious phishing URL or remote control APK (악성 URL·원격앱)",
    )
    mule_account: Optional[str] = Field(
        default=None,
        description="Slot 4: Mule bank account or transfer demand (대포통장·은행 계좌)",
    )
    extortion_spot_or_method: Optional[str] = Field(
        default=None,
        description="Slot 5: Cash pickup location or extortion method (현금 수거지·편취 수단)",
    )


class StatutoryRuleCheck(BaseModel):
    """Individual check result for one of the 6 Korean statutory forged warrant rules."""

    rule_id: str = Field(description="Rule identifier (RULE_1 through RULE_6)")
    statute_citation: str = Field(description="Exact Korean statutory citation")
    title_ko: str = Field(description="Rule title in Korean")
    title_en: str = Field(description="Rule title in English")
    violated: bool = Field(description="Whether this statutory rule was violated")
    evidence: str = Field(description="Forensic evidence explaining why the rule passed or failed")


class ArgonCoreSchema(BaseModel):
    """Schema passed to Gemini 4 Argon top-level response_format."""

    risk_score: int = Field(ge=0, le=100, description="Risk score from 0 to 100")
    risk_level: RiskLevel = Field(description="Discrete risk level: SAFE, LOW, HIGH, or CRITICAL")
    kill_chain_stage: KillChainStage = Field(description="Detected voice phishing kill-chain stage")
    matched_case_id: Optional[str] = Field(
        default=None,
        description="Closest matched public Korean voice phishing case ID (e.g., CASE-01..CASE-20)",
    )
    statutory_violations: list[str] = Field(
        default_factory=list,
        description="List of violated Korean statutes and forged warrant rules",
    )
    extracted_iocs: IOCSlots = Field(
        default_factory=IOCSlots,
        description="Extracted 5 forensic IOC slots from caller transcript and visual media",
    )
    counter_question_ko: str = Field(
        description="Korean response for Gemini Live Shield (stalling coaching or Safety Shield declaration)"
    )
    counter_question_en: str = Field(
        description="English translation of the response for global SaaS judges and subtitles"
    )
    counter_question_vi: Optional[str] = Field(
        default=None,
        description="Vietnamese translation for foreign resident protection via gemini-3.5-live-translate-preview",
    )


class ArgonVerdict(ArgonCoreSchema):
    """Complete enriched Argon verdict returned to the Live Shield and 3-Pane UI."""

    matched_case_title: Optional[str] = Field(default=None)
    scheduling: SchedulingMode = Field(
        default="SILENT",
        description="Dynamic tool response scheduling: INTERRUPT (CRITICAL), WHEN_IDLE (HIGH), SILENT (SAFE/LOW)",
    )
    safety_shield_activated: bool = Field(
        default=False,
        description="True when Stage 4/5 or CRITICAL threshold triggers Safety Shield Mode",
    )
    hitl_gate_required: bool = Field(
        default=False,
        description="True when Layer 2/3 Human-in-the-Loop confirmation is required before external action",
    )
    family_silent_alert: bool = Field(
        default=False,
        description="True when Stage 2+ isolation attempt triggers silent family notification",
    )
    rule_checks: list[StatutoryRuleCheck] = Field(
        default_factory=list,
        description="Detailed evaluation of the 6 statutory forged warrant rules",
    )
    non_advisory_disclaimer: str = Field(
        default=(
            "본 분석은 법령·공공판례 대조에 기반한 정보 제공용 위험 지표이며, 법률·금융 자문을 대체하지 않습니다. "
            "계좌 지급정지 및 수사기관 신고는 반드시 보호자/사용자의 최종 확인 후 진행됩니다. "
            "(Informational risk triage only; does not constitute formal legal or financial advice.)"
        )
    )
    interaction_id: Optional[str] = Field(default=None)
    cached_tokens: int = Field(default=0)
    latency_ms: float = Field(default=0.0)


class ArgonVerifyRequest(BaseModel):
    """Request payload for /api/argon/verify (turn-by-turn or scenario triage)."""

    transcript_delta: str = Field(..., min_length=1, description="Caller transcript segment to verify")
    previous_interaction_id: Optional[str] = Field(
        default=None,
        description="Previous Gemini 4 Argon interaction ID for implicit prefix cache chaining",
    )
    warrant_image_b64: Optional[str] = Field(
        default=None,
        description="Optional base64-encoded JPEG/PNG of a suspect warrant or KakaoTalk capture",
    )
    warrant_mime_type: str = Field(default="image/jpeg")
    target_language: Literal["ko", "en", "vi"] = Field(default="en")


class ForgedWarrantAuditRequest(BaseModel):
    """Request payload for /api/argon/warrant-audit (multimodal forged warrant inspection)."""

    case_id: Optional[str] = Field(default="CASE-01", description="Optional reference case ID")
    transcript_context: str = Field(
        default="서울중앙지검 김태훈 검사입니다. 사건번호 2026형제10492호 카톡으로 구속영장 공문 보냈으니 확인하세요.",
        description="Accompanying caller statement",
    )
    warrant_image_b64: Optional[str] = Field(
        default=None,
        description="Base64-encoded image of the suspect warrant document",
    )
    warrant_mime_type: str = Field(default="image/jpeg")
    document_text_override: Optional[str] = Field(
        default=None,
        description="Text visible on the suspect warrant if OCR/simulation is used",
    )


class ForgedWarrantAuditResult(BaseModel):
    """Structured result of the 6-rule statutory forged warrant audit."""

    is_forged: bool = Field(description="True if any of the 6 statutory rules are violated")
    confidence_score: int = Field(ge=0, le=100)
    violated_rule_count: int = Field(ge=0, le=6)
    rule_checks: list[StatutoryRuleCheck]
    summary_ko: str
    summary_en: str
    interaction_id: Optional[str] = None
    cached_tokens: int = 0
    latency_ms: float = 0.0


class GuardianVerifyRequest(BaseModel):
    """Request payload for Layer 3 Family Guardian HITL verification and 112/1332/1301 dispatch."""

    session_id: str = Field(default="sess-demo-01")
    case_id: Optional[str] = Field(default="CASE-01")
    full_transcript: str = Field(
        ...,
        description="Full call transcript collected during the Live Shield session",
    )
    extracted_iocs: IOCSlots = Field(default_factory=IOCSlots)
    user_hitl_confirmed: bool = Field(
        default=True,
        description="Layer 2: Elderly user confirmed Safety Gate lock",
    )
    guardian_approved: bool = Field(
        ...,
        description="Layer 3: Explicit Family Guardian HITL approval required to dispatch packet",
    )
    guardian_name: str = Field(default="보호자 (김민지 / 딸)")
    target_agencies: list[Literal["112_POLICE", "1332_FSS", "1301_PROSECUTION"]] = Field(
        default_factory=lambda: ["112_POLICE", "1332_FSS", "1301_PROSECUTION"]
    )


class AgencyDispatchReceipt(BaseModel):
    """Simulated dispatch receipt for 112 / 1332 / 1301 after HITL approval."""

    agency_code: Literal["112_POLICE", "1332_FSS", "1301_PROSECUTION"]
    agency_name_ko: str
    agency_name_en: str
    receipt_id: str
    status: Literal["DISPATCHED_WITH_HITL_APPROVAL", "BLOCKED_AWAITING_HITL"]
    action_summary_ko: str
    action_summary_en: str


class GuardianDispatchPacket(BaseModel):
    """Post-call deep verification packet (thinking_level='high') for Family Guardian."""

    packet_id: str
    session_id: str
    thinking_level_used: Literal["high"] = "high"
    hitl_status: Literal["APPROVED_AND_DISPATCHED", "REJECTED_MISSING_GUARDIAN_APPROVAL"]
    verdict: ArgonVerdict
    forensic_summary_ko: str
    forensic_summary_en: str
    recommended_user_actions_ko: list[str]
    recommended_user_actions_en: list[str]
    agency_receipts: list[AgencyDispatchReceipt]
    non_advisory_disclaimer: str
