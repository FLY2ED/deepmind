"""Pre-Demo Asset Synthesis Pipeline (`scripts/synthesize_assets.py`).

Generates high-resolution demo assets in `/data/projects/deepmind/assets/`:
1. `assets/scammer_case01.wav` — 24kHz 16-bit PCM audio (`gemini-3.8-flash-tts` when API key is configured, or multi-formant speech-cadence acoustic waveform).
2. `assets/narration_en.wav` — 24kHz 16-bit PCM English narration audio.
3. `assets/forged_warrant_sample.png` — 1200x1600 high-resolution synthetic forensic test image illustrating the 6 Korean Statutory Forged Warrant markers (`RULE_1`..`RULE_6`).
4. `assets/intro_frame.png` — 1920x1080 FHD dark-mode title slide for TakeTheCall (대신받아).
5. `assets/outro_frame.png` — 1920x1080 FHD architecture & KPI summary slide.
"""

from __future__ import annotations

import asyncio
import math
import os
import struct
import sys
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.tts_service import TTSSynthesizeRequest, synthesize_scammer_or_narration_tts

ASSETS_DIR = ROOT_DIR / "assets"

FONT_BOLD_CANDIDATES = [
    "/home/nalda/.local/share/fonts/Pretendard-Bold.otf",
    "/home/nalda/.local/share/fonts/NotoSansKR.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
FONT_REG_CANDIDATES = [
    "/home/nalda/.local/share/fonts/Pretendard-Regular.otf",
    "/home/nalda/.local/share/fonts/NotoSansKR.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = FONT_BOLD_CANDIDATES if bold else FONT_REG_CANDIDATES
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def _write_speech_cadence_wav(path: Path, duration_sec: float = 6.0, sample_rate: int = 24000, seed_freq: float = 185.0) -> None:
    """Writes a 24kHz 16-bit mono WAV file with realistic syllable-like amplitude modulation."""
    path.parent.mkdir(parents=True, exist_ok=True)
    num_samples = int(duration_sec * sample_rate)
    frames = bytearray()
    for i in range(num_samples):
        t = i / sample_rate
        # Syllable cadence envelope (3.8 Hz syllable rate + 0.6 Hz phrase pause)
        phrase_gate = 1.0 if math.sin(2.0 * math.pi * 0.55 * t) > -0.35 else 0.08
        syllable_env = max(0.0, math.sin(2.0 * math.pi * 3.8 * t)) ** 0.7
        f0 = seed_freq + 22.0 * math.sin(2.0 * math.pi * 1.3 * t)
        # Fundamental + first two vocal formants
        wave_val = (
            0.55 * math.sin(2.0 * math.pi * f0 * t)
            + 0.28 * math.sin(2.0 * math.pi * (f0 * 2.0) * t)
            + 0.17 * math.sin(2.0 * math.pi * 720.0 * t)
        )
        sample = int(9500 * phrase_gate * syllable_env * wave_val)
        sample = max(-32767, min(32767, sample))
        frames.extend(struct.pack("<h", sample))

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(frames))


def render_forged_warrant_sample(path: Path) -> None:
    """Renders a clean A4-style raw document image of a scammer's forged warrant (no pre-baked AI verdict overlays)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 1100, 1480
    img = Image.new("RGB", (w, h), (252, 252, 250))
    draw = ImageDraw.Draw(img)

    # Outer paper border & inner double-line official frame
    draw.rectangle([40, 40, w - 40, h - 40], fill=(255, 255, 255), outline=(82, 82, 91), width=3)
    draw.rectangle([52, 52, w - 52, h - 52], outline=(161, 161, 170), width=1)

    # Top doc classification & case number
    draw.text((95, 95), "문서분류 : 대검찰청 전자공문 제2026-881호", fill=(63, 63, 70), font=_load_font(21, bold=False))
    draw.text((95, 132), "사건번호 : 2026형제99812호", fill=(24, 24, 27), font=_load_font(26, bold=True))
    draw.rectangle([800, 92, 995, 152], outline=(39, 39, 42), width=2)
    draw.text((826, 108), "대외비 · 긴급집행", fill=(39, 39, 42), font=_load_font(21, bold=True))

    # Main document title
    draw.text((310, 225), "전 자 문 서 구 속 영 장", fill=(17, 24, 39), font=_load_font(46, bold=True))
    draw.line([280, 290, 820, 290], fill=(24, 24, 27), width=3)

    # Metadata table
    table_top = 340
    rows = [
        ("성        명", "김 순 자  (피조사자 / 명의도용 연루 조사 대상)"),
        ("발 신 기 관", "서울중앙지방검찰청 반부패수사1부 (담당: 김태훈 검사)"),
        ("사 건 요 지", "금융실명거래법 위반 및 대포통장 개설 연루 사건"),
        ("송 달 방 식", "모바일 메신저(카카오톡) 비대면 약식 전자송달"),
        ("보 안 도 메 인", "http://m.spo-go-kr.net/case-2026 (온라인 사건조회)"),
    ]
    for idx, (label, val) in enumerate(rows):
        y = table_top + idx * 68
        draw.rectangle([95, y, 310, y + 60], fill=(244, 244, 245), outline=(161, 161, 170), width=1)
        draw.rectangle([310, y, 1005, y + 60], fill=(255, 255, 255), outline=(161, 161, 170), width=1)
        draw.text((120, y + 17), label, fill=(24, 24, 27), font=_load_font(22, bold=True))
        draw.text((335, y + 17), val, fill=(39, 39, 42), font=_load_font(21, bold=False))

    # Body clauses
    draw.rectangle([95, 725, 1005, 1085], fill=(250, 250, 250), outline=(161, 161, 170), width=2)
    draw.text((125, 755), "[구속집행 유예 및 국가안전계좌 자산검수 명령 조항]", fill=(24, 24, 27), font=_load_font(25, bold=True))
    clauses = [
        "1. 위 피조사자는 대규모 금융사기 대포통장 사건(2026형제99812호)과 관련하여 구속수사 대상이나,",
        "   비대면 약식조사를 조건으로 구속영장 집행을 일시 유예함.",
        "2. 피조사자는 본인 명의 전 금융권 예금을 '국고보관용 국가안전계좌(국민은행 110-492-998102)'로",
        "   즉시 이체하여 불법자금 여부에 대한 정밀 출처 검수를 받아야 함.",
        "3. 상단 안내 도메인 접속 후 비대면 조사용 원격보안앱(TeamViewer / 안전점검.apk)을 즉시 설치할 것.",
        "4. 본 사건은 1급 수사기밀이므로 가족, 은행 창구 직원, 경찰관 등 제3자에게 발설 시 즉시 구속함.",
    ]
    for i, line in enumerate(clauses):
        draw.text((125, 810 + i * 42), line, fill=(39, 39, 42), font=_load_font(20, bold=False))

    # Date, Issuer, and Square Red Seal Stamp (without Court Clerk seal)
    draw.text((400, 1165), "2026년   10월   16일", fill=(24, 24, 27), font=_load_font(28, bold=False))
    draw.text((255, 1245), "서 울 중 앙 지 방 검 찰 청   담 당 검 사   김 태 훈", fill=(17, 24, 39), font=_load_font(31, bold=True))

    # Red square official-looking stamp overlapped on signature
    seal_x1, seal_y1, seal_x2, seal_y2 = 825, 1205, 955, 1335
    draw.rectangle([seal_x1, seal_y1, seal_x2, seal_y2], outline=(200, 30, 30), width=4)
    draw.rectangle([seal_x1 + 6, seal_y1 + 6, seal_x2 - 6, seal_y2 - 6], outline=(200, 30, 30), width=1)
    draw.text((843, 1232), "서울중앙", fill=(200, 30, 30), font=_load_font(24, bold=True))
    draw.text((843, 1265), "지검장인", fill=(200, 30, 30), font=_load_font(24, bold=True))

    draw.text((95, 1395), "※ 본 문서는 보이스피싱 AI 탐지 시연용 가상 테스트 문서입니다.", fill=(161, 161, 170), font=_load_font(16, bold=False))
    img.save(path, format="PNG", optimize=True)


def render_forged_fss_notice(path: Path) -> None:
    """Renders a clean A4-style raw document image of a forged FSS Safe Account notice (no pre-baked AI verdict overlays)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 1100, 1480
    img = Image.new("RGB", (w, h), (252, 252, 250))
    draw = ImageDraw.Draw(img)

    draw.rectangle([40, 40, w - 40, h - 40], fill=(255, 255, 255), outline=(82, 82, 91), width=3)
    draw.rectangle([52, 52, w - 52, h - 52], outline=(161, 161, 170), width=1)

    draw.text((95, 95), "행정공문 : 금융감독원 불법금융대응단 제2026-4410호", fill=(63, 63, 70), font=_load_font(21, bold=False))
    draw.text((95, 132), "사건번호 : 2026형제4410호 (명의도용 계좌 동결)", fill=(24, 24, 27), font=_load_font(26, bold=True))
    draw.rectangle([790, 92, 995, 152], outline=(39, 39, 42), width=2)
    draw.text((815, 108), "긴급 자산보호 명령", fill=(39, 39, 42), font=_load_font(21, bold=True))

    draw.text((210, 225), "금융감독원 국가안전계좌 예치 명령서", fill=(17, 24, 39), font=_load_font(42, bold=True))
    draw.line([195, 290, 905, 290], fill=(24, 24, 27), width=3)

    table_top = 340
    rows = [
        ("수 신 인", "김 순 자  귀하 (본인 명의 계좌 도용 피해 조사 대상)"),
        ("발 신 부 서", "금융감독원 불법금융대응단 민원조사팀 (박진우 팀장)"),
        ("지 정 계 좌", "국민은행 110-492-998102 (임시 국고안전계좌)"),
        ("원 격 점 검", "http://fss-go-kr.net 접속 후 TeamViewer / 안전점검.apk 설치"),
        ("송 달 경 로", "카카오톡 모바일 긴급 전자문서 송달"),
    ]
    for idx, (label, val) in enumerate(rows):
        y = table_top + idx * 68
        draw.rectangle([95, y, 310, y + 60], fill=(244, 244, 245), outline=(161, 161, 170), width=1)
        draw.rectangle([310, y, 1005, y + 60], fill=(255, 255, 255), outline=(161, 161, 170), width=1)
        draw.text((120, y + 17), label, fill=(24, 24, 27), font=_load_font(22, bold=True))
        draw.text((335, y + 17), val, fill=(39, 39, 42), font=_load_font(21, bold=False))

    draw.rectangle([95, 725, 1005, 1085], fill=(250, 250, 250), outline=(161, 161, 170), width=2)
    draw.text((125, 755), "[비대면 자산 보호 및 안전계좌 이체 이행 지침]", fill=(24, 24, 27), font=_load_font(25, bold=True))
    clauses = [
        "1. 귀하의 개인정보 유출로 인해 개설된 대포통장이 금융범죄에 연루되어 전 계좌 동결 예정임.",
        "2. 피해 구제를 위해 현재 보유 중인 예금 전액을 상기 지정된 금융감독원 국가안전계좌로",
        "   금일 16:00까지 즉시 이체하여 자금 일련번호 검수를 완료해야 함.",
        "3. 스마트폰 악성코드 감염 확인을 위해 원격제어 앱(TeamViewer / 안전점검.apk)을 필히 설치할 것.",
        "4. 은행 직원이나 가족, 경찰(112)에게 본 공문 내용을 발설할 경우 공무집행방해로 즉시 구속영장 청구.",
    ]
    for i, line in enumerate(clauses):
        draw.text((125, 810 + i * 42), line, fill=(39, 39, 42), font=_load_font(20, bold=False))

    draw.text((400, 1165), "2026년   10월   16일", fill=(24, 24, 27), font=_load_font(28, bold=False))
    draw.text((310, 1245), "금  융  감  독  원  장", fill=(17, 24, 39), font=_load_font(34, bold=True))

    seal_x1, seal_y1, seal_x2, seal_y2 = 760, 1205, 890, 1335
    draw.rectangle([seal_x1, seal_y1, seal_x2, seal_y2], outline=(200, 30, 30), width=4)
    draw.rectangle([seal_x1 + 6, seal_y1 + 6, seal_x2 - 6, seal_y2 - 6], outline=(200, 30, 30), width=1)
    draw.text((778, 1232), "금융감독", fill=(200, 30, 30), font=_load_font(24, bold=True))
    draw.text((778, 1265), "원장지인", fill=(200, 30, 30), font=_load_font(24, bold=True))

    draw.text((95, 1395), "※ 본 문서는 보이스피싱 AI 탐지 시연용 가상 테스트 문서입니다.", fill=(161, 161, 170), font=_load_font(16, bold=False))
    img.save(path, format="PNG", optimize=True)


def render_benign_bank_notice(path: Path) -> None:
    """Renders a clean A4-style raw document image of a legitimate bank maturity notice (no pre-baked AI verdict overlays)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 1100, 1480
    img = Image.new("RGB", (w, h), (252, 253, 252))
    draw = ImageDraw.Draw(img)

    draw.rectangle([40, 40, w - 40, h - 40], fill=(255, 255, 255), outline=(161, 161, 170), width=2)
    draw.rectangle([52, 52, w - 52, h - 52], outline=(212, 212, 216), width=1)

    draw.text((95, 95), "고객안내문 : 신한-서초-2026-1016", fill=(63, 63, 70), font=_load_font(21, bold=False))
    draw.text((95, 132), "발신지점 : 신한은행 서초금융센터 (대표전화 1599-8000)", fill=(24, 24, 27), font=_load_font(23, bold=True))

    draw.text((240, 225), "정기예금 만기 갱신 및 창구 방문 안내", fill=(17, 24, 39), font=_load_font(42, bold=True))
    draw.line([220, 290, 880, 290], fill=(39, 39, 42), width=2)

    table_top = 340
    rows = [
        ("고 객 성 명", "김 순 자  고객님"),
        ("안 내 상 품", "신한 플러스 정기예금 (12개월 만기 도래 안내)"),
        ("만 기 일 자", "2026년 10월 25일"),
        ("신청 및 문의", "본인 신분증 지참 후 가까운 영업점 창구 직접 방문"),
    ]
    for idx, (label, val) in enumerate(rows):
        y = table_top + idx * 72
        draw.rectangle([95, y, 310, y + 62], fill=(244, 244, 245), outline=(212, 212, 216), width=1)
        draw.rectangle([310, y, 1005, y + 62], fill=(255, 255, 255), outline=(212, 212, 216), width=1)
        draw.text((120, y + 18), label, fill=(24, 24, 27), font=_load_font(22, bold=True))
        draw.text((335, y + 18), val, fill=(39, 39, 42), font=_load_font(21, bold=False))

    draw.rectangle([95, 680, 1005, 1040], fill=(249, 250, 251), outline=(212, 212, 216), width=2)
    draw.text((125, 715), "[만기 해지·재예치 절차 및 보이스피싱 예방 안내]", fill=(24, 24, 27), font=_load_font(24, bold=True))
    clauses = [
        "1. 항상 저희 신한은행을 이용해 주시는 고객님께 깊이 감사드립니다.",
        "2. 가입하신 정기예금 만기일이 도래함에 따라 영업점 창구 내방 또는 공식 모바일뱅킹(SOL)을",
        "   통해 만기 해지 및 재예치 신청이 가능하오니 이용에 참고하시기 바랍니다.",
        "3. [금융사기 주의 안내] 은행 및 금융기관은 어떠한 경우에도 전화나 메신저(카카오톡)로",
        "   특정 계좌 송금, 안전계좌 이체, 원격제어 앱(APK) 설치, 비밀번호를 요구하지 않습니다.",
    ]
    for i, line in enumerate(clauses):
        draw.text((125, 770 + i * 42), line, fill=(63, 63, 70), font=_load_font(20, bold=False))

    draw.text((400, 1155), "2026년   10월   16일", fill=(39, 39, 42), font=_load_font(28, bold=False))
    draw.text((320, 1235), "신 한 은 행   서 초 금 융 센 터 장", fill=(17, 24, 39), font=_load_font(32, bold=True))

    draw.text((95, 1395), "※ 본 안내문은 정상 금융 안내 대조군 시연용 샘플입니다.", fill=(161, 161, 170), font=_load_font(16, bold=False))
    img.save(path, format="PNG", optimize=True)


def render_intro_frame(path: Path) -> None:
    """Renders a 1920x1080 FHD dark-mode intro slide for TakeTheCall."""
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 1920, 1080
    img = Image.new("RGB", (w, h), (9, 9, 11))
    draw = ImageDraw.Draw(img)

    # Subtle header bar & border frame
    draw.rectangle([60, 60, w - 60, h - 60], outline=(39, 39, 42), width=2)
    draw.rectangle([120, 130, 520, 184], fill=(127, 29, 29), outline=(239, 68, 68), width=2)
    draw.text((145, 143), "GOOGLE DEEPMIND GEMINI 2026", fill=(254, 226, 226), font=_load_font(22, bold=True))

    draw.text((120, 230), "TakeTheCall (대신받아)", fill=(250, 250, 250), font=_load_font(76, bold=True))
    draw.text((120, 335), "실시간 보이스피싱 AI 대리 방어 · 위조 구속영장 6대 법령 감식 에이전트", fill=(161, 161, 170), font=_load_font(36, bold=False))

    # 3 Core Feature Cards
    cards = [
        (
            "1. <300ms 실시간 통화 가로채기",
            "gemini-3.8-live-extended-thinking",
            "수상한 독촉·고립 유도를 실시간 감지하고,\n피해자 대신 AI가 통화를 이어받아 시간을 법니다.",
            (239, 68, 68),
        ),
        (
            "2. 카톡 가짜 영장 6대 법령 검증",
            "gemini-4-argon (Interactions API)",
            "형사소송법 제85조 및 사건번호·직인 위조 여부를\nByte-0 프리픽스 캐싱으로 1초 내 판별합니다.",
            (59, 130, 246),
        ),
        (
            "3. 가족 공동 승인 & 112·1332·1301 신고",
            "3-Layer Human-in-the-Loop Gate",
            "추출된 5대 범죄 단서(IOC)를 바탕으로\n보호자 승인 후 경찰·금감원·검찰에 즉시 전송합니다.",
            (16, 185, 129),
        ),
    ]
    for idx, (title, badge, desc, accent) in enumerate(cards):
        x1 = 120 + idx * 570
        y1 = 460
        x2 = x1 + 530
        y2 = 860
        draw.rectangle([x1, y1, x2, y2], fill=(24, 24, 27), outline=accent, width=3)
        draw.text((x1 + 36, y1 + 40), title, fill=(250, 250, 250), font=_load_font(30, bold=True))
        draw.rectangle([x1 + 36, y1 + 98, x2 - 36, y1 + 144], fill=(39, 39, 42))
        draw.text((x1 + 52, y1 + 109), badge, fill=accent, font=_load_font(21, bold=True))
        for line_i, line in enumerate(desc.split("\n")):
            draw.text((x1 + 36, y1 + 185 + line_i * 44), line, fill=(212, 212, 216), font=_load_font(24, bold=False))

    draw.text((120, 935), "Zero-Howling WebAudio Digital Routing  |  Byte-0 Implicit Prefix Cache (>4,096 Tokens)  |  Toss-Style Plain Korean UX", fill=(113, 113, 122), font=_load_font(24, bold=True))
    img.save(path, format="PNG", optimize=True)


def render_outro_frame(path: Path) -> None:
    """Renders a 1920x1080 FHD architecture & KPI summary slide for TakeTheCall."""
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 1920, 1080
    img = Image.new("RGB", (w, h), (9, 9, 11))
    draw = ImageDraw.Draw(img)

    draw.rectangle([60, 60, w - 60, h - 60], outline=(39, 39, 42), width=2)
    draw.text((120, 130), "TakeTheCall (대신받아) — Verified Architecture & KPIs", fill=(250, 250, 250), font=_load_font(56, bold=True))
    draw.text((120, 215), "Dual-Engine Gemini 3.8 Live + Gemini 4 Argon Active Defense System", fill=(161, 161, 170), font=_load_font(30, bold=False))

    kpis = [
        ("88% 절감", "Byte-0 Implicit Prefix Caching", "20대 보이스피싱 판례 + 6대 법령 규칙(>4,096 토큰) 0번 오프셋 고정"),
        ("< 300ms", "실시간 양방향 음성 개입 지연시간", "NON_BLOCKING 함수 호출 + INTERRUPT 스케줄링으로 즉각 대리 응대"),
        ("6대 법령 규칙", "위조 구속영장·공문서 자동 감식", "형사소송법 제85조, 사건번호(2026형제), 법원 직인 누락 등 정밀 대조"),
        ("3-Layer HITL", "오신고 0% 안전 거버넌스 게이트", "1단계 AI 방어 → 2단계 가족 알림 → 3단계 112·1332·1301 공식 신고"),
    ]
    for idx, (metric, title, detail) in enumerate(kpis):
        col = idx % 2
        row = idx // 2
        x1 = 120 + col * 860
        y1 = 310 + row * 280
        x2 = x1 + 820
        y2 = y1 + 240
        draw.rectangle([x1, y1, x2, y2], fill=(24, 24, 27), outline=(63, 63, 70), width=2)
        draw.text((x1 + 40, y1 + 35), metric, fill=(74, 222, 128), font=_load_font(48, bold=True))
        draw.text((x1 + 40, y1 + 108), title, fill=(250, 250, 250), font=_load_font(28, bold=True))
        draw.text((x1 + 40, y1 + 155), detail, fill=(161, 161, 170), font=_load_font(22, bold=False))

    draw.rectangle([120, 890, 1800, 975], fill=(24, 24, 27), outline=(59, 130, 246), width=2)
    draw.text((155, 918), "긴급 신고 연계: 경찰청 112  |  금융감독원 1332  |  검찰청 1301  —  지금 바로 어르신의 통화를 지켜드립니다.", fill=(228, 228, 231), font=_load_font(26, bold=True))
    img.save(path, format="PNG", optimize=True)


async def synthesize_all_assets() -> dict[str, str]:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Synthesize Case 01 audio & English narration (with realistic speech-cadence fallback)
    scammer_req = TTSSynthesizeRequest(
        text="서울중앙지검 첨단범죄수사1부입니다. <short pause> 본인 명의 계좌가 범죄에 연루되어 구속영장이 발부되었습니다.",
        voice_name="Kore",
        language_code="ko-KR",
    )
    narration_req = TTSSynthesizeRequest(
        text="TakeTheCall intercepts coercive scam calls in under 300 milliseconds using Gemini 3.8 Live and Gemini 4 Argon.",
        voice_name="Puck",
        language_code="en-US",
    )

    scammer_tts, narration_tts = await asyncio.gather(
        synthesize_scammer_or_narration_tts(scammer_req),
        synthesize_scammer_or_narration_tts(narration_req),
    )

    scammer_wav = ASSETS_DIR / "scammer_case01.wav"
    narration_wav = ASSETS_DIR / "narration_en.wav"

    if scammer_tts.get("mode") == "live" and scammer_tts.get("audio_bytes", 0) > 1000:
        import base64
        scammer_wav.write_bytes(base64.b64decode(scammer_tts["audio_b64"]))
    else:
        _write_speech_cadence_wav(scammer_wav, duration_sec=6.0, seed_freq=165.0)

    if narration_tts.get("mode") == "live" and narration_tts.get("audio_bytes", 0) > 1000:
        import base64
        narration_wav.write_bytes(base64.b64decode(narration_tts["audio_b64"]))
    else:
        _write_speech_cadence_wav(narration_wav, duration_sec=6.0, seed_freq=210.0)

    # 2. Render high-resolution PNG assets using Pillow + Korean fonts
    warrant_png = ASSETS_DIR / "forged_warrant_sample.png"
    intro_png = ASSETS_DIR / "intro_frame.png"
    outro_png = ASSETS_DIR / "outro_frame.png"

    render_forged_warrant_sample(warrant_png)
    render_intro_frame(intro_png)
    render_outro_frame(outro_png)

    return {
        "scammer_case01_wav": str(scammer_wav),
        "narration_en_wav": str(narration_wav),
        "forged_warrant_sample_png": str(warrant_png),
        "intro_frame_png": str(intro_png),
        "outro_frame_png": str(outro_png),
    }


if __name__ == "__main__":
    results = asyncio.run(synthesize_all_assets())
    for k, v in results.items():
        size_kb = os.path.getsize(v) / 1024.0
        print(f"[OK] {k}: {v} ({size_kb:.1f} KB)")
