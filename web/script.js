/* ==========================================================================
   KisaanAI Pro - script.js
   Vanilla JavaScript, no dependencies.

   BACKEND CONTRACT (used when an API base URL is set under "Backend")
   -------------------------------------------------------------------
   POST {API_URL}/diagnose        multipart/form-data
       image       leaf photo file                (required)
       audio       voice note file                (optional if typed_text is sent)
       typed_text  typed description              (optional)
       district    e.g. "Lahore"                  (required)

   Response: application/json  (or application/x-ndjson for live progress)
       {
         "heard":     { transcript, crop, symptoms[], duration_days, district, urgency, question },
         "diagnosis": { crop, disease, confidence (0..1), severity, visual_evidence[],
                        alternatives[], needs_follow_up, follow_up_question },
         "research":  { passages: [ { source, text, score } ] },
         "verified":  { approved: [ { action, active_ingredient, dosage, brand_examples[],
                                      price_note, source_ids[] } ],
                        rejected: [ { index, reason } ],
                        spray_warning, safety_lines[], weather: { ok, rain_prob_today,
                        rain_prob_tomorrow, max_temp_c, max_wind_kmh } },
         "advice":    { script_urdu, summary_english },
         "audio_url" | "audio_base64" (+ optional "audio_mime"),
         "trace":     [ { agent, seconds, output } ]
       }
   This is the same shape that run_pipeline() in agents.py returns.

   NDJSON mode: one JSON object per line, either
       {"type":"step","agent":"2 Diagnosis","seconds":1.1}
       {"type":"result","data":{ ...the object above... }}
       {"type":"error","message":"..."}

   With no API URL the interface runs in demo mode and shows clearly
   labelled sample data. Nothing is sent anywhere in demo mode.
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Config
   * ------------------------------------------------------------------ */
  const CONFIG = {
    ENDPOINT: '/diagnose',
    MAX_IMAGE_MB: 10,
    MAX_AUDIO_MB: 20,
    MAX_RECORD_SECONDS: 60,
    REQUEST_TIMEOUT_MS: 120000,
    STORAGE_KEY: 'kisaanai.apiUrl',
    CONFIDENCE_THRESHOLD: 60,
  };

  const AGENTS = [
    { key: 'listener',  name: 'Listener',  role: 'Urdu speech to query', icon: 'wave' },
    { key: 'diagnosis', name: 'Diagnosis', role: 'Vision analysis',      icon: 'eye' },
    { key: 'research',  name: 'Research',  role: 'Grounded local sources', icon: 'book' },
    { key: 'verifier',  name: 'Verifier',  role: 'Safety and weather',   icon: 'shield' },
    { key: 'advisor',   name: 'Advisor',   role: 'Urdu voice reply',     icon: 'speaker' },
  ];
  const TRACE_COLORS = ['#10b981', '#3b82f6', '#2dd4bf', '#818cf8', '#38bdf8'];

  const DEFAULT_SAFETY = [
    'Wear gloves, a mask and long sleeves while spraying; wash hands and clothes afterwards.',
    'Keep pesticides away from children, food and animals; never reuse empty containers.',
    'Always read the label and follow the dose written on the pack.',
    'For severe or spreading disease, contact your local agriculture extension officer.',
  ];

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const icon = (name, cls = '') =>
    `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const escapeLite = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const formatBytes = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  };

  const formatTime = (s) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const toPct = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n <= 1 ? n * 100 : n)));
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };

  function agentIndex(label) {
    const s = String(label || '').toLowerCase();
    return AGENTS.findIndex((a) => s.includes(a.key));
  }

  /* ------------------------------------------------------------------ *
   * State and element refs
   * ------------------------------------------------------------------ */
  const state = {
    photo: null,
    photoUrl: null,
    audioBlob: null,
    audioName: '',
    audioSource: '',      // 'record' | 'upload'
    audioUrl: null,
    text: '',
    district: 'Lahore',
    running: false,
    result: null,
    apiUrl: '',
    traceAutoOpened: false,
  };

  const els = {};
  [
    'modePill', 'modeLabel', 'settingsBtn', 'settingsDialog', 'apiUrlInput',
    'dropzone', 'photoInput', 'cameraInput', 'dzIdle', 'dzPreview', 'photoPreview', 'photoName', 'photoSize',
    'photoRemove', 'browseBtn', 'cameraBtn',
    'voiceTabs', 'recorder', 'recBtn', 'recIcon', 'recTimer', 'recStatus', 'waveCanvas',
    'recPlaybackWrap', 'recPlayback', 'recClear',
    'audioDrop', 'audioInput', 'audioFileTitle', 'audioFileMeta', 'uploadPlaybackWrap', 'uploadPlayback', 'audioClear',
    'typedText', 'voiceSource', 'districtSelect',
    'runBtn', 'runBtnLabel', 'resetBtn', 'reqPhoto', 'reqVoice',
    'stepper', 'pipelineState', 'viewEmpty', 'viewRunning', 'viewResult', 'runningText', 'demoBadge',
    'heardTranscript', 'heardChips',
    'mCrop', 'mCropSub', 'mDisease', 'mDiseaseSub', 'mConfValue', 'mConfBar', 'mConfFill', 'mConfSub', 'mSeverity', 'mSeveritySub',
    'followupAlert', 'followupText', 'sprayAlert', 'sprayTitle', 'sprayText', 'weatherChips',
    'blockedBadge', 'treatWrap', 'treatBody', 'treatEmpty', 'safetyList',
    'audioConsole', 'playBtn', 'playIcon', 'seek', 'curTime', 'durTime', 'speedBtn', 'downloadLink', 'audioEl', 'audioNote',
    'urduText', 'urduSummary',
    'traceToggle', 'tracePanel', 'traceCount', 'traceTotal', 'traceBar', 'traceLegend', 'traceList', 'copyTrace', 'expandAll',
    'toasts',
  ].forEach((id) => { els[id] = $(id); });

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */
  function toast(message, type = 'info', ms = 5000) {
    while (els.toasts.children.length >= 4) els.toasts.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.type = type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info') + `<span>${escapeHtml(message)}</span>`;
    els.toasts.appendChild(el);
    const kill = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 260); };
    const timer = setTimeout(kill, ms);
    el.addEventListener('click', () => { clearTimeout(timer); kill(); });
  }

  /* ------------------------------------------------------------------ *
   * Automatic right-to-left handling for Urdu text
   * ------------------------------------------------------------------ */
  const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
  const LATIN_RE = /[A-Za-z]/g;

  function detectDir(text) {
    const a = (String(text).match(ARABIC_RE) || []).length;
    const l = (String(text).match(LATIN_RE) || []).length;
    if (!a && !l) return null;
    return a >= l ? 'rtl' : 'ltr';
  }

  function applyDir(el, text) {
    const d = detectDir(text ?? ('value' in el ? el.value : el.textContent));
    if (d === null) {
      el.setAttribute('dir', 'auto');
      el.classList.remove('is-rtl', 'is-ltr');
      return;
    }
    el.setAttribute('dir', d);
    el.classList.toggle('is-rtl', d === 'rtl');
    el.classList.toggle('is-ltr', d === 'ltr');
  }

  function applyAutoRtl(root = document) {
    root.querySelectorAll('[data-autodir]').forEach((el) => applyDir(el));
  }

  /* ------------------------------------------------------------------ *
   * Backend setting and mode pill
   * ------------------------------------------------------------------ */
  function initApiUrl() {
    const fromQuery = new URLSearchParams(location.search).get('api');
    state.apiUrl = (fromQuery || storage.get(CONFIG.STORAGE_KEY) || '').trim().replace(/\/+$/, '');
    updateMode();
    if (!state.apiUrl && /^https?:$/.test(location.protocol)) {   // served by the KisaanAI backend itself: go live
      fetch('/health').then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (j && j.app === 'kisaanai') { state.apiUrl = location.origin; updateMode(); }
      }).catch(() => {});
    }
  }

  function updateMode() {
    const live = !!state.apiUrl;
    els.modePill.dataset.mode = live ? 'live' : 'demo';
    let label = 'Demo mode';
    if (live) {
      try { label = `Live: ${new URL(state.apiUrl).host}`; } catch { label = 'Live backend'; }
    }
    els.modeLabel.textContent = label;
    els.modePill.title = live
      ? 'Diagnoses are sent to your backend.'
      : 'No backend is set. Sample data is shown. Open Backend to connect your API.';
  }

  function bindSettings() {
    // If the control trigger elements are completely omitted from the HTML node layout tree templates, bypass
    if (els.settingsBtn && els.apiUrlInput && els.settingsDialog) {
      els.settingsBtn.addEventListener('click', () => {
        els.apiUrlInput.value = state.apiUrl;
        els.settingsDialog.returnValue = '';
        els.settingsDialog.showModal();
        els.apiUrlInput.focus();
      });
    }
    
    if (els.settingsDialog) {
      els.settingsDialog.addEventListener('close', () => {
        if (els.settingsDialog.returnValue !== 'save') return;
        if (els.apiUrlInput) {
          state.apiUrl = els.apiUrlInput.value.trim().replace(/\/+$/, '');
          storage.set(CONFIG.STORAGE_KEY, state.apiUrl);
          updateMode();
          toast(state.apiUrl ? 'Backend saved. Diagnoses now run for real.' : 'Backend cleared. Sample data will be shown.', 'success');
        }
      });
    }
  }


  /* ------------------------------------------------------------------ *
   * Drag and drop helper
   * ------------------------------------------------------------------ */
  function bindDrop(el, onFiles) {
    let depth = 0;
    el.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; el.classList.add('is-dragover'); });
    el.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    el.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove('is-dragover'); });
    el.addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0; el.classList.remove('is-dragover');
      onFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []));
    });
  }

  function clickOnKey(el) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  }

  /* ------------------------------------------------------------------ *
   * Photo
   * ------------------------------------------------------------------ */
  function setPhoto(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast('That file is not a supported image. Use a JPG, PNG or WebP photo.', 'error');
      return;
    }
    if (file.size > CONFIG.MAX_IMAGE_MB * 1048576) {
      toast(`This photo is ${formatBytes(file.size)}. Choose one under ${CONFIG.MAX_IMAGE_MB} MB.`, 'error');
      return;
    }
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    state.photo = file;
    state.photoUrl = URL.createObjectURL(file);
    els.photoPreview.src = state.photoUrl;
    els.photoName.textContent = file.name || 'Pasted image';
    els.photoSize.textContent = formatBytes(file.size);
    els.dzIdle.hidden = true;
    els.dzPreview.hidden = false;
    els.dropzone.classList.add('has-file');
    els.dropzone.setAttribute('aria-label', `Leaf photo added: ${file.name || 'pasted image'}. Press Enter to choose a different file.`);
    updateCta();
  }

  function clearPhoto() {
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    state.photo = null;
    state.photoUrl = null;
    els.photoPreview.removeAttribute('src');
    els.photoInput.value = '';
    els.cameraInput.value = '';
    els.dzIdle.hidden = false;
    els.dzPreview.hidden = true;
    els.dropzone.classList.remove('has-file');
    els.dropzone.setAttribute('aria-label', 'Add a leaf photo. Press Enter to browse files.');
    updateCta();
  }

  function bindPhoto() {
    els.dropzone.addEventListener('click', (e) => {
      if (e.target.closest('#photoRemove')) return;
      if (!state.photo) els.photoInput.click();
    });
    clickOnKey(els.dropzone);
    els.dropzone.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.photo) clearPhoto();
    });
    els.browseBtn.addEventListener('click', () => els.photoInput.click());
    els.cameraBtn.addEventListener('click', () => els.cameraInput.click());
    els.photoInput.addEventListener('change', () => setPhoto(els.photoInput.files[0]));
    els.cameraInput.addEventListener('change', () => setPhoto(els.cameraInput.files[0]));
    els.photoRemove.addEventListener('click', (e) => { e.stopPropagation(); clearPhoto(); });
    bindDrop(els.dropzone, (files) => setPhoto(files.find((f) => f.type.startsWith('image/')) || files[0]));

    document.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) { setPhoto(f); e.preventDefault(); return; }
        }
      }
    });

    // Stop the browser from navigating away when a file misses a drop target.
    ['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => e.preventDefault()));
  }

  /* ------------------------------------------------------------------ *
   * Voice: tabs
   * ------------------------------------------------------------------ */
  function selectPane(name, focus = false) {
    const tabs = Array.from(els.voiceTabs.querySelectorAll('[role="tab"]'));
    tabs.forEach((t) => {
      const on = t.dataset.pane === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    });
  }

  function bindTabs() {
    const tabs = Array.from(els.voiceTabs.querySelectorAll('[role="tab"]'));
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectPane(t.dataset.pane));
      t.addEventListener('keydown', (e) => {
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') j = 0;
        if (e.key === 'End') j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); selectPane(tabs[j].dataset.pane, true); }
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Voice: recorder with live waveform
   * ------------------------------------------------------------------ */
  const rec = {
    mr: null, stream: null, chunks: [], ctx: null, analyser: null,
    raf: 0, timer: 0, startedAt: 0, active: false, levels: [], lastPush: 0, mime: '',
  };
  const BAR_COUNT = 48;
  const idleLevels = () => Array.from({ length: BAR_COUNT }, (_, i) => 0.08 + 0.06 * Math.abs(Math.sin(i * 0.7)));

  function sizeCanvas() {
    const c = els.waveCanvas;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
  }

  function drawBars(levels, active) {
    const c = els.waveCanvas;
    const g = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const n = levels.length;
    const gap = 3 * dpr;
    const bw = Math.max(2, (w - gap * (n - 1)) / n);
    if (active) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#34d399');
      grad.addColorStop(1, '#059669');
      g.fillStyle = grad;
    } else {
      g.fillStyle = 'rgba(148,163,184,0.35)';
    }
    for (let i = 0; i < n; i++) {
      const bh = Math.max(4 * dpr, levels[i] * h);
      const x = i * (bw + gap);
      const y = (h - bh) / 2;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, bw, bh, bw / 2); else g.rect(x, y, bw, bh);
      g.fill();
    }
  }

  function pickMime() {
    if (!window.MediaRecorder) return '';
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      .find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  function setRecUi(recording) {
    els.recorder.classList.toggle('is-recording', recording);
    els.recBtn.setAttribute('aria-label', recording ? 'Stop recording' : 'Start recording');
    els.recIcon.querySelector('use').setAttribute('href', recording ? '#i-stop' : '#i-mic');
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      toast('Recording is not supported in this browser, or the page is not secure (HTTPS). Upload an audio file or type instead.', 'error', 7000);
      return;
    }
    try {
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      toast(err && err.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in your browser settings, or upload an audio file instead.'
        : 'No microphone could be opened. Upload an audio file or type instead.', 'error', 7000);
      return;
    }

    rec.mime = pickMime();
    rec.chunks = [];
    rec.mr = new MediaRecorder(rec.stream, rec.mime ? { mimeType: rec.mime } : undefined);
    rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    rec.mr.onstop = onRecordingStop;
    rec.mr.start(250);

    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      rec.ctx = new AC();
      const src = rec.ctx.createMediaStreamSource(rec.stream);
      rec.analyser = rec.ctx.createAnalyser();
      rec.analyser.fftSize = 512;
      src.connect(rec.analyser);
    }

    rec.active = true;
    rec.levels = idleLevels().map(() => 0.04);
    rec.startedAt = performance.now();
    rec.lastPush = 0;
    setRecUi(true);
    els.recStatus.textContent = 'Recording. Tap again to stop.';
    els.recTimer.textContent = '0:00';
    rec.timer = setInterval(() => {
      const s = (performance.now() - rec.startedAt) / 1000;
      els.recTimer.textContent = formatTime(s);
      if (s >= CONFIG.MAX_RECORD_SECONDS) stopRecording();
    }, 200);
    drawLoop();
  }

  function drawLoop(ts = 0) {
    if (!rec.active) return;
    if (rec.analyser && ts - rec.lastPush > 55) {
      const buf = new Uint8Array(rec.analyser.fftSize);
      rec.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.6);
      rec.levels.push(Math.max(0.05, level));
      rec.levels.shift();
      rec.lastPush = ts;
    }
    drawBars(rec.levels, true);
    rec.raf = requestAnimationFrame(drawLoop);
  }

  function stopRecording() {
    if (!rec.active) return;
    rec.active = false;
    cancelAnimationFrame(rec.raf);
    clearInterval(rec.timer);
    try { if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop(); } catch { /* already stopped */ }
    if (rec.stream) rec.stream.getTracks().forEach((t) => t.stop());
    if (rec.ctx) { rec.ctx.close().catch(() => {}); rec.ctx = null; }
    setRecUi(false);
    drawBars(idleLevels(), false);
  }

  function onRecordingStop() {
    const type = (rec.mr && rec.mr.mimeType) || rec.mime || 'audio/webm';
    const blob = new Blob(rec.chunks, { type });
    if (!blob.size) {
      els.recStatus.textContent = 'Nothing was recorded. Tap the microphone and try again.';
      return;
    }
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    setAudio(blob, `voice-note.${ext}`, 'record');
    els.recStatus.textContent = 'Recording saved. Play it back or record again.';
  }

  function bindRecorder() {
    els.recBtn.addEventListener('click', () => (rec.active ? stopRecording() : startRecording()));
    els.recClear.addEventListener('click', () => { clearAudio(); els.recStatus.textContent = 'Tap the microphone and start speaking'; els.recTimer.textContent = '0:00'; });
    sizeCanvas();
    drawBars(idleLevels(), false);
    window.addEventListener('resize', () => { sizeCanvas(); if (!rec.active) drawBars(idleLevels(), false); });
  }

  /* ------------------------------------------------------------------ *
   * Voice: upload, text, shared audio state
   * ------------------------------------------------------------------ */
  function setAudio(blob, name, source) {
    clearAudio(true);
    state.audioBlob = blob;
    state.audioName = name;
    state.audioSource = source;
    state.audioUrl = URL.createObjectURL(blob);
    if (source === 'record') {
      els.recPlayback.src = state.audioUrl;
      els.recPlaybackWrap.hidden = false;
    } else {
      els.uploadPlayback.src = state.audioUrl;
      els.uploadPlaybackWrap.hidden = false;
    }
    updateCta();
  }

  function clearAudio(silent = false) {
    if (rec.active) stopRecording();
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioBlob = null;
    state.audioName = '';
    state.audioSource = '';
    state.audioUrl = null;
    [els.recPlayback, els.uploadPlayback].forEach((a) => { a.pause(); a.removeAttribute('src'); a.load(); });
    els.recPlaybackWrap.hidden = true;
    els.uploadPlaybackWrap.hidden = true;
    els.audioInput.value = '';
    els.audioFileTitle.textContent = 'Drop an audio file or choose one';
    els.audioFileMeta.textContent = 'MP3, WAV, M4A, OGG or WebM, up to 20 MB';
    if (!silent) updateCta();
  }

  function handleAudioFile(file) {
    if (!file) return;
    const okType = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|opus|webm|flac|aac)$/i.test(file.name);
    if (!okType) { toast('That file is not an audio file. Use MP3, WAV, M4A, OGG or WebM.', 'error'); return; }
    if (file.size > CONFIG.MAX_AUDIO_MB * 1048576) {
      toast(`This audio is ${formatBytes(file.size)}. Choose one under ${CONFIG.MAX_AUDIO_MB} MB.`, 'error');
      return;
    }
    setAudio(file, file.name, 'upload');
    els.audioFileTitle.textContent = file.name;
    els.audioFileMeta.textContent = formatBytes(file.size);
  }

  function bindUploadAndText() {
    els.audioDrop.addEventListener('click', () => els.audioInput.click());
    clickOnKey(els.audioDrop);
    els.audioInput.addEventListener('change', () => handleAudioFile(els.audioInput.files[0]));
    bindDrop(els.audioDrop, (files) => handleAudioFile(files[0]));
    els.audioClear.addEventListener('click', () => clearAudio());

    els.typedText.addEventListener('input', () => {
      state.text = els.typedText.value;
      applyDir(els.typedText);
      updateCta();
    });
    els.districtSelect.addEventListener('change', () => { state.district = els.districtSelect.value; });
  }

  /* ------------------------------------------------------------------ *
   * Call to action and checklist
   * ------------------------------------------------------------------ */
  function updateCta() {
    const hasPhoto = !!state.photo;
    const hasVoice = !!state.audioBlob || state.text.trim().length > 0;
    els.reqPhoto.classList.toggle('is-done', hasPhoto);
    els.reqVoice.classList.toggle('is-done', hasVoice);
    els.runBtn.disabled = !(hasPhoto && hasVoice) || state.running;

    if (state.audioBlob) {
      els.voiceSource.hidden = false;
      els.voiceSource.innerHTML = icon('check') + `<span>${state.audioSource === 'record' ? 'Using your recorded voice note' : `Using ${escapeHtml(state.audioName)}`}.</span>`;
    } else if (state.text.trim()) {
      els.voiceSource.hidden = false;
      els.voiceSource.innerHTML = icon('check') + '<span>Using your typed description.</span>';
    } else {
      els.voiceSource.hidden = true;
    }

    if (!state.running && !state.result) {
      els.pipelineState.textContent = hasPhoto && hasVoice ? 'Ready to run' : 'Waiting for input';
    }
  }

  function setBusy(busy) {
    els.runBtn.classList.toggle('is-busy', busy);
    els.runBtnLabel.textContent = busy ? 'Agents are working' : 'Diagnose crop';
    els.runBtn.querySelector('use').setAttribute('href', busy ? '#i-refresh' : '#i-leaf');
    els.resetBtn.disabled = busy;
    updateCta();
  }

  /* ------------------------------------------------------------------ *
   * Agent pipeline (stepper)
   * ------------------------------------------------------------------ */
  const Stepper = {
    build() {
      els.stepper.innerHTML = AGENTS.map((a) => `
        <li class="step" data-state="idle">
          <span class="step-node">${icon(a.icon)}</span>
          <span class="step-name">${a.name}</span>
          <span class="step-role">${a.role}</span>
          <span class="step-time"></span>
        </li>`).join('');
    },
    steps() { return Array.from(els.stepper.children); },
    reset() {
      this.indeterminate(false);
      this.steps().forEach((s) => { s.dataset.state = 'idle'; s.querySelector('.step-time').textContent = ''; });
    },
    set(i, st, secs) {
      const s = this.steps()[i];
      if (!s) return;
      s.dataset.state = st;
      const t = s.querySelector('.step-time');
      if (st === 'skipped') t.textContent = 'Skipped';
      else if (secs != null && secs !== '') t.textContent = `${secs}s`;
    },
    indeterminate(on) {
      if (on) els.stepper.dataset.mode = 'indeterminate';
      else els.stepper.removeAttribute('data-mode');
    },
    error() {
      const active = this.steps().find((s) => s.dataset.state === 'active');
      if (active) active.dataset.state = 'error';
    },
    finalize(trace) {
      const seen = new Map();
      trace.forEach((t) => {
        const i = agentIndex(t.agent);
        if (i >= 0) seen.set(i, (seen.get(i) || 0) + (Number(t.seconds) || 0));
      });
      AGENTS.forEach((_, i) => {
        if (!trace.length) this.set(i, 'done');
        else if (seen.has(i)) this.set(i, 'done', seen.get(i).toFixed(1));
        else this.set(i, 'skipped');
      });
    },
  };

  function setView(name) {
    els.viewEmpty.hidden = name !== 'empty';
    els.viewRunning.hidden = name !== 'running';
    els.viewResult.hidden = name !== 'result';
  }

  /* ------------------------------------------------------------------ *
   * Demo data (clearly labelled as sample data in the UI)
   * ------------------------------------------------------------------ */
  function makeSilentWav(seconds, rate = 8000) {
    const n = Math.floor(seconds * rate);
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);
    return new Blob([buf], { type: 'audio/wav' });
  }

  const DEMO_SCRIPT_UR =
    'آپ کی کپاس کے پتوں میں لیف کرل وائرس کی علامات نظر آ رہی ہیں۔ ' +
    'ہمیں اس تشخیص پر تقریباً چوراسی فیصد یقین ہے۔ ' +
    'یہ وائرس سفید مکھی سے پھیلتا ہے، اس لیے سفید مکھی پر قابو پانا سب سے ضروری ہے۔ ' +
    'سخت متاثرہ پودوں کو جلد اکھاڑ کر تلف کر دیں۔ ' +
    'کھیت اور اطراف سے جڑی بوٹیاں صاف کریں کیونکہ ان پر سفید مکھی پلتی ہے۔ ' +
    'اگلی فصل کے لیے تصدیق شدہ مزاحمتی بیج استعمال کریں۔ ' +
    'دوا کی مقدار صرف اسی پیکٹ پر لکھی ہدایت کے مطابق رکھیں۔ ' +
    'اگر بارش کا امکان ہو تو سپرے نہ کریں۔ ' +
    'سپرے کے وقت دستانے اور ماسک پہنیں اور بچوں کو دور رکھیں۔ ' +
    'مسئلہ بڑھے تو اپنے علاقے کے زرعی افسر سے ضرور ملیں۔';

  function buildDemoResult(secs) {
    const heard = {
      transcript: 'میری کپاس کے پتے اوپر کی طرف مڑ رہے ہیں اور پودے چھوٹے رہ گئے ہیں۔ پندرہ دن سے یہ حالت ہے۔',
      crop: 'Cotton',
      symptoms: ['upward leaf curling', 'dark thickened veins', 'stunted plants'],
      duration_days: 15,
      district: state.district,
      urgency: 'medium',
      question: 'What is wrong with my cotton and what should I do?',
    };
    const diagnosis = {
      crop: 'Cotton',
      disease: 'Cotton leaf curl virus',
      confidence: 0.84,
      severity: 'medium',
      visual_evidence: ['Leaf edges curl upward', 'Veins look thick and dark', 'Plant growth is stunted'],
      alternatives: ['Herbicide drift', 'Potassium deficiency'],
      needs_follow_up: false,
      follow_up_question: null,
    };
    const passages = [
      { source: 'Sample knowledge base', text: 'Cotton leaf curl virus is spread by whitefly. There is no cure for an infected plant; remove and destroy heavily infected plants early and control weeds that host whitefly.', score: 0.381 },
      { source: 'Sample knowledge base', text: 'Scout fields every week during humid weather and remove volunteer plants and weeds.', score: 0.12 },
      { source: 'Sample knowledge base', text: 'Use certified resistant seed and avoid very late sowing.', score: 0.09 },
    ];
    const approved = [
      { action: 'Remove and destroy heavily infected plants early', active_ingredient: null, dosage: null, brand_examples: [], price_note: null, source_ids: [0] },
      { action: 'Control whitefly, the insect that spreads the virus', active_ingredient: null, dosage: null, brand_examples: [], price_note: null, source_ids: [0] },
      { action: 'Clear weeds in and around the field that host whitefly', active_ingredient: null, dosage: null, brand_examples: [], price_note: null, source_ids: [1] },
      { action: 'Sow certified, resistant seed in the next season', active_ingredient: null, dosage: null, brand_examples: [], price_note: null, source_ids: [2] },
    ];
    const weather = { ok: true, rain_prob_today: 20, rain_prob_tomorrow: 60, max_temp_c: 34, max_wind_kmh: 14 };
    const spray = 'Rain is likely within 24 to 48 hours. Do not spray now, because rain will wash the pesticide off.';
    const verified = {
      approved,
      rejected: [{ index: 4, reason: 'Dose was not found in any source' }],
      retry_feedback: 'Remove the suggestion that has no dose in the context.',
      weather,
      spray_warning: spray,
      safety_lines: DEFAULT_SAFETY,
    };
    const advice = {
      script_urdu: DEMO_SCRIPT_UR,
      summary_english:
        'Your cotton shows signs of leaf curl virus (84% confidence). Remove badly infected plants, control whitefly and weeds, and use resistant seed next season. Follow the dose on the product label, do not spray if rain is expected, wear gloves and a mask, and see your agriculture officer if it spreads.',
    };
    const research = { recommendations: approved, passages };

    return {
      heard, diagnosis, research, verified, advice,
      trace: [
        { agent: '1 Listener',  seconds: secs[0], output: heard },
        { agent: '2 Diagnosis', seconds: secs[1], output: diagnosis },
        { agent: '3 Research',  seconds: secs[2], output: research },
        { agent: '4 Verifier',  seconds: secs[3], output: verified },
        { agent: '5 Advisor',   seconds: secs[4], output: advice },
      ],
      _demoAudioBlob: makeSilentWav(32),
    };
  }

  async function runDemo(onStep) {
    const secs = [0.7, 1.1, 0.8, 0.7, 0.9];
    for (let i = 0; i < secs.length; i++) {
      onStep(i, 'active');
      await sleep(reducedMotion ? 120 : secs[i] * 1000);
      onStep(i, 'done', secs[i].toFixed(1));
    }
    return buildDemoResult(secs);
  }

  /* ------------------------------------------------------------------ *
   * Live backend call
   * ------------------------------------------------------------------ */
  async function callBackend(onStep) {
    const fd = new FormData();
    fd.append('image', state.photo, state.photo.name || 'leaf.jpg');
    if (state.audioBlob) fd.append('audio', state.audioBlob, state.audioName || 'voice-note.webm');
    if (state.text.trim()) fd.append('typed_text', state.text.trim());
    fd.append('district', state.district);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(state.apiUrl + CONFIG.ENDPOINT, { method: 'POST', body: fd, signal: ctrl.signal });
      if (!res.ok) {
        let detail = '';
        try { const j = await res.json(); detail = j.detail || j.error || ''; } catch { /* no JSON body */ }
        throw new Error(`The backend returned an error (${res.status})${detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '.'}`);
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('ndjson') && res.body) return await readNdjson(res, onStep);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function readNdjson(res, onStep) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let final = null;

    const handle = (line) => {
      if (!line.trim()) return;
      const evt = JSON.parse(line);
      if (evt.type === 'step') {
        const i = agentIndex(evt.agent);
        if (i >= 0) {
          onStep(i, 'done', evt.seconds != null ? Number(evt.seconds).toFixed(1) : '');
          if (AGENTS[i + 1]) onStep(i + 1, 'active');
        }
      } else if (evt.type === 'result') {
        final = evt.data;
      } else if (evt.type === 'error') {
        throw new Error(evt.message || 'The backend reported an error.');
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        handle(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    handle(buf);
    if (!final) throw new Error('The backend ended the stream without sending a result.');
    return final;
  }

  function friendlyError(err) {
    if (err && err.name === 'AbortError') return 'The backend took longer than 2 minutes to answer. Try again with a smaller photo.';
    if (err instanceof TypeError) return `The backend at ${state.apiUrl} could not be reached. Check that it is running and that it allows requests from this page (CORS).`;
    return (err && err.message) || 'Something went wrong. Try again.';
  }

  /* ------------------------------------------------------------------ *
   * Normalise any result into one shape
   * ------------------------------------------------------------------ */
  function resolveAudio(r) {
    if (r._demoAudioBlob) {
      return { url: URL.createObjectURL(r._demoAudioBlob), revoke: true, ext: 'wav', placeholder: true };
    }
    if (r.audio_base64) {
      try {
        const bin = atob(r.audio_base64);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: r.audio_mime || 'audio/mpeg' });
        return { url: URL.createObjectURL(blob), revoke: true, ext: 'mp3', placeholder: false };
      } catch { return null; }
    }
    if (r.audio_url) {
      const abs = /^(https?:|data:|blob:)/i.test(r.audio_url)
        ? r.audio_url
        : `${state.apiUrl}/${String(r.audio_url).replace(/^\/+/, '')}`;
      return { url: abs, revoke: false, ext: 'mp3', placeholder: false };
    }
    return null;
  }

  function normalizeResult(raw, live) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      heard: r.heard || {},
      diagnosis: r.diagnosis || {},
      research: r.research || { passages: [] },
      verified: r.verified || { approved: [], rejected: [], safety_lines: [] },
      advice: r.advice || {},
      trace: Array.isArray(r.trace) ? r.trace : [],
      audio: resolveAudio(r),
      isDemo: !live,
    };
  }

  /* ------------------------------------------------------------------ *
   * Render: results
   * ------------------------------------------------------------------ */
  function countUp(el, to, ms = 900) {
    if (reducedMotion) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const chip = (inner, cls = '') => `<span class="chip ${cls}">${inner}</span>`;

  function renderHeard(heard) {
    els.heardTranscript.textContent = heard.transcript || 'No speech or text was detected in the input.';
    applyDir(els.heardTranscript);

    const chips = [];
    if (heard.crop) chips.push(chip(`Crop <b>${escapeHtml(heard.crop)}</b>`));
    (heard.symptoms || []).forEach((s) => chips.push(chip(escapeHtml(s))));
    if (heard.duration_days != null) chips.push(chip(`${icon('clock')}<b>${escapeHtml(heard.duration_days)}</b> days`));
    if (heard.district) chips.push(chip(`${icon('pin')}<b>${escapeHtml(heard.district)}</b>`));
    if (heard.urgency) chips.push(chip(`Urgency <b>${escapeHtml(heard.urgency)}</b>`));
    els.heardChips.innerHTML = chips.join('');
  }

  function renderMetrics(res) {
    const d = res.diagnosis;
    const heard = res.heard;
    const pct = toPct(d.confidence);
    const low = pct < CONFIG.CONFIDENCE_THRESHOLD;

    els.mCrop.textContent = d.crop || heard.crop || '-';
    els.mCropSub.textContent = heard.district ? `Field in ${heard.district}` : '';

    const disease = d.disease === 'healthy' ? 'Healthy' : (d.disease || '-');
    els.mDisease.textContent = disease;
    const evidence = (d.visual_evidence || []).slice(0, 2).join('; ');
    els.mDiseaseSub.textContent = evidence ? `Seen: ${evidence}` : '';
    els.mDiseaseSub.title = (d.visual_evidence || []).join('; ');

    els.mConfFill.style.width = '0%';
    els.mConfValue.textContent = '0';
    els.mConfBar.dataset.level = low ? 'low' : 'ok';
    els.mConfBar.setAttribute('aria-valuenow', String(pct));
    els.mConfSub.textContent = low
      ? 'Below the 60% threshold, so treatment is withheld'
      : 'Above the 60% threshold';
    countUp(els.mConfValue, pct);
    requestAnimationFrame(() => requestAnimationFrame(() => { els.mConfFill.style.width = `${pct}%`; }));

    const sev = String(d.severity || 'unknown').toLowerCase();
    els.mSeverity.textContent = sev;
    els.mSeverity.dataset.level = ['low', 'medium', 'high'].includes(sev) ? sev : 'unknown';
    els.mSeveritySub.textContent = sev === 'high' ? 'Act quickly and call an officer' : sev === 'medium' ? 'Act within a few days' : sev === 'low' ? 'Keep watching the field' : '';
  }

  function renderAlerts(res) {
    const d = res.diagnosis;
    const v = res.verified;
    const needs = d.needs_follow_up || (d.confidence != null && toPct(d.confidence) < CONFIG.CONFIDENCE_THRESHOLD);

    els.followupAlert.hidden = !needs;
    if (needs) {
      const alt = (d.alternatives || []).length ? ` Other possibilities: ${d.alternatives.join(', ')}.` : '';
      els.followupText.textContent = (d.follow_up_question || 'Show this plant to your local agriculture officer before treating it.') + alt;
    }

    const w = v.weather || {};
    const hasWeather = Object.keys(w).length > 0;
    els.sprayAlert.hidden = !(hasWeather || v.spray_warning);
    els.sprayAlert.classList.toggle('alert-blue', !!w.ok || !!v.spray_warning);
    els.sprayAlert.classList.toggle('alert-warn', !w.ok && !v.spray_warning);

    if (!els.sprayAlert.hidden) {
      if (v.spray_warning) {
        els.sprayTitle.textContent = 'Check the weather before you spray';
        els.sprayText.textContent = v.spray_warning;
      } else if (w.ok) {
        els.sprayTitle.textContent = 'Spray conditions look fine';
        els.sprayText.textContent = 'No heavy rain, strong wind or extreme heat is forecast for the next two days.';
      } else {
        els.sprayTitle.textContent = 'Weather data was not available';
        els.sprayText.textContent = 'The spray-timing check was skipped. Avoid spraying if rain is likely.';
      }
      els.weatherChips.innerHTML = w.ok ? [
        chip(`${icon('rain')}Rain today <b>${escapeHtml(w.rain_prob_today ?? '-')}%</b>`),
        chip(`${icon('rain')}Rain tomorrow <b>${escapeHtml(w.rain_prob_tomorrow ?? '-')}%</b>`),
        chip(`${icon('thermo')}High <b>${escapeHtml(w.max_temp_c ?? '-')}°C</b>`),
        chip(`${icon('wind')}Wind <b>${escapeHtml(w.max_wind_kmh ?? '-')} km/h</b>`),
      ].join('') : '';
    }
  }

  function renderTreatment(res) {
    const v = res.verified;
    const passages = (res.research && res.research.passages) || [];
    const approved = v.approved || [];
    const rejected = v.rejected || [];

    els.blockedBadge.hidden = !rejected.length;
    if (rejected.length) {
      els.blockedBadge.innerHTML = `${icon('shield')}Verifier blocked ${rejected.length} suggestion${rejected.length > 1 ? 's' : ''}`;
      els.blockedBadge.title = rejected.map((r) => r.reason).filter(Boolean).join('; ');
    }

    const has = approved.length > 0;
    els.treatWrap.hidden = !has;
    els.treatEmpty.hidden = has;

    els.treatBody.innerHTML = approved.map((r) => {
      const idx = Array.isArray(r.source_ids) && r.source_ids.length ? Number(r.source_ids[0]) : null;
      const unver = r.origin === 'web' || r.origin === 'ai';
      let src = idx !== null && passages[idx] ? passages[idx].source : (Array.isArray(r.sources) && r.sources.length ? r.sources.join('; ') : null);
      if (unver) src = `${r.origin === 'ai' ? 'AI general knowledge' : 'Web'} (unverified)${src && r.origin === 'web' ? ': ' + src : ''}`;
      const full = src || '';
      if (src) src = src.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();   // no long URLs in the table
      if (src && src.length > 70) src = src.slice(0, 67).trim() + '...';
      const brands = (r.brand_examples || []).length ? escapeHtml(r.brand_examples.join(', ')) : '<span class="nil">None listed</span>';
      return `<tr>
        <td data-label="Action" data-autodir>${escapeHtml(r.action || '-')}</td>
        <td data-label="Active ingredient">${r.active_ingredient ? escapeHtml(r.active_ingredient) : '<span class="nil">Not specified</span>'}</td>
        <td data-label="Dosage">${r.dosage ? escapeHtml(r.dosage) : chip('Follow the product label', 'chip-quiet')}</td>
        <td data-label="Brands">${brands}</td>
        <td data-label="Price note">${r.price_note ? escapeHtml(r.price_note) : '<span class="nil">-</span>'}</td>
        <td data-label="Source" class="src"${full ? ` title="${escapeHtml(full)}"` : ''}>${src ? escapeHtml(src) : '<span class="nil">-</span>'}</td>
      </tr>`;
    }).join('');

    const note = document.getElementById('treatNote');
    if (note) {
      note.textContent = approved.some((r) => r.origin === 'web' || r.origin === 'ai')
        ? 'Some options below come from the web or the AI\'s general knowledge and are NOT verified. Confirm the product and dose with an agriculture officer before using them.'
        : 'Every dose and brand below was found in a local source and checked by the Verifier agent.';
    }
    const safety = (v.safety_lines && v.safety_lines.length ? v.safety_lines : DEFAULT_SAFETY);
    els.safetyList.innerHTML = safety.map((s) => `<li>${icon('shield')}<span>${escapeHtml(s)}</span></li>`).join('');
    applyAutoRtl(els.treatBody);
  }

  function renderResult(res) {
    state.result = res;
    els.demoBadge.hidden = !res.isDemo;
    renderHeard(res.heard);
    renderMetrics(res);
    renderAlerts(res);
    renderTreatment(res);
    setupPlayer(res);
    renderTrace(res.trace);
  }

  /* ------------------------------------------------------------------ *
   * Audio console
   * ------------------------------------------------------------------ */
  const player = { cum: [], sents: [], speeds: [1, 0.8, 1.25], speedIdx: 0, url: null, revoke: false };

  function splitSentences(text) {
    return (String(text).match(/[^۔.!?؟\n]+[۔.!?؟]?/g) || []).map((s) => s.trim()).filter(Boolean);
  }

  function renderUrdu(script) {
    const sents = splitSentences(script);
    if (!sents.length) {
      els.urduText.textContent = 'No advice text was returned.';
      player.cum = []; player.sents = [];
      return;
    }
    els.urduText.innerHTML = sents
      .map((s, i) => `<span class="sent" data-i="${i}" title="Play from here">${escapeHtml(s)}</span>`)
      .join(' ');
    player.sents = Array.from(els.urduText.querySelectorAll('.sent'));
    const total = sents.reduce((n, s) => n + s.length, 0) || 1;
    let run = 0;
    player.cum = sents.map((s) => (run += s.length) / total);
  }

  function setPlayIcon(playing) {
    els.playIcon.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    els.playBtn.setAttribute('aria-label', playing ? 'Pause advice' : 'Play advice');
  }

  function updateProgress() {
    const a = els.audioEl;
    const dur = a.duration;
    const p = Number.isFinite(dur) && dur > 0 ? Math.min(1, a.currentTime / dur) : 0;
    els.seek.value = String(Math.round(p * 1000));
    els.seek.style.setProperty('--p', `${p * 100}%`);
    els.curTime.textContent = formatTime(a.currentTime);
    if (Number.isFinite(dur)) els.durTime.textContent = formatTime(dur);

    let idx = -1;
    if (p > 0 || !a.paused) {
      idx = player.cum.findIndex((c) => p <= c);
      if (idx < 0) idx = player.cum.length - 1;
    }
    player.sents.forEach((el, i) => {
      el.classList.toggle('is-active', i === idx);
      el.classList.toggle('is-done', idx >= 0 && i < idx);
    });
  }

  function teardownPlayer() {
    const a = els.audioEl;
    a.pause();
    a.removeAttribute('src');
    a.load();
    if (player.revoke && player.url) URL.revokeObjectURL(player.url);
    player.url = null; player.revoke = false; player.speedIdx = 0;
    a.playbackRate = 1;
    els.speedBtn.textContent = '1x';
    setPlayIcon(false);
    updateProgress();
    els.durTime.textContent = '0:00';
  }

  function setupPlayer(res) {
    teardownPlayer();
    renderUrdu(res.advice.script_urdu || '');
    els.urduSummary.textContent = res.advice.summary_english || '';

    const audio = res.audio;
    const enabled = !!audio;
    els.playBtn.disabled = !enabled;
    els.seek.disabled = !enabled;
    els.speedBtn.disabled = !enabled;

    if (audio) {
      player.url = audio.url;
      player.revoke = audio.revoke;
      els.audioEl.src = audio.url;
      els.audioEl.load();
      els.downloadLink.hidden = audio.placeholder;
      els.downloadLink.href = audio.url;
      els.downloadLink.setAttribute('download', `kisaanai-advice.${audio.ext}`);
      els.audioNote.hidden = !audio.placeholder;
      els.audioNote.textContent = audio.placeholder
        ? 'Sample mode plays silent placeholder audio so you can try the player and the sentence highlighting. With a backend connected, the Urdu voice reply plays here.'
        : '';
    } else {
      els.downloadLink.hidden = true;
      els.audioNote.hidden = false;
      els.audioNote.textContent = 'Audio is not available for this result. You can still read the advice below.';
    }
  }

  function bindPlayer() {
    const a = els.audioEl;
    els.playBtn.addEventListener('click', () => {
      if (a.paused) a.play().catch(() => toast('The audio could not be played in this browser.', 'error'));
      else a.pause();
    });
    a.addEventListener('play', () => setPlayIcon(true));
    a.addEventListener('pause', () => { setPlayIcon(false); updateProgress(); });
    a.addEventListener('ended', () => { setPlayIcon(false); a.currentTime = 0; updateProgress(); });
    a.addEventListener('timeupdate', updateProgress);
    a.addEventListener('loadedmetadata', updateProgress);
    a.addEventListener('durationchange', updateProgress);
    a.addEventListener('error', () => { if (a.getAttribute('src')) toast('The audio file could not be loaded.', 'error'); });

    els.seek.addEventListener('input', () => {
      if (Number.isFinite(a.duration)) a.currentTime = (Number(els.seek.value) / 1000) * a.duration;
      updateProgress();
    });

    els.speedBtn.addEventListener('click', () => {
      player.speedIdx = (player.speedIdx + 1) % player.speeds.length;
      const s = player.speeds[player.speedIdx];
      a.playbackRate = s;
      els.speedBtn.textContent = `${s}x`;
    });

    els.urduText.addEventListener('click', (e) => {
      const el = e.target.closest('.sent');
      if (!el || els.playBtn.disabled || !Number.isFinite(a.duration)) return;
      const i = Number(el.dataset.i);
      a.currentTime = (i === 0 ? 0 : player.cum[i - 1]) * a.duration;
      a.play().catch(() => {});
    });
  }

  /* ------------------------------------------------------------------ *
   * Trace logs
   * ------------------------------------------------------------------ */
  function setCollapsible(el, open) {
    el.dataset.open = String(open);
    const inner = el.querySelector(':scope > .collapsible-inner');
    if (inner) inner.inert = !open;
  }

  function highlightJson(obj) {
    const json = JSON.stringify(obj, null, 2) ?? 'null';
    return escapeLite(json).replace(
      /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:?)|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
      (m, str, kw) => {
        if (str) {
          if (/:\s*$/.test(str)) return `<span class="j-key">${str.replace(/\s*:\s*$/, '')}</span>:`;
          return `<span class="j-str">${str}</span>`;
        }
        if (kw) return `<span class="${kw === 'null' ? 'j-null' : 'j-bool'}">${kw}</span>`;
        return `<span class="j-num">${m}</span>`;
      },
    );
  }

  function summarize(label, out) {
    const o = out && typeof out === 'object' ? out : {};
    if (o.error) return `Error: ${o.error}`;
    switch (agentIndex(label)) {
      case 0: return [o.crop && `Crop ${o.crop}`, `${(o.symptoms || []).length} symptoms`, o.urgency && `urgency ${o.urgency}`].filter(Boolean).join(', ');
      case 1: return `${o.disease ?? 'unknown'} at ${toPct(o.confidence)}%, severity ${o.severity ?? 'unknown'}`;
      case 2: return `${(o.recommendations || []).length} recommendations from ${(o.passages || []).length} passages`;
      case 3: return `${(o.approved || []).length} approved, ${(o.rejected || []).length} blocked`;
      case 4: return `Urdu script of ${(o.script_urdu || '').length} characters`;
      default: return `${Object.keys(o).length} fields`;
    }
  }

  function renderTrace(trace) {
    els.traceCount.textContent = String(trace.length);
    els.expandAll.textContent = 'Expand all';

    if (!trace.length) {
      els.traceTotal.textContent = 'No run yet';
      els.traceBar.innerHTML = '';
      els.traceLegend.innerHTML = '';
      els.traceList.innerHTML = '<li class="trace-empty muted">Each agent\'s input, output and timing will be listed here after a run.</li>';
      return;
    }

    const total = trace.reduce((s, t) => s + (Number(t.seconds) || 0), 0);
    els.traceTotal.textContent = `${trace.length} steps in ${total.toFixed(1)} s`;

    const colorOf = (label) => { const i = agentIndex(label); return TRACE_COLORS[i >= 0 ? i : 0]; };

    els.traceBar.innerHTML = trace.map((t) =>
      `<span style="flex-grow:${Math.max(Number(t.seconds) || 0, 0.05)};background:${colorOf(t.agent)}" title="${escapeHtml(t.agent)}: ${(Number(t.seconds) || 0).toFixed(1)} s"></span>`).join('');

    els.traceLegend.innerHTML = trace.map((t) =>
      `<li><i style="background:${colorOf(t.agent)}"></i>${escapeHtml(t.agent)} ${(Number(t.seconds) || 0).toFixed(1)} s</li>`).join('');

    els.traceList.innerHTML = trace.map((t, i) => {
      const failed = !!(t.output && t.output.error);
      return `
      <li class="trace-item" data-open="false">
        <button class="trace-item-head" type="button" aria-expanded="false" aria-controls="trace-body-${i}">
          <span class="trace-dot" style="color:${colorOf(t.agent)};background:currentColor"></span>
          <span class="trace-name">${escapeHtml(t.agent)}</span>
          <span class="trace-sum">${escapeHtml(summarize(t.agent, t.output))}</span>
          <span class="trace-sec">${(Number(t.seconds) || 0).toFixed(1)} s</span>
          <span class="status-chip" data-status="${failed ? 'error' : 'ok'}">${failed ? 'error' : 'ok'}</span>
          ${icon('chevron', 'chev')}
        </button>
        <div class="collapsible" id="trace-body-${i}" data-open="false">
          <div class="collapsible-inner" inert>
            <div><pre class="json" dir="ltr">${highlightJson(t.output)}</pre></div>
          </div>
        </div>
      </li>`;
    }).join('');
  }

  function bindTrace() {
    setCollapsible(els.tracePanel, false);

    els.traceToggle.addEventListener('click', () => {
      const open = els.traceToggle.getAttribute('aria-expanded') !== 'true';
      els.traceToggle.setAttribute('aria-expanded', String(open));
      setCollapsible(els.tracePanel, open);
    });

    els.traceList.addEventListener('click', (e) => {
      const head = e.target.closest('.trace-item-head');
      if (!head) return;
      const item = head.closest('.trace-item');
      const open = item.dataset.open !== 'true';
      item.dataset.open = String(open);
      head.setAttribute('aria-expanded', String(open));
      setCollapsible(item.querySelector('.collapsible'), open);
    });

    els.expandAll.addEventListener('click', () => {
      const items = Array.from(els.traceList.querySelectorAll('.trace-item'));
      if (!items.length) return;
      const open = items.some((it) => it.dataset.open !== 'true');
      items.forEach((it) => {
        it.dataset.open = String(open);
        it.querySelector('.trace-item-head').setAttribute('aria-expanded', String(open));
        setCollapsible(it.querySelector('.collapsible'), open);
      });
      els.expandAll.textContent = open ? 'Collapse all' : 'Expand all';
    });

    els.copyTrace.addEventListener('click', async () => {
      if (!state.result || !state.result.trace.length) { toast('There is no trace to copy yet. Run a diagnosis first.', 'info'); return; }
      const text = JSON.stringify(state.result.trace, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        toast('Trace copied as JSON.', 'success', 2800);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        ta.remove();
        toast(ok ? 'Trace copied as JSON.' : 'Copy failed. Select the text in a log entry and copy it manually.', ok ? 'success' : 'error', 3500);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Run and reset
   * ------------------------------------------------------------------ */
  async function run() {
    if (state.running || els.runBtn.disabled) return;
    state.running = true;
    const live = !!state.apiUrl;
    const t0 = performance.now();

    setBusy(true);
    Stepper.reset();
    setView('running');
    els.pipelineState.textContent = 'Agents are working';
    els.runningText.textContent = live ? 'Sending your photo and voice note to the agents' : 'Running the sample pipeline';

    const onStep = (i, status, secs) => {
      Stepper.indeterminate(false);
      Stepper.set(i, status, secs);
      if (status === 'active') els.runningText.textContent = `${AGENTS[i].name} agent: ${AGENTS[i].role.toLowerCase()}`;
    };

    try {
      if (live) Stepper.indeterminate(true);
      const raw = live ? await callBackend(onStep) : await runDemo(onStep);
      Stepper.indeterminate(false);

      const res = normalizeResult(raw, live);
      setView('result');
      renderResult(res);
      Stepper.finalize(res.trace);
      els.pipelineState.textContent = `Finished in ${((performance.now() - t0) / 1000).toFixed(1)} s`;

      if (!state.traceAutoOpened) {
        state.traceAutoOpened = true;
        els.traceToggle.setAttribute('aria-expanded', 'true');
        setCollapsible(els.tracePanel, true);
      }
      toast(res.isDemo ? 'Sample analysis complete. Connect a backend to run real diagnoses.' : 'Diagnosis complete.', 'success');
      if (window.matchMedia('(max-width: 1079px)').matches) {
        els.viewResult.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error(err);
      Stepper.indeterminate(false);
      Stepper.error();
      els.pipelineState.textContent = 'Stopped because of an error';
      setView(state.result ? 'result' : 'empty');
      toast(friendlyError(err), 'error', 8000);
    } finally {
      state.running = false;
      setBusy(false);
    }
  }

  function resetAll() {
    if (state.running) return;
    clearPhoto();
    clearAudio();
    els.typedText.value = '';
    state.text = '';
    applyDir(els.typedText);
    selectPane('record');
    els.recStatus.textContent = 'Tap the microphone and start speaking';
    els.recTimer.textContent = '0:00';

    teardownPlayer();
    state.result = null;
    renderTrace([]);
    Stepper.reset();
    setView('empty');
    updateCta();
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */
  function init() {
    Stepper.build();
    initApiUrl();
    bindSettings();
    bindPhoto();
    bindTabs();
    bindRecorder();
    bindUploadAndText();
    bindPlayer();
    bindTrace();

    state.district = els.districtSelect.value;
    els.runBtn.addEventListener('click', run);
    els.resetBtn.addEventListener('click', resetAll);

    applyAutoRtl();
    renderTrace([]);
    setView('empty');
    updateCta();
  }

  init();
})();