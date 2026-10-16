"""Automated 1080p Playwright UI Video Recorder & Multi-Track Audio Mixer (`scripts/record_and_build_demo.py`).

Builds `/data/projects/deepmind/final_submission.mp4` and `/data/projects/deepmind/assets/live_ui_capture.mp4` by:
1. Synthesizing studio English narration segments via `gemini-3.8-flash-tts` (`Puck` voice).
2. Launching the live FastAPI backend (`app.main:app`) with `GEMINI_API_KEY` so real `POST /api/argon/verify`
   and `POST /api/argon/warrant-audit` interactions execute live on screen.
3. Recording the 1920x1080 browser simulation via headless Chromium (`playwright`) with millisecond-accurate
   audio event hooks (`window.__audioTimeline`) and deterministic wall-clock playback pacing.
4. Mixing the 5 multi-speaker Korean simulation voices (`assets/audio/case01_t1..t5.mp3`) and the English
   narration tracks at exact timestamps using `ffmpeg`, then stitching Intro + Live UI Capture + Outro
   into `final_submission.mp4`.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.argon_verifier import _load_dotenv_if_present
from app.tts_service import TTSSynthesizeRequest, synthesize_scammer_or_narration_tts

ASSETS_DIR = ROOT_DIR / "assets"
AUDIO_DIR = ASSETS_DIR / "audio"
CHROMIUM_BIN = "/home/nalda/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"


def get_ffmpeg_bin() -> str:
    local_ffmpeg = Path("/home/nalda/.local/bin/ffmpeg")
    if local_ffmpeg.exists():
        return str(local_ffmpeg)
    found = shutil.which("ffmpeg")
    if found:
        return found
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def get_audio_duration_sec(path: Path, ffmpeg_bin: str) -> float:
    """Return exact duration in seconds of a WAV/MP3 file."""
    try:
        with wave.open(str(path), "rb") as wf:
            return wf.getnframes() / float(wf.getframerate())
    except Exception:
        pass
    proc = subprocess.run(
        [ffmpeg_bin, "-i", str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    for line in proc.stderr.splitlines():
        if "Duration:" in line:
            parts = line.split("Duration:")[1].split(",")[0].strip().split(":")
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    return 10.0


EN_SEGMENTS: list[tuple[str, str]] = [
    (
        "en_seg1_intro.wav",
        (
            "TakeTheCall is an autonomous real-time voice phishing defense agent built on "
            "Gemini 3.8 Live and Gemini 4 Argon. <short pause> "
            "Let's watch it intercept a live prosecutor impersonation scam call in real time."
        ),
    ),
    (
        "en_seg2_warrant.wav",
        (
            "Now, when the scammer sends a forged arrest warrant via messenger, "
            "Gemini 4 Argon Vision cross-checks the document against six Korean statutory rules "
            "in under two seconds, <short pause> flagging six out of six violations with full JSON telemetry."
        ),
    ),
    (
        "en_seg3_hitl.wav",
        (
            "Finally, our three-layer Human-in-the-Loop safety gate co-signs with the family guardian "
            "to dispatch verified forensic packets to 112 Police and 1332 Financial Regulators, "
            "<short pause> backed by twenty public scam cases cached at Byte-0."
        ),
    ),
    (
        "en_seg4_outro.wav",
        (
            "TakeTheCall: sub-300 millisecond active voice defense, eighty-eight percent Byte-0 prefix cache savings, "
            "and zero false dispatches. <short pause> Protecting seniors and families in real time."
        ),
    ),
]


async def synthesize_english_segments(ffmpeg_bin: str) -> dict[str, Path]:
    """Synthesize the 4 English narration segments via `gemini-3.8-flash-tts` (`Puck`)."""
    _load_dotenv_if_present()
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    out_paths: dict[str, Path] = {}

    for filename, text in EN_SEGMENTS:
        target = AUDIO_DIR / filename
        if target.exists() and target.stat().st_size > 50_000:
            dur = get_audio_duration_sec(target, ffmpeg_bin)
            if dur > 4.0:
                print(f"[TTS-CACHE] Reusing {filename} ({dur:.2f}s)")
                out_paths[filename] = target
                continue

        req = TTSSynthesizeRequest(
            text=text,
            speaker="Puck",
            voice_name="Puck",
            style="Clear, confident, articulate enterprise SaaS product narrator",
        )
        res = await synthesize_scammer_or_narration_tts(req)
        b64_data = res.get("audio_b64", "")
        if res.get("mode") in ("live", "live_tts") and len(b64_data) > 1000:
            raw = base64.b64decode(b64_data)
            target.write_bytes(raw)
            dur = get_audio_duration_sec(target, ffmpeg_bin)
            print(f"[GEMINI-3.8-TTS] Synthesized {filename} ({dur:.2f}s, {len(raw) // 1024} KB)")
        else:
            # Fallback to edge_tts if needed
            import edge_tts

            clean_text = text.replace("<short pause>", "")
            tmp_mp3 = target.with_suffix(".tmp.mp3")
            comm = edge_tts.Communicate(text=clean_text, voice="en-US-BrianMultilingualNeural", rate="+2%")
            await comm.save(str(tmp_mp3))
            subprocess.run(
                [ffmpeg_bin, "-y", "-i", str(tmp_mp3), "-ar", "24000", "-ac", "1", str(target)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            tmp_mp3.unlink(missing_ok=True)
            dur = get_audio_duration_sec(target, ffmpeg_bin)
            print(f"[NEURAL-TTS] Synthesized {filename} ({dur:.2f}s)")
        out_paths[filename] = target

    # Also build combined `assets/narration_en.wav` from the 4 segments
    concat_inputs: list[str] = []
    filter_parts: list[str] = []
    for idx, (fname, _) in enumerate(EN_SEGMENTS):
        concat_inputs.extend(["-i", str(out_paths[fname])])
        filter_parts.append(f"[{idx}:a]")
    filter_str = "".join(filter_parts) + f"concat=n={len(EN_SEGMENTS)}:v=0:a=1[outa]"
    narration_wav = ASSETS_DIR / "narration_en.wav"
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            *concat_inputs,
            "-filter_complex",
            filter_str,
            "-map",
            "[outa]",
            "-ar",
            "24000",
            "-ac",
            "1",
            str(narration_wav),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    print(
        f"[OK] Combined narration_en.wav ready ({get_audio_duration_sec(narration_wav, ffmpeg_bin):.2f}s)"
    )
    return out_paths


def wait_for_server(url: str, timeout_sec: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.25)
    return False


async def record_live_dashboard_simulation(
    server_url: str,
    ffmpeg_bin: str,
    warrant_narration_dur: float,
    hitl_narration_dur: float,
) -> tuple[Path, list[dict[str, Any]], float, float, float]:
    """Record 1920x1080 dashboard simulation via Playwright and return video path + audio sync metadata."""
    from playwright.async_api import async_playwright

    # Measure exact durations of all scenario audio files so headless Chromium advances `currentTime`
    # at 1.0x real wall-clock speed and never cuts off or rushes a turn.
    audio_durations: dict[str, float] = {}
    for p in AUDIO_DIR.glob("*.mp3"):
        audio_durations[f"/assets/audio/{p.name}"] = round(get_audio_duration_sec(p, ffmpeg_bin), 3)

    print("[INFO] Measured scenario audio durations:", json.dumps(audio_durations, indent=2))

    tmp_video_dir = Path(tempfile.mkdtemp(prefix="ttc_pw_video_"))

    init_script = f"""
    (() => {{
      window.__ttcVideoOriginMs = performance.now();
      window.__ttcAudioDurations = {json.dumps(audio_durations)};
      window.__ttcAudioEvents = [];

      // Deterministic wall-clock HTMLAudioElement driver for headless Chromium recording
      const origPlay = window.HTMLMediaElement.prototype.play;
      window.HTMLMediaElement.prototype.play = function() {{
        const rawSrc = this.getAttribute('src') || this.src || '';
        const cleanPath = rawSrc.split('?')[0].replace(/^https?:\\/\\/[^/]+/, '');
        const exactDur = window.__ttcAudioDurations[cleanPath];
        const startOffsetSec = (performance.now() - window.__ttcVideoOriginMs) / 1000.0;

        if (cleanPath && exactDur) {{
          window.__ttcAudioEvents.push({{
            path: cleanPath,
            startSec: startOffsetSec,
            durationSec: exactDur
          }});

          try {{
            Object.defineProperty(this, 'duration', {{
              configurable: true,
              get: () => exactDur
            }});
          }} catch (_) {{}}

          let elapsed = 0;
          const startPerf = performance.now();
          try {{
            Object.defineProperty(this, 'currentTime', {{
              configurable: true,
              get: () => elapsed,
              set: (v) => {{ elapsed = v; }}
            }});
          }} catch (_) {{}}

          if (this.__ttcTimer) clearInterval(this.__ttcTimer);
          this.__ttcTimer = setInterval(() => {{
            elapsed = Math.min(exactDur, (performance.now() - startPerf) / 1000.0);
            if (elapsed >= exactDur) {{
              clearInterval(this.__ttcTimer);
              this.__ttcTimer = null;
              if (typeof this.onended === 'function') {{
                this.onended(new Event('ended'));
              }}
              this.dispatchEvent(new Event('ended'));
            }}
          }}, 30);

          const origPause = this.pause.bind(this);
          this.pause = () => {{
            if (this.__ttcTimer) {{
              clearInterval(this.__ttcTimer);
              this.__ttcTimer = null;
            }}
            try {{ origPause(); }} catch (_) {{}}
          }};

          if (typeof this.onplaying === 'function') {{
            setTimeout(() => {{
              try {{ this.onplaying(new Event('playing')); }} catch (_) {{}}
            }}, 10);
          }}
          return Promise.resolve();
        }}

        return origPlay.apply(this, arguments);
      }};
    }})();
    """

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROMIUM_BIN if os.path.exists(CHROMIUM_BIN) else None,
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--autoplay-policy=no-user-gesture-required",
                "--window-size=1920,1080",
            ],
        )
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1.0,
            record_video_dir=str(tmp_video_dir),
            record_video_size={"width": 1920, "height": 1080},
        )
        await context.add_init_script(init_script)
        page = await context.new_page()
        video_obj = page.video

        print(f"[REC] Opening {server_url} at 1920x1080...")
        await page.goto(server_url, wait_until="networkidle")
        # Reset `__ttcVideoOriginMs` aligned with python monotonic clock after initial navigation
        rec_start_mono = time.monotonic()
        await page.evaluate("window.__ttcVideoOriginMs = performance.now(); window.__ttcAudioEvents = [];")

        await asyncio.sleep(1.2)

        # ------------------------------------------------------------------
        # PHASE 1: Live CASE-01 5-Turn Multi-Voice Simulation
        # ------------------------------------------------------------------
        print("[REC] Phase 1: Clicking #btn-run-critical (CASE-01 5-turn live simulation)...")
        await page.click("#btn-run-critical")

        # Wait until all 5 turns of CASE-01 complete (~68s)
        deadline = time.monotonic() + 95.0
        while time.monotonic() < deadline:
            sim_text = await page.evaluate(
                "document.getElementById('ttc-sim-bar-text')?.textContent || ''"
            )
            if "완료 · 총 5턴" in sim_text:
                break
            await asyncio.sleep(0.4)

        print("[REC] Phase 1 complete (5 turns finished). Holding 1.2s...")
        await asyncio.sleep(1.2)

        # ------------------------------------------------------------------
        # PHASE 2: Multimodal Forged Warrant Image Audit (`POST /api/argon/warrant-audit`)
        # ------------------------------------------------------------------
        t_warrant_start = await page.evaluate("(performance.now() - window.__ttcVideoOriginMs) / 1000.0")
        print(f"[REC] Phase 2 (t={t_warrant_start:.2f}s): Triggering Multimodal Forged Warrant Image Audit...")
        phase2_mono = time.monotonic()

        await page.click("#btn-run-warrant-sample")

        # Wait for live warrant audit result
        warrant_deadline = time.monotonic() + 18.0
        while time.monotonic() < warrant_deadline:
            res_text = await page.evaluate(
                "document.getElementById('ttc-warrant-live-result')?.textContent || ''"
            )
            if "실시간 멀티모달 감사 완료" in res_text:
                break
            await asyncio.sleep(0.3)

        await asyncio.sleep(1.5)
        # Briefly open Raw JSON telemetry drawer to showcase real `interaction_id` & `cached_tokens`
        json_btn = await page.query_selector("#ttc-json-toggle-btn")
        if json_btn:
            await json_btn.click()
            await asyncio.sleep(3.2)
            await json_btn.click()

        # Ensure Phase 2 lasts at least `warrant_narration_dur + 1.0s` so narration finishes cleanly
        elapsed_p2 = time.monotonic() - phase2_mono
        remaining_p2 = max(1.0, (warrant_narration_dur + 1.2) - elapsed_p2)
        await asyncio.sleep(remaining_p2)

        # ------------------------------------------------------------------
        # PHASE 3: 3-Layer HITL Family Guardian Approval & 20 Cases Dictionary
        # ------------------------------------------------------------------
        t_hitl_start = await page.evaluate("(performance.now() - window.__ttcVideoOriginMs) / 1000.0")
        print(f"[REC] Phase 3 (t={t_hitl_start:.2f}s): Triggering 3-Layer HITL Dispatch & 20 Cases View...")
        phase3_mono = time.monotonic()

        # Trigger Guardian Dispatch button on the right pane (and inline HITL card if present)
        await page.evaluate(
            """() => {
              const btn = document.getElementById('guardian-dispatch-btn');
              if (btn) btn.click();
              const inlineBtn = document.getElementById('ttc-inline-hitl-btn');
              if (inlineBtn) inlineBtn.click();
            }"""
        )
        await asyncio.sleep(4.2)

        # Switch to "4. 보이스피싱 사례 20선" tab to showcase Byte-0 20 public cases dictionary
        cases_tab = await page.query_selector('.ttc-nav-item[data-view="cases"]')
        if cases_tab:
            await cases_tab.click()
            await asyncio.sleep(1.5)
            # Expand the first case card to show 4-stage kill-chain & decoy script
            first_toggle = await page.query_selector(".ttc-case-item .ttc-case-toggle-btn")
            if first_toggle:
                await first_toggle.click()
                await asyncio.sleep(2.8)

        # Return to "한눈에 보는 통화 보호" overview for final hold
        all_tab = await page.query_selector('.ttc-nav-item[data-view="all"]')
        if all_tab:
            await all_tab.click()

        elapsed_p3 = time.monotonic() - phase3_mono
        remaining_p3 = max(1.5, (hitl_narration_dur + 1.5) - elapsed_p3)
        await asyncio.sleep(remaining_p3)

        audio_events: list[dict[str, Any]] = await page.evaluate("window.__ttcAudioEvents || []")
        total_rec_sec: float = await page.evaluate("(performance.now() - window.__ttcVideoOriginMs) / 1000.0")
        print(f"[REC] Recorded {len(audio_events)} audio turn events over {total_rec_sec:.2f}s:")
        for ev in audio_events:
            print(f"      - {ev['path']} @ {ev['startSec']:.2f}s (dur={ev['durationSec']:.2f}s)")

        await context.close()
        await browser.close()

        raw_webm_path = Path(await video_obj.path())
        return raw_webm_path, audio_events, float(t_warrant_start), float(t_hitl_start), float(total_rec_sec)


def build_clip_from_slide_and_audio(
    ffmpeg_bin: str,
    image_path: Path,
    audio_path: Path,
    output_mp4: Path,
    pad_tail_sec: float = 0.6,
) -> float:
    """Create a 1920x1080 30fps H.264 + 48kHz stereo AAC clip from a slide PNG and narration WAV."""
    audio_dur = get_audio_duration_sec(audio_path, ffmpeg_bin)
    total_dur = round(audio_dur + pad_tail_sec, 2)
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-loop",
            "1",
            "-framerate",
            "30",
            "-i",
            str(image_path),
            "-i",
            str(audio_path),
            "-filter_complex",
            (
                f"[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
                f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p,"
                f"fade=t=in:st=0:d=0.5,fade=t=out:st={max(0.5, total_dur - 0.5):.2f}:d=0.5[v];"
                f"[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                f"apad=pad_dur={pad_tail_sec}[a]"
            ),
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-t",
            f"{total_dur:.2f}",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(output_mp4),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=True,
    )
    return total_dur


def mix_live_capture_with_audio(
    ffmpeg_bin: str,
    raw_webm: Path,
    audio_events: list[dict[str, Any]],
    warrant_wav: Path,
    t_warrant_sec: float,
    hitl_wav: Path,
    t_hitl_sec: float,
    output_mp4: Path,
) -> float:
    """Combine Playwright's 1920x1080 `.webm` video with exact-timestamp Korean turn audio + English narration."""
    vid_dur = get_audio_duration_sec(raw_webm, ffmpeg_bin)
    print(f"[MIX] Raw WebM duration: {vid_dur:.2f}s")

    # Input 0 is the recorded WebM video.
    # Subsequent inputs are each recorded Korean turn audio + the 2 English narration tracks (Phase 2 & Phase 3).
    cmd: list[str] = [ffmpeg_bin, "-y", "-i", str(raw_webm)]
    mix_tracks: list[tuple[Path, float, float]] = []  # (path, start_sec, volume)

    for ev in audio_events:
        rel_path = ev["path"].lstrip("/")
        full_audio_path = ROOT_DIR / rel_path
        if full_audio_path.exists():
            mix_tracks.append((full_audio_path, float(ev["startSec"]), 1.0))

    # Add Phase 2 English narration (Multimodal Warrant Audit)
    if warrant_wav.exists():
        mix_tracks.append((warrant_wav, t_warrant_sec, 1.0))

    # Add Phase 3 English narration (3-Layer HITL & 20 Cases Dictionary)
    if hitl_wav.exists():
        mix_tracks.append((hitl_wav, t_hitl_sec, 1.0))

    for track_path, _, _ in mix_tracks:
        cmd.extend(["-i", str(track_path)])

    filter_chains: list[str] = [
        "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p[v]"
    ]

    # Create silent base stereo track spanning `vid_dur`
    filter_chains.append(
        f"anullsrc=channel_layout=stereo:sample_rate=48000:d={vid_dur:.2f}[base0]"
    )
    mix_labels: list[str] = ["[base0]"]

    for idx, (_, start_sec, vol) in enumerate(mix_tracks, start=1):
        delay_ms = max(0, int(round(start_sec * 1000)))
        lbl = f"a{idx}"
        filter_chains.append(
            f"[{idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume={vol:.2f},adelay={delay_ms}|{delay_ms}[{lbl}]"
        )
        mix_labels.append(f"[{lbl}]")

    num_inputs = len(mix_labels)
    filter_chains.append(
        f"{''.join(mix_labels)}amix=inputs={num_inputs}:duration=first:dropout_transition=0:normalize=0,"
        f"alimiter=limit=0.95[a]"
    )

    filter_complex = ";".join(filter_chains)
    cmd.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-t",
            f"{vid_dur:.2f}",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(output_mp4),
        ]
    )
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
    return vid_dur


