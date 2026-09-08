"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import {
  Mic,
  Upload,
  Sparkles,
  Download,
  Loader2,
  LogOut,
  Wallet,
  Play,
  Square,
  X,
  Bitcoin,
  CreditCard,
  Film
} from "lucide-react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase =
  supabaseUrl && supabaseAnon ? createClient(supabaseUrl, supabaseAnon) : null;

type UserVoice = {
  id: string;
  name: string;
  elevenlabs_voice_id: string;
  sample_url?: string | null;
  created_at?: string;
};

type Job = {
  id: string;
  title?: string;
  status: string;
  audio_url?: string;
  chars_count?: number;
  credits_charged?: number;
  created_at?: string;
  error_message?: string;
};

type Premade = { voice_id: string; name: string; category?: string; preview_url?: string | null };

function formatError(err: unknown): string {
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message && err.message !== "[object Object]") {
    return err.message;
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.error === "string") return o.error;
    if (typeof o.message === "string") return o.message;
    if (o.error != null) return formatError(o.error);
    try {
      const s = JSON.stringify(err);
      if (s && s !== "{}") return s;
    } catch {
      /* ignore */
    }
  }
  return "Request failed";
}

function stopVoicePreview(
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  setIsPlaying: (v: string | null) => void
) {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current = null;
  }
  setIsPlaying(null);
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const AUTH_WAVEFORM_BARS = Array.from({ length: 56 }, (_, i) =>
  Math.round(16 + 46 * Math.abs(Math.sin(i * 0.5 + 1)) * Math.abs(Math.cos(i * 0.17)))
);

const NOISE_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/></filter>
    <rect width="100%" height="100%" filter="url(#n)"/>
  </svg>`
)}`;

function WaveMark({ size = 30, animated = false }: { size?: number; animated?: boolean }) {
  const bars = [6, 14, 22, 14, 8, 18, 10];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--ink-2)" />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={4 + i * 3.6}
          y={16 - h / 2}
          width="2"
          height={h}
          rx="1"
          fill={i % 3 === 0 ? "var(--ember)" : "var(--signal)"}
          className={animated ? "wave-bar" : undefined}
          style={animated ? { animationDelay: `${i * 90}ms` } : undefined}
        />
      ))}
    </svg>
  );
}

