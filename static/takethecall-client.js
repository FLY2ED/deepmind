/**
 * TakeTheCall (대신받아) — Standalone Browser SDK & Zero-Howling WebAudio Router
 *
 * Can be imported or included via <script src="/static/takethecall-client.js"></script>
 * without modifying static/index.html layout directly.
 *
 * Provides:
 * 1. TakeTheCallAudioRouter: Zero-howling digital routing via MediaStreamAudioDestinationNode
 *    -> 16kHz Int16 PCM -> Gemini 3.8 Live WebSocket -> 24kHz PCM playback.
 * 2. TakeTheCallClient: REST & WebSocket client for /ws/live-shield, /api/ephemeral-token,
 *    /api/argon/verify, /api/argon/warrant-audit, /api/guardian/verify-and-dispatch,
 *    /api/tts/synthesize, and /api/scenarios/run.
 */
(function (global) {
  "use strict";

  class TakeTheCallAudioRouter {
    constructor() {
      this.audioCtx = null;
      this.streamDest = null;
      this.workletNode = null;
    }

    /**
     * Route an <audio> element digitally into a 16kHz PCM stream without acoustic loopback.
     */
    async attachAudioElement(audioElement, onPcm16kChunk) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: 16000 });
      const sourceNode = this.audioCtx.createMediaElementSource(audioElement);

      // Monitor on local speakers while tapping a clean digital stream for Gemini Live
      sourceNode.connect(this.audioCtx.destination);
      this.streamDest = this.audioCtx.createMediaStreamDestination();
      sourceNode.connect(this.streamDest);

      const workletCode = `
        class Pcm16kCaptureProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input && input[0]) {
              const float32 = input[0];
              const int16 = new Int16Array(float32.length);
              for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              this.port.postMessage(int16.buffer, [int16.buffer]);
            }
            return true;
          }
        }
        registerProcessor("pcm-16k-capture", Pcm16kCaptureProcessor);
      `;
      const blob = new Blob([workletCode], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      await this.audioCtx.audioWorklet.addModule(workletUrl);

      const streamSource = this.audioCtx.createMediaStreamSource(this.streamDest.stream);
      this.workletNode = new AudioWorkletNode(this.audioCtx, "pcm-16k-capture");
      this.workletNode.port.onmessage = (event) => {
        if (typeof onPcm16kChunk === "function") {
          onPcm16kChunk(event.data);
        }
      };
      streamSource.connect(this.workletNode);
      return this.streamDest.stream;
    }
  }

  class TakeTheCallClient {
    constructor(baseUrl = "") {
      this.baseUrl = baseUrl;
      this.ws = null;
      this.audioRouter = new TakeTheCallAudioRouter();
    }

    async fetchHealth() {
      const res = await fetch(`${this.baseUrl}/api/health`);
      return res.json();
    }

    async fetchCases() {
      const res = await fetch(`${this.baseUrl}/api/cases`);
      return res.json();
    }

    async mintEphemeralToken() {
      const res = await fetch(`${this.baseUrl}/api/ephemeral-token`, { method: "POST" });
      return res.json();
    }

    async verifyTurn(transcriptDelta, previousInteractionId = null, warrantImageB64 = null) {
      const res = await fetch(`${this.baseUrl}/api/argon/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript_delta: transcriptDelta,
          previous_interaction_id: previousInteractionId,
          warrant_image_b64: warrantImageB64,
        }),
      });
      return res.json();
    }

    async auditForgedWarrant(payload = {}) {
      const res = await fetch(`${this.baseUrl}/api/argon/warrant-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    }

    async dispatchGuardianPacket(payload) {
      const res = await fetch(`${this.baseUrl}/api/guardian/verify-and-dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    }

    async runScenarioBatch(scenarioMode = "critical", caseId = "CASE-01") {
      const res = await fetch(`${this.baseUrl}/api/scenarios/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: scenarioMode, case_id: caseId }),
      });
      return res.json();
    }

    connectLiveShield(onEvent) {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws/live-shield`;
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (typeof onEvent === "function") onEvent(data);
        } catch (err) {
          console.error("[TakeTheCallClient] WS parse error:", err);
        }
      };
      return this.ws;
    }

    sendTranscriptDelta(text, warrantB64 = null) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: "transcript_delta",
            text,
            warrant_b64: warrantB64,
          })
        );
      }
    }

    sendAudioStreamEnd() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "audio_stream_end" }));
      }
    }
  }

  global.TakeTheCallAudioRouter = TakeTheCallAudioRouter;
  global.TakeTheCallClient = TakeTheCallClient;
  global.takeTheCallClient = new TakeTheCallClient();
})(window);