def stitch_final_submission(
    ffmpeg_bin: str,
    intro_mp4: Path,
    live_mp4: Path,
    outro_mp4: Path,
    final_mp4: Path,
) -> float:
    """Concatenate Intro + Live UI Capture + Outro into `final_submission.mp4`."""
    subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-i",
            str(intro_mp4),
            "-i",
            str(live_mp4),
            "-i",
            str(outro_mp4),
            "-filter_complex",
            "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]",
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(final_mp4),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=True,
    )
    return get_audio_duration_sec(final_mp4, ffmpeg_bin)


async def main() -> None:
    _load_dotenv_if_present()
    ffmpeg_bin = get_ffmpeg_bin()
    print(f"[INIT] Using ffmpeg: {ffmpeg_bin}")

    # 1. Ensure slide PNGs exist
    from scripts.synthesize_assets import render_forged_warrant_sample, render_intro_frame, render_outro_frame

    render_forged_warrant_sample(ASSETS_DIR / "forged_warrant_sample.png")
    render_intro_frame(ASSETS_DIR / "intro_frame.png")
    render_outro_frame(ASSETS_DIR / "outro_frame.png")

    # 2. Synthesize English narration tracks via Gemini 3.8 Flash TTS
    en_paths = await synthesize_english_segments(ffmpeg_bin)
    warrant_dur = get_audio_duration_sec(en_paths["en_seg2_warrant.wav"], ffmpeg_bin)
    hitl_dur = get_audio_duration_sec(en_paths["en_seg3_hitl.wav"], ffmpeg_bin)

    # 3. Start local FastAPI server on port 8099
    port = 8099
    server_url = f"http://127.0.0.1:{port}"
    server_proc = None
    if not wait_for_server(f"{server_url}/api/health", timeout_sec=1.0):
        print(f"[SERVER] Starting FastAPI server on {server_url}...")
        env = os.environ.copy()
        server_proc = subprocess.Popen(
            [
                "/home/nalda/.local/bin/uv",
                "run",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=str(ROOT_DIR),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not wait_for_server(f"{server_url}/api/health", timeout_sec=15.0):
            if server_proc:
                server_proc.terminate()
            raise RuntimeError("Failed to start FastAPI server on port 8099")

    try:
        raw_webm, audio_events, t_warrant, t_hitl, _ = await record_live_dashboard_simulation(
            server_url=server_url,
            ffmpeg_bin=ffmpeg_bin,
            warrant_narration_dur=warrant_dur,
            hitl_narration_dur=hitl_dur,
        )
    finally:
        if server_proc is not None:
            server_proc.terminate()
            try:
                server_proc.wait(timeout=5)
            except Exception:
                server_proc.kill()

    # 4. Build Intro & Outro clips (1920x1080 30fps + English narration)
    intro_mp4 = ASSETS_DIR / "intro_clip.mp4"
    outro_mp4 = ASSETS_DIR / "outro_clip.mp4"
    live_mp4 = ASSETS_DIR / "live_ui_capture.mp4"
    final_mp4 = ROOT_DIR / "final_submission.mp4"

    intro_dur = build_clip_from_slide_and_audio(
        ffmpeg_bin,
        ASSETS_DIR / "intro_frame.png",
        en_paths["en_seg1_intro.wav"],
        intro_mp4,
    )
    print(f"[OK] Built intro_clip.mp4 ({intro_dur:.2f}s)")

    outro_dur = build_clip_from_slide_and_audio(
        ffmpeg_bin,
        ASSETS_DIR / "outro_frame.png",
        en_paths["en_seg4_outro.wav"],
        outro_mp4,
    )
    print(f"[OK] Built outro_clip.mp4 ({outro_dur:.2f}s)")

    # 5. Mix recorded browser video with exact-synced Korean voices + English narration
    live_dur = mix_live_capture_with_audio(
        ffmpeg_bin=ffmpeg_bin,
        raw_webm=raw_webm,
        audio_events=audio_events,
        warrant_wav=en_paths["en_seg2_warrant.wav"],
        t_warrant_sec=t_warrant,
        hitl_wav=en_paths["en_seg3_hitl.wav"],
        t_hitl_sec=t_hitl,
        output_mp4=live_mp4,
    )
    print(f"[OK] Built live_ui_capture.mp4 ({live_dur:.2f}s)")

    # 6. Stitch final_submission.mp4
    final_dur = stitch_final_submission(
        ffmpeg_bin=ffmpeg_bin,
        intro_mp4=intro_mp4,
        live_mp4=live_mp4,
        outro_mp4=outro_mp4,
        final_mp4=final_mp4,
    )
    size_mb = final_mp4.stat().st_size / (1024 * 1024)
    print(f"[SUCCESS] final_submission.mp4 ready: {final_mp4} ({final_dur:.2f}s, {size_mb:.2f} MB)")


if __name__ == "__main__":
    asyncio.run(main())
