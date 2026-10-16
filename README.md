# TakeTheCall (대신받아) — Real-Time Voice Phishing Active Defense Agent

**TakeTheCall (대신받아 — "Answer For Me")** is a real-time, dual-engine AI active defense agent built on the **2026 Google GenAI SDK (`google-genai >= 2.30.1`)** that intercepts voice phishing calls targeting seniors and foreign residents, audits forged arrest warrants against South Korean statutes in under 2 seconds, and dispatches verified forensic packets to authorities with Human-in-the-Loop (HITL) approval.

---

## 1. Dual-Engine Multi-Agent Architecture

TakeTheCall separates ultra-low-latency audio defense from deep statutory and forensic verification:

1. **Front-Line Shield (`gemini-3.8-live-extended-thinking` / `gemini-3.8-live`)**:
   - Streams full-duplex `16kHz Int16 PCM` caller audio (`audio/pcm;rate=16000`) and suspect warrant frames (`image/jpeg`) via `session.send_realtime_input(...)`.
   - Transcribes noisy scammer audio via `gemini-3.5-transcribe-live` (`input_audio_transcription={"mode": "smart"}`) and translates protective warnings into English, Korean, and Vietnamese (`gemini-3.5-live-translate-preview`).
   - Invokes the non-blocking tool `consult_argon_guardian` (`behavior="NON_BLOCKING"`) without pausing audio playback.
   - Tracks `message.interaction_status` (`"IN_PROGRESS"` vs `"IDLE"`) and whispers mid-call coaching cues via `session.send_client_content(..., turn_complete=False)`.

2. **Back-End Forensic Verifier (`gemini-4-argon` via Interactions API)**:
   - Pins a `>4,096`-token static legal knowledge base (`STATIC_1M_PREFIX`) at **Byte-0** containing South Korean Criminal Procedure Act statutes, the **6 Statutory Forged Warrant Verification Rules**, and the **20 Public Korean Voice Phishing Cases (`data/cases-20.json`)**.
   - Chains multi-turn context via `previous_interaction_id` to leverage **Implicit Prefix Caching** (`interaction.usage.total_cached_tokens`).
   - Uses `generation_config={"thinking_level": "medium", "max_output_tokens": 32768}` for `<2s` live triage, and `"thinking_level": "high"` for post-call Family Guardian forensic packet verification.
   - Enforces top-level `response_format=ArgonCoreSchema.model_json_schema()`.

3. **Dynamic Tool Response Scheduling (`session.send_tool_response`)**:
   - `risk_level in ("SAFE", "LOW")` -> `scheduling="SILENT"` (Zero interruption to ordinary family or delivery calls).
   - `risk_level == "HIGH"` (Stages 1–3) -> `scheduling="WHEN_IDLE"` (Injects statutory counter-questions to stall the scammer).
   - `risk_level == "CRITICAL"` (Stages 4–5: Remote Control APK / Safe Account Extortion) -> `scheduling="INTERRUPT"` (Immediately halts scammer coercion, switches to **Safety Shield Mode**, and locks external actions behind the **3-Layer Human-in-the-Loop Safety Gate**).

---

## 2. 6 Korean Statutory Forged Warrant Verification Rules

| Rule ID | Statutory Citation | Verification Criterion |
| :--- | :--- | :--- |
| `RULE_1` | Criminal Procedure Act Art. 85, 118, 219 | Warrants must be presented in person as physical originals; KakaoTalk/SMS/URL delivery is 100% forged. |
| `RULE_2` | Constitution Art. 12(3); CPA Art. 81, 215 | Only a **District Court Judge** can issue and sign a warrant—never a Prosecutor or FSS official. |
| `RULE_3` | Admin. Efficiency Reg. Art. 14–21 | Official seals must follow square *Jeonseo-che* typography; dual prosecutor/court seals are forged. |
| `RULE_4` | Criminal Procedure Act Art. 448 | Summary orders apply strictly to fines; "National Safe Account" (`국가안전계좌`) does not exist in Korean law. |
| `RULE_5` | Prosecution & Court Case Numbering Rules | Prosecution case numbers (`2026형제OOOOO호`) cannot substitute for Court Warrant numbers (`2026초기OOOO호`). |
| `RULE_6` | KICS & 1301 Verification Center | Official verification occurs only via `kics.go.kr` or `1301`; spoofed domains (`spo-go-kr.net`) or RAT APKs (`TeamViewer`) are phishing. |

---

## 3. 5 Standardized Forensic Indicators of Compromise (IOCs)

1. `impersonated_agency`: Impersonated institution & officer name (e.g., `서울중앙지검 반부패수사1부 김태훈 검사`)
2. `case_number`: Claimed case or warrant number (e.g., `2026형제10492호`)
3. `phishing_url_or_app`: Malicious phishing URL or remote control APK (e.g., `m.spo-go-kr.net/case / TeamViewer APK`)
4. `mule_account`: Mule bank account or transfer demand (e.g., `국민은행 안전계좌 사칭 담보 이체 요구`)
5. `extortion_spot_or_method`: Cash pickup location or extortion method (e.g., `국가안전계좌 전액 이체 및 원격제어 탈취 시도`)

---

## 4. API Reference

- `GET  /` — Serves the 3-Pane SaaS Web Console (`static/index.html`)
- `GET  /api/health` — Model inventory, SDK status, and Byte-0 prefix cache readiness
- `GET  /api/cases` — Returns all 20 public Korean voice phishing cases (`CASE-01`..`CASE-20`) + 6 statutory rules
- `POST /api/ephemeral-token` — Mints short-lived Gemini Live Ephemeral Tokens (`auth_tokens.create`) + WebAudio zero-howling spec
- `POST /api/argon/verify` — Turn-by-turn `gemini-4-argon` (`thinking_level="medium"`) statutory & IOC verification
- `POST /api/argon/warrant-audit` — Multimodal forged warrant audit against `RULE_1`..`RULE_6`
- `POST /api/guardian/verify-and-dispatch` — Post-call `gemini-4-argon` (`thinking_level="high"`) verification + Layer-3 HITL dispatch to `112`, `1332`, and `1301`
- `POST /api/tts/synthesize` — Expressive scammer audio & SaaS narration synthesis via `gemini-3.8-flash-tts`
- `WS   /ws/live-shield` — Real-time bidirectional Live Shield & Argon non-blocking session bridge

---

## 5. Quickstart & Cloud Run Deployment

```bash
# 1. Install dependencies with uv
uv sync

# 2. Run test suite
uv run pytest

# 3. Synthesize demo assets (TTS WAVs & Forged Warrant / Keyframe PNGs)
uv run python scripts/synthesize_assets.py

# 4. Launch FastAPI server locally
uv run uvicorn app.main:app --host 0.0.0.0 --port 8080

# 5. Deploy to Google Cloud Run
gcloud run deploy takethecall \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=${GEMINI_API_KEY}"
```