export default function VoicePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [credits, setCredits] = useState(0);
  const [myVoices, setMyVoices] = useState<UserVoice[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [premade, setPremade] = useState<Premade[]>([]);
  const [selectedMyVoice, setSelectedMyVoice] = useState("");
  const [selectedPremade, setSelectedPremade] = useState("");
  const [script, setScript] = useState(
    "Introducing our new package. Book today and look your best for less."
  );
  const [title, setTitle] = useState("Ad voiceover");
  const [cloneName, setCloneName] = useState("My business voice");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [showBuy, setShowBuy] = useState(false);
  const [packages, setPackages] = useState<
    Array<{ id: string; credits: number; amountNgn: number; amountUsd: number; label: string }>
  >([]);
  const [buyBusy, setBuyBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const estCredits = useMemo(() => {
    const chars = script.trim().length;
    const per1k = 10;
    return Math.max(1, Math.ceil((chars / 1000) * per1k));
  }, [script]);

  const meterPct = Math.min(100, Math.round((estCredits / Math.max(credits, estCredits, 1)) * 100));
  const overBudget = estCredits > credits;

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshMe();
    void fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => setPremade(d.voices || []))
      .catch(() => {});
    void fetch("/api/packages")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages || []))
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined" || !session) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid")) {
      void refreshMe();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [session]);

  useEffect(() => {
    if (!recording) return;
    setRecordSeconds(0);
    const id = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  async function refreshMe() {
    if (!session?.access_token) return;
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCredits(Number(data.credits ?? 0));
      setMyVoices(data.voices || []);
      setJobs(data.jobs || []);
      if (!selectedMyVoice && data.voices?.[0]) {
        setSelectedMyVoice(data.voices[0].id);
      }
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError("Supabase is not configured");
      return;
    }
    if (authMode === "login") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    } else {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) setError(err.message);
      else setError("Check your email to confirm, or log in if confirmations are off.");
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "sample.webm", { type: "audio/webm" });
        setAudioFile(file);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError("Microphone permission denied or unavailable");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function handleClone() {
    if (!session?.access_token) return;
    if (!audioFile) {
      setError("Record or upload a voice sample first (30–60 seconds of clear speech)");
      return;
    }
    setCloneBusy(true);
    setError(null);
    setStatus("Cloning your voice…");
    try {
      const form = new FormData();
      form.append("audio", audioFile);
      form.append("name", cloneName);
      const res = await fetch("/api/clone", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(formatError(data));
      setStatus("Voice saved. You can generate ads with it now.");
      setAudioFile(null);
      await refreshMe();
      if (data.voice?.id) setSelectedMyVoice(data.voice.id);
    } catch (e) {
      setError(formatError(e));
      setStatus(null);
    } finally {
      setCloneBusy(false);
    }
  }

  async function handleGenerate() {
    if (!session?.access_token) return;
    if (!script.trim()) {
      setError("Write a script before generating");
      return;
    }
    if (!selectedMyVoice && !selectedPremade) {
      setError("Choose your cloned voice or a stock voice");
      return;
    }
    setBusy(true);
    setError(null);
    setResultUrl(null);
    setMergedVideoUrl(null);
    setStatus("Generating voiceover…");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          script,
          title,
          user_voice_id: selectedMyVoice || undefined,
          voice_id: !selectedMyVoice ? selectedPremade : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(formatError(data));
      setResultUrl(data.audio_url || null);
      setStatus(`Done — ${data.credits_charged ?? "?"} credits used`);
      await refreshMe();
    } catch (e) {
      setError(formatError(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleMerge() {
    if (!session?.access_token) return;
    if (!resultUrl) {
      setError("Generate a voiceover first, then attach it to a video");
      return;
    }
    if (!videoFile) {
      setError("Upload a video to merge with the voiceover");
      return;
    }
    setMergeBusy(true);
    setError(null);
    setStatus("Merging voiceover with video…");
    try {
      const form = new FormData();
      form.append("video", videoFile);
      form.append("audio_url", resultUrl);
      form.append("title", title);
      const res = await fetch("/api/merge", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(formatError(data));
      setMergedVideoUrl(data.video_url || null);
      setStatus(`Video ready — ${data.credits_charged ?? "?"} credits used`);
      await refreshMe();
    } catch (e) {
      setError(formatError(e));
      setStatus(null);
    } finally {
      setMergeBusy(false);
    }
  }

  function togglePlay(url: string) {
    if (isPlaying === url && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const a = new Audio(url);
    audioRef.current = a;
    setIsPlaying(url);
    a.onended = () => setIsPlaying(null);
    void a.play().catch(() => setIsPlaying(null));
  }

  async function buyPaystack(packageId: string) {
    if (!session?.access_token) return;
    setBuyBusy(true);
    try {
      const res = await fetch("/api/payments/paystack", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ package_id: packageId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(formatError(data));
      window.location.href = data.authorization_url;
    } catch (e) {
      setError(formatError(e));
      setBuyBusy(false);
    }
  }

  async function buyCrypto(packageId: string) {
    if (!session?.access_token) return;
    setBuyBusy(true);
    try {
      const res = await fetch("/api/payments/nowpayments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ package_id: packageId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(formatError(data));
      window.location.href = data.invoice_url;
    } catch (e) {
      setError(formatError(e));
      setBuyBusy(false);
    }
  }

  if (!supabaseUrl || !supabaseAnon) {
    return (
      <>
        <GlobalStyle />
        <main className="config-screen">
          <div className="panel" style={{ maxWidth: 460 }}>
            <WaveMark size={36} />
            <h1>Configuration needed</h1>
            <p>
              Copy <code>.env.example</code> to <code>.env.local</code> and set your Supabase and
              ElevenLabs keys. Run this app on port 3001 so it doesn&apos;t clash with Geeny Studio.
            </p>
          </div>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <GlobalStyle />
        <main className="auth-screen">
          <div className="auth-bg" aria-hidden="true">
            <div className="auth-glow auth-glow-ember" />
            <div className="auth-glow auth-glow-signal" />
            <div className="auth-noise" style={{ backgroundImage: `url("${NOISE_DATA_URI}")` }} />
            <div className="auth-waveform">
              {AUTH_WAVEFORM_BARS.map((h, i) => (
                <span
                  key={i}
                  className="auth-waveform-bar"
                  style={{ height: `${h}px`, animationDelay: `${(i % 12) * 90}ms` }}
                />
              ))}
            </div>
          </div>

          <div className="auth-content">
            <div className="auth-hero">
              <WaveMark size={40} animated />
              <h1>
                Say it once.
                <br />
                Run it everywhere.
              </h1>
              <p>
                Record thirty seconds of your voice, then turn any script into a ready-to-air ad
                voiceover — and attach it to your video in one step.
              </p>
            </div>
            <form className="panel auth-card" onSubmit={handleAuth}>
              <h2>{authMode === "login" ? "Log in" : "Create an account"}</h2>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {error && <p className="msg msg-error">{error}</p>}
              <div className="auth-actions">
                <button className="btn btn-primary" type="submit">
                  {authMode === "login" ? "Log in" : "Sign up"}
                </button>
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
                >
                  {authMode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
                </button>
              </div>
            </form>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <GlobalStyle />
      <main className="app">
        <header className="topbar">
          <div className="brand">
            <WaveMark size={32} />
            <span>Geeny Voice</span>
          </div>
          <div className="topbar-actions">
            <button type="button" className="wallet-chip" onClick={() => setShowBuy(true)}>
              <Wallet size={14} />
              <span className="mono">{credits}</span> credits
              <span className="wallet-chip-cta">Top up</span>
            </button>
            <button
              className="btn btn-icon"
              aria-label="Log out"
              onClick={() => void supabase?.auth.signOut()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="grid">
          <section className="panel studio">
            <div className="step">
              <div className="step-index">1</div>
              <div className="step-body">
                <h2>Save your voice</h2>
                <p className="hint">
                  Record 30–60 seconds of clear speech, or upload an MP3. This uses your clone
                  credits once — after that, generate as many scripts as you like.
                </p>

                <label className="field">
                  <span>Voice name</span>
                  <input
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    placeholder="e.g. My business voice"
                  />
                </label>

                <div className="record-row">
                  {!recording ? (
                    <button type="button" className="btn btn-outline" onClick={() => void startRecording()}>
                      <Mic size={16} /> Record sample
                    </button>
                  ) : (
                    <button type="button" className="btn btn-recording" onClick={stopRecording}>
                      <span className="rec-dot" />
                      Stop — {formatClock(recordSeconds)}
                    </button>
                  )}
                  <label className="btn btn-outline btn-upload">
                    <Upload size={16} /> Upload file
                    <input
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                {audioFile && (
                  <p className="file-chip">
                    <WaveMark size={16} /> {audioFile.name}
                  </p>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={cloneBusy || !audioFile}
                  onClick={() => void handleClone()}
                >
                  {cloneBusy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                  Save voice
                </button>
              </div>
            </div>

            <div className="divider" />

            <div className="step">
              <div className="step-index">2</div>
              <div className="step-body">
                <h2>Generate a voiceover</h2>

                <label className="field">
                  <span>Voice</span>
                  <div className="voice-pick-row">
                    <select
                      value={selectedMyVoice}
                      onChange={(e) => {
                        stopVoicePreview(audioRef, setIsPlaying);
                        setSelectedMyVoice(e.target.value);
                        if (e.target.value) setSelectedPremade("");
                      }}
                    >
                      <option value="">— Select your cloned voice —</option>
                      {myVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-icon"
                      title={
                        isPlaying?.startsWith("clone:")
                          ? "Stop preview"
                          : "Play your cloned voice sample"
                      }
                      disabled={
                        !selectedMyVoice ||
                        !myVoices.find((v) => v.id === selectedMyVoice)?.sample_url
                      }
                      onClick={() => {
                        const v = myVoices.find((x) => x.id === selectedMyVoice);
                        const url = v?.sample_url;
                        if (!url) {
                          setError(
                            "No sample saved for this voice. Re-clone and keep the sample to enable playback."
                          );
                          return;
                        }
                        const key = `clone:${selectedMyVoice}`;
                        if (isPlaying === key) {
                          stopVoicePreview(audioRef, setIsPlaying);
                          return;
                        }
                        stopVoicePreview(audioRef, setIsPlaying);
                        const a = new Audio(url);
                        audioRef.current = a;
                        setIsPlaying(key);
                        a.onended = () => setIsPlaying(null);
                        a.onerror = () => {
                          setIsPlaying(null);
                          setError("Could not play voice sample");
                        };
                        void a.play().catch(() => {
                          setIsPlaying(null);
                          setError("Could not play voice sample");
                        });
                      }}
                    >
                      {isPlaying?.startsWith("clone:") ? (
                        <Square size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                  </div>
                </label>

                <label className="field">
                  <span>Or a stock voice</span>
                  <div className="voice-pick-row">
                    <select
                      value={selectedPremade}
                      onChange={(e) => {
                        stopVoicePreview(audioRef, setIsPlaying);
                        setSelectedPremade(e.target.value);
                        if (e.target.value) setSelectedMyVoice("");
                      }}
                    >
                      <option value="">— No stock voice selected —</option>
                      {premade.map((v) => (
                        <option key={v.voice_id} value={v.voice_id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-icon"
                      title={
                        isPlaying?.startsWith("stock:")
                          ? "Stop preview"
                          : "Play stock voice sample"
                      }
                      disabled={
                        !selectedPremade ||
                        !premade.find((v) => v.voice_id === selectedPremade)?.preview_url
                      }
                      onClick={() => {
                        const v = premade.find((x) => x.voice_id === selectedPremade);
                        const url = v?.preview_url;
                        if (!url) {
                          setError("No preview available for this stock voice");
                          return;
                        }
                        const key = `stock:${selectedPremade}`;
                        if (isPlaying === key) {
                          stopVoicePreview(audioRef, setIsPlaying);
                          return;
                        }
                        stopVoicePreview(audioRef, setIsPlaying);
                        const a = new Audio(url);
                        audioRef.current = a;
                        setIsPlaying(key);
                        a.onended = () => setIsPlaying(null);
                        a.onerror = () => {
                          setIsPlaying(null);
                          setError("Could not play stock preview");
                        };
                        void a.play().catch(() => {
                          setIsPlaying(null);
                          setError("Could not play stock preview");
                        });
                      }}
                    >
                      {isPlaying?.startsWith("stock:") ? (
                        <Square size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                  </div>
                </label>

                <label className="field">
                  <span>Title</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ad voiceover" />
                </label>

                <label className="field">
                  <span>Script</span>
                  <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    rows={5}
                    placeholder="Write what you want the voice to say"
                  />
                </label>

                <div className="meter-row">
                  <div className="meter-track">
                    <div
                      className={`meter-fill ${overBudget ? "meter-fill-over" : ""}`}
                      style={{ width: `${meterPct}%` }}
                    />
                  </div>
                  <span className="mono meter-label">
                    ~{estCredits} cr · {script.trim().length} chars
                  </span>
                </div>
                {overBudget && (
                  <p className="msg msg-warn">
                    This script needs about {estCredits} credits — you have {credits}. Top up or
                    shorten the script.
                  </p>
                )}

                {error && <p className="msg msg-error">{error}</p>}
                {status && <p className="msg msg-success">{status}</p>}

                <button
                  className="btn btn-primary btn-generate"
                  disabled={busy}
                  onClick={() => void handleGenerate()}
                >
                  {busy ? (
                    <>
                      <Loader2 size={18} className="spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} /> Generate voiceover
                    </>
                  )}
                </button>

                {resultUrl && (
                  <div className="result-row">
                    <button type="button" className="btn btn-outline" onClick={() => togglePlay(resultUrl)}>
                      {isPlaying === resultUrl ? <Square size={16} /> : <Play size={16} />} Preview
                    </button>
                    <a className="btn btn-primary" href={resultUrl} download target="_blank" rel="noreferrer">
                      <Download size={16} /> Download MP3
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="divider" />

            <div className="step">
              <div className="step-index">3</div>
              <div className="step-body">
                <h2>Attach to your video</h2>
                <p className="hint">
                  Optional. Upload a product or promo clip — we replace the audio with your new
                  voiceover and export one MP4. No timeline editing. (Uses merge credits.)
                </p>

                <label className="btn btn-outline btn-upload" style={{ marginTop: 12 }}>
                  <Film size={16} /> {videoFile ? "Change video" : "Upload video"}
                  <input
                    type="file"
                    accept="video/*"
                    hidden
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  />
                </label>
                {videoFile && (
                  <p className="file-chip">
                    <Film size={14} /> {videoFile.name}
                  </p>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={mergeBusy || !resultUrl || !videoFile}
                  onClick={() => void handleMerge()}
                  style={{ marginTop: 14 }}
                >
                  {mergeBusy ? (
                    <>
                      <Loader2 size={16} className="spin" /> Merging…
                    </>
                  ) : (
                    <>
                      <Film size={16} /> Merge voiceover + video
                    </>
                  )}
                </button>

                {!resultUrl && (
                  <p className="hint" style={{ marginTop: 10 }}>
                    Generate a voiceover in step 2 first.
                  </p>
                )}

                {mergedVideoUrl && (
                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    <video
                      src={mergedVideoUrl}
                      controls
                      style={{ width: "100%", borderRadius: 12, background: "#000" }}
                    />
                    <a
                      className="btn btn-primary"
                      href={mergedVideoUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download size={16} /> Download MP4
                    </a>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="panel library">
            <h2>Your voiceovers</h2>
            {jobs.length === 0 ? (
              <div className="empty">
                <WaveMark size={28} />
                <p>Nothing here yet. Generate your first voiceover to see it appear in this list.</p>
              </div>
            ) : (
              <ul className="job-list">
                {jobs.map((j) => (
                  <li key={j.id} className="job-item">
                    <div className="job-main">
                      <strong>{j.title || "Voiceover"}</strong>
                      <span className="job-meta mono">
                        {j.status}
                        {j.chars_count != null ? ` · ${j.chars_count} chars` : ""}
                        {j.credits_charged != null ? ` · ${j.credits_charged} cr` : ""}
                      </span>
                    </div>
                    {j.audio_url && (
                      <div className="job-actions">
                        {!j.audio_url.endsWith(".mp4") && !j.title?.includes("(video)") ? (
                          <button
                            type="button"
                            className="btn btn-icon"
                            aria-label={isPlaying === j.audio_url ? "Pause" : "Play"}
                            onClick={() => togglePlay(j.audio_url!)}
                          >
                            {isPlaying === j.audio_url ? <Square size={14} /> : <Play size={14} />}
                          </button>
                        ) : null}
                        <a href={j.audio_url} download className="job-download">
                          <Download size={14} /> Download
                        </a>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {showBuy && (
          <div className="overlay" onClick={() => !buyBusy && setShowBuy(false)}>
            <div className="panel buy-modal" onClick={(e) => e.stopPropagation()}>
              <div className="buy-modal-head">
                <h2>Top up credits</h2>
                <button
                  className="btn btn-icon"
                  aria-label="Close"
                  onClick={() => !buyBusy && setShowBuy(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <p className="hint">
                Credits are shared with Geeny Studio when it uses the same account.
              </p>
              <div className="package-list">
                {packages.map((p) => (
                  <div key={p.id} className="package-card">
                    <div className="package-head">
                      <strong>{p.label}</strong>
                      <span className="mono package-price">
                        ₦{p.amountNgn.toLocaleString()} · ${p.amountUsd}
                      </span>
                    </div>
                    <div className="package-actions">
                      <button
                        className="btn btn-primary"
                        disabled={buyBusy}
                        onClick={() => void buyPaystack(p.id)}
                      >
                        <CreditCard size={14} /> Paystack
                      </button>
                      <button
                        className="btn btn-outline"
                        disabled={buyBusy}
                        onClick={() => void buyCrypto(p.id)}
                      >
                        <Bitcoin size={14} /> Crypto
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function GlobalStyle() {
  return (
    <style jsx global>{`
      @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap");

      :root {
        --ink: #14151c;
        --ink-2: #1b1d26;
        --panel: #1c1e28;
        --panel-2: #262832;
        --line: #34374280;
        --ember: #f2a93b;
        --ember-dim: rgba(242, 169, 59, 0.14);
        --signal: #59d9c4;
        --signal-dim: rgba(89, 217, 196, 0.14);
        --coral: #ff6a58;
        --coral-dim: rgba(255, 106, 88, 0.14);
        --paper: #f3f1ec;
        --muted: #9a9db0;
        --muted-2: #6c6f80;
        --font-display: "Space Grotesk", sans-serif;
        --font-body: "Inter", sans-serif;
        --font-mono: "IBM Plex Mono", monospace;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        background: var(--ink);
        color: var(--paper);
        font-family: var(--font-body);
      }

      h1,
      h2 {
        font-family: var(--font-display);
        letter-spacing: -0.01em;
        margin: 0;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .mono {
        font-family: var(--font-mono);
      }

      input,
      select,
      textarea {
        width: 100%;
        background: var(--panel-2);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px 12px;
        color: var(--paper);
        font-family: var(--font-body);
        font-size: 14px;
      }

      textarea {
        resize: vertical;
        min-height: 96px;
      }

      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible,
      button:focus-visible,
      a:focus-visible {
        outline: 2px solid var(--signal);
        outline-offset: 2px;
      }

      .field {
        display: grid;
        gap: 6px;
        margin-top: 12px;
      }
      .field > span {
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 22px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: 10px;
        border: 1px solid transparent;
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 14px;
        padding: 10px 16px;
        cursor: pointer;
        transition: filter 0.15s ease, transform 0.1s ease;
      }
      .btn:active {
        transform: translateY(1px);
      }
      .btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .btn-primary {
        background: var(--ember);
        color: #201200;
      }
      .btn-primary:hover:not(:disabled) {
        filter: brightness(1.06);
      }
      .btn-outline {
        background: transparent;
        border-color: var(--line);
        color: var(--paper);
      }
      .btn-outline:hover:not(:disabled) {
        border-color: var(--signal);
      }
      .btn-text {
        background: transparent;
        color: var(--muted);
        padding: 8px 4px;
      }
      .btn-text:hover {
        color: var(--paper);
      }
      .btn-icon {
        background: var(--panel-2);
        border: 1px solid var(--line);
        color: var(--paper);
        width: 38px;
        height: 38px;
        padding: 0;
        border-radius: 10px;
      }
      .btn-recording {
        background: var(--coral-dim);
        border: 1px solid var(--coral);
        color: var(--coral);
      }
      .btn-upload {
        position: relative;
      }
      .btn-generate {
        width: 100%;
        margin-top: 16px;
        padding: 13px 16px;
      }

      .rec-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--coral);
      }
      @media (prefers-reduced-motion: no-preference) {
        .btn-recording .rec-dot {
          animation: pulse 1.2s ease-in-out infinite;
        }
        .wave-bar {
          animation: bar 1s ease-in-out infinite;
        }
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.25;
        }
      }
      @keyframes bar {
        0%,
        100% {
          transform: scaleY(1);
        }
        50% {
          transform: scaleY(0.55);
        }
      }
      .spin {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .msg {
        font-size: 13px;
        margin-top: 10px;
        white-space: pre-wrap;
      }
      .msg-error {
        color: var(--coral);
      }
      .msg-success {
        color: var(--signal);
      }
      .msg-warn {
        color: var(--ember);
      }

      .config-screen {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .config-screen h1 {
        font-size: 22px;
        margin: 14px 0 6px;
      }

      .auth-screen {
        position: relative;
        min-height: 100vh;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 24px;
        background: radial-gradient(120% 100% at 50% 0%, #191b25 0%, var(--ink) 60%);
      }
      .auth-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
      }
      .auth-glow {
        position: absolute;
        width: 620px;
        height: 620px;
        border-radius: 50%;
        filter: blur(70px);
      }
      .auth-glow-ember {
        top: -220px;
        left: -160px;
        background: radial-gradient(circle, var(--ember-dim) 0%, transparent 70%);
      }
      .auth-glow-signal {
        bottom: -260px;
        right: -180px;
        background: radial-gradient(circle, var(--signal-dim) 0%, transparent 70%);
      }
      .auth-noise {
        position: absolute;
        inset: 0;
        opacity: 0.05;
        mix-blend-mode: overlay;
      }
      .auth-waveform {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 130px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 5px;
        padding: 0 24px;
        opacity: 0.4;
        mask-image: linear-gradient(to top, black, transparent);
      }
      .auth-waveform-bar {
        width: 4px;
        border-radius: 2px;
        background: linear-gradient(to top, var(--ember), var(--signal));
      }
      @media (prefers-reduced-motion: no-preference) {
        .auth-waveform-bar {
          animation: bar 2.6s ease-in-out infinite;
        }
      }

      .auth-content {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 40px;
        align-items: center;
        max-width: 1040px;
        width: 100%;
      }
      .auth-hero h1 {
        font-size: 40px;
        line-height: 1.12;
        margin: 18px 0 14px;
      }
      .auth-hero p {
        font-size: 16px;
        max-width: 40ch;
      }
      .auth-card {
        backdrop-filter: blur(6px);
        background: rgba(28, 30, 40, 0.86);
        padding: 32px 28px;
        display: grid;
        gap: 20px;
      }
      .auth-card h2 {
        font-size: 20px;
      }
      .auth-card .field {
        margin-top: 0;
        gap: 8px;
      }
      .auth-card .msg {
        margin-top: 0;
      }
      .auth-actions {
        display: grid;
        gap: 10px;
        margin-top: 4px;
      }
      @media (max-width: 820px) {
        .auth-content {
          grid-template-columns: 1fr;
        }
        .auth-screen {
          padding-top: 56px;
        }
        .auth-hero h1 {
          font-size: 30px;
        }
        .auth-waveform {
          height: 90px;
        }
      }

      .app {
        max-width: 1040px;
        margin: 0 auto;
        padding: 22px 20px 60px;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 16px;
      }
      .topbar-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .wallet-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--ember-dim);
        border: 1px solid var(--ember);
        color: var(--ember);
        border-radius: 999px;
        padding: 7px 8px 7px 14px;
        font-family: var(--font-body);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .wallet-chip-cta {
        background: var(--ember);
        color: #201200;
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 12px;
        margin-left: 4px;
      }

      .grid {
        display: grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 20px;
        align-items: start;
      }
      @media (max-width: 820px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }

      .studio h2 {
        font-size: 17px;
      }
      .step {
        display: flex;
        gap: 14px;
      }
      .step-index {
        flex: none;
        width: 26px;
        height: 26px;
        border-radius: 8px;
        background: var(--signal-dim);
        color: var(--signal);
        display: grid;
        place-items: center;
        font-family: var(--font-mono);
        font-size: 13px;
        margin-top: 2px;
      }
      .step-body {
        flex: 1;
        min-width: 0;
      }
      .hint {
        font-size: 13px;
        margin-top: 4px;
      }
      .divider {
        height: 1px;
        background: var(--line);
        margin: 22px 0;
      }
      .record-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      .file-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--muted);
        margin-top: 10px;
      }
      .studio .btn-primary {
        margin-top: 14px;
      }

      .meter-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 12px;
      }
      .meter-track {
        flex: 1;
        height: 6px;
        border-radius: 999px;
        background: var(--panel-2);
        overflow: hidden;
      }
      .meter-fill {
        height: 100%;
        background: var(--signal);
        border-radius: 999px;
        transition: width 0.2s ease;
      }
      .meter-fill-over {
        background: var(--coral);
      }
      .meter-label {
        font-size: 12px;
        color: var(--muted);
        white-space: nowrap;
      }

      .voice-pick-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .voice-pick-row select {
        flex: 1;
      }
      .result-row {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .library h2 {
        font-size: 17px;
        margin-bottom: 14px;
      }
      .empty {
        display: grid;
        justify-items: center;
        gap: 10px;
        text-align: center;
        padding: 30px 10px;
      }
      .empty p {
        font-size: 13px;
        max-width: 26ch;
      }
      .job-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      .job-item {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .job-main {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .job-main strong {
        font-size: 14px;
        font-family: var(--font-display);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .job-meta {
        font-size: 11px;
        color: var(--muted-2);
      }
      .job-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
      }
      .job-download {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--signal);
        font-size: 12px;
        text-decoration: none;
      }

      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(10, 10, 14, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
      }
      .buy-modal {
        width: 100%;
        max-width: 420px;
      }
      .buy-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .buy-modal-head h2 {
        font-size: 18px;
      }
      .buy-modal .hint {
        margin-bottom: 16px;
      }
      .package-list {
        display: grid;
        gap: 10px;
      }
      .package-card {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 14px;
        display: grid;
        gap: 10px;
        background: var(--panel-2);
      }
      .package-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .package-price {
        color: var(--ember);
        font-size: 13px;
      }
      .package-actions {
        display: flex;
        gap: 8px;
      }
      .package-actions .btn {
        flex: 1;
        font-size: 13px;
        padding: 9px 10px;
      }
    `}</style>
  );
}
