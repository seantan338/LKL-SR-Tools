'use client';

import { useState, useEffect, useRef } from 'react';

export default function BlackHoleEasterEgg() {
  // Phase: 'idle' | 'collapsing' | 'singularity' | 'bigbang'
  const [phase, setPhase] = useState('idle');
  const [lang, setLang] = useState('zh');
  const singularityRef = useRef(null);

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('talent_flow_lang') || 'zh';
      setLang(savedLang);
    } catch (e) {}

    const handleLangChange = (e) => {
      if (e.detail?.lang) setLang(e.detail.lang);
    };
    window.addEventListener('languagechange', handleLangChange);
    return () => window.removeEventListener('languagechange', handleLangChange);
  }, []);

  // Synthesize cosmic gravitational plunge sound using Web Audio API
  const playVortexAudio = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      // 1. Low sub-bass gravitational pull pitch bend
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(110, now);
      subOsc.frequency.exponentialRampToValueAtTime(24, now + 2.2);

      subGain.gain.setValueAtTime(0.01, now);
      subGain.gain.linearRampToValueAtTime(0.18, now + 0.5);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.38);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 2.4);

      // 2. Resonant bandpass sweep (matter swirl whoosh)
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2.4, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 2.2);
      filter.Q.setValueAtTime(4.0, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.15, now + 0.8);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.35);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      whiteNoise.start(now);
      whiteNoise.stop(now + 2.4);
    } catch (e) {
      // Audio autoplay policy or blocked - ignore gracefully
    }
  };

  // Synthesize Big Bang rebirth sound
  const playBigBangAudio = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      // 1. Deep explosive boom
      const boomOsc = ctx.createOscillator();
      const boomGain = ctx.createGain();
      boomOsc.type = 'triangle';
      boomOsc.frequency.setValueAtTime(85, now);
      boomOsc.frequency.exponentialRampToValueAtTime(22, now + 1.2);

      boomGain.gain.setValueAtTime(0.35, now);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      boomOsc.connect(boomGain);
      boomGain.connect(ctx.destination);
      boomOsc.start(now);
      boomOsc.stop(now + 1.5);

      // 2. High crystalline cosmic harmonic chimes (528Hz, 852Hz, 1056Hz)
      [528, 852, 1056].forEach((freq, idx) => {
        const chime = ctx.createOscillator();
        const chimeGain = ctx.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(freq, now + 0.04 * idx);
        chimeGain.gain.setValueAtTime(0.06, now + 0.04 * idx);
        chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2 + 0.2 * idx);

        chime.connect(chimeGain);
        chimeGain.connect(ctx.destination);
        chime.start(now + 0.04 * idx);
        chime.stop(now + 1.5);
      });
    } catch (e) {
      // Ignore
    }
  };

  // Helper to query page content elements that should collapse
  const getTargetElements = () => {
    const root = document.getElementById('talent-app-root');
    if (root) return [root];
    const fallbacks = document.querySelectorAll('.app-wrapper, .standalone-docs-root, main');
    if (fallbacks.length > 0) return Array.from(fallbacks);
    return [];
  };

  // Trigger the Black Hole vortex
  const triggerBlackHole = () => {
    if (phase !== 'idle') return;

    // Strictly ensure this easter egg only operates on the Settings page AND under Gemini Cosmic Theme
    if (typeof window !== 'undefined') {
      const isSettings = window.location.pathname.endsWith('/settings') || window.location.pathname.includes('/settings');
      if (!isSettings) return;

      const currentTheme = document.documentElement.getAttribute('data-theme') || 
                           (typeof localStorage !== 'undefined' ? localStorage.getItem('talent_flow_theme') : null);
      if (currentTheme !== 'gemini') return;
    }

    // Lock page scrolling during black hole sequence
    try {
      document.body.style.overflow = 'hidden';
    } catch (e) {}

    // Calculate dynamic transform-origin relative to current viewport center
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const originX = scrollX + window.innerWidth / 2;
    const originY = scrollY + window.innerHeight / 2;

    setPhase('collapsing');
    playVortexAudio();

    const targets = getTargetElements();
    targets.forEach((el) => {
      el.style.transformOrigin = `${originX}px ${originY}px`;
      el.classList.remove('bh-reborn-anim');
      el.classList.add('bh-collapsing-anim');
    });

    // Transition to static Singularity phase after 2.4s of vortex pull
    setTimeout(() => {
      setPhase('singularity');
      targets.forEach((el) => {
        el.style.visibility = 'hidden';
      });
    }, 2400);
  };

  // Trigger the Big Bang restoration
  const triggerBigBang = () => {
    if (phase !== 'singularity') return;

    setPhase('bigbang');
    playBigBangAudio();

    const targets = getTargetElements();
    targets.forEach((el) => {
      el.style.visibility = 'visible';
      el.classList.remove('bh-collapsing-anim');
      el.classList.add('bh-reborn-anim');
    });

    // Reset back to idle state after Big Bang explosion completes (1.6s)
    setTimeout(() => {
      targets.forEach((el) => {
        el.classList.remove('bh-reborn-anim');
        el.style.visibility = '';
        el.style.transformOrigin = '';
      });
      try {
        document.body.style.overflow = '';
      } catch (e) {}
      setPhase('idle');
    }, 1600);
  };

  // Register global shortcuts, window.blackhole API, and custom events
  useEffect(() => {
    let keyBuffer = '';
    const secretWord = 'blackhole';
    const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;

    const handleKeyDown = (e) => {
      // 1. If currently in Singularity phase, ESC, Space, or Enter triggers Big Bang
      if (phase === 'singularity') {
        if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          triggerBigBang();
          return;
        }
      }

      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
      );

      // 2. Check if user typed /blackhole or blackhole in an input and hit Enter
      if (e.key === 'Enter' && isInput) {
        const val = String(activeEl.value || '').trim().toLowerCase();
        if (val === '/blackhole' || val === 'blackhole' || val === '/黑洞' || val === '黑洞') {
          e.preventDefault();
          activeEl.value = '';
          triggerBlackHole();
          return;
        }
      }

      // 3. Konami Code detection
      if (e.key.toLowerCase() === konamiSequence[konamiIndex].toLowerCase()) {
        konamiIndex++;
        if (konamiIndex === konamiSequence.length) {
          konamiIndex = 0;
          triggerBlackHole();
          return;
        }
      } else {
        konamiIndex = 0;
      }

      // 4. Global letter sequence detection for 'blackhole' when outside inputs
      if (!isInput && e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        keyBuffer += e.key.toLowerCase();
        if (keyBuffer.length > 25) {
          keyBuffer = keyBuffer.slice(-15);
        }
        if (keyBuffer.endsWith(secretWord)) {
          keyBuffer = '';
          triggerBlackHole();
        }
      }
    };

    const handleCustomTrigger = () => triggerBlackHole();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('trigger_blackhole', handleCustomTrigger);
    window.blackhole = triggerBlackHole; // Expose on window for easy testing

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('trigger_blackhole', handleCustomTrigger);
      delete window.blackhole;
      try {
        document.body.style.overflow = '';
      } catch (e) {}
    };
  }, [phase]);

  if (phase === 'idle') return null;

  return (
    <div 
      className={`black-hole-overlay-root phase-${phase}`}
      onClick={phase === 'singularity' ? triggerBigBang : undefined}
    >
      {/* Background Dimming Backdrop */}
      <div className="black-hole-backdrop"></div>

      {/* Accretion Disk & Singularity Core */}
      <div className="black-hole-centerpiece">
        {/* 1. Continuous Inward Gravitational Suction Rings (Pulling Matter Inwards) */}
        {phase === 'collapsing' && (
          <>
            <div className="bh-inward-suction-ring bh-ring-1"></div>
            <div className="bh-inward-suction-ring bh-ring-2"></div>
            <div className="bh-inward-suction-ring bh-ring-3"></div>
          </>
        )}

        {/* 2. Gravitational Lensing Halo (Interstellar Light-Bending Arc) */}
        {phase === 'collapsing' && (
          <div className="bh-lensing-halo-warp"></div>
        )}

        {/* 3. Spiral Accretion Vortex (3-Arm Logarithmic Inward Whirlpool Streams) */}
        {phase === 'collapsing' && (
          <div className="bh-accretion-spiral-container">
            <svg viewBox="0 0 400 400" className="bh-spiral-svg">
              <defs>
                <linearGradient id="bhSpiralGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
                  <stop offset="45%" stopColor="#a855f7" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="bhSpiralGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
                  <stop offset="50%" stopColor="#c084fc" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* Arm 1 */}
              <path 
                d="M 385.0 200.0 L 374.88 246.52 L 353.55 287.91 L 322.92 321.59 L 285.48 345.63 L 244.1 358.82 L 201.74 360.78 L 161.34 351.92 L 125.56 333.35 L 96.58 306.83 L 76.05 274.58 L 64.92 239.09 L 63.45 202.96 L 71.19 168.71 L 87.11 138.57 L 109.63 114.39 L 136.79 97.47 L 166.43 88.53 L 196.35 87.68 L 224.44 94.45 L 248.86 107.84 L 268.17 126.46 L 281.37 148.61 L 288.0 172.46 L 288.09 196.18 L 282.17 218.09 L 271.17 236.75 L 256.35 251.1 L 239.12 260.48 L 221.01 264.67" 
                fill="none" 
                stroke="url(#bhSpiralGrad1)" 
                strokeWidth="11" 
                strokeLinecap="round"
              />

              {/* Arm 2 */}
              <path 
                d="M 107.5 360.21 L 72.27 328.19 L 47.09 289.02 L 33.24 245.65 L 31.14 201.22 L 40.41 158.78 L 59.89 121.12 L 87.76 90.56 L 121.74 68.85 L 159.19 57.02 L 197.39 55.37 L 233.69 63.47 L 265.71 80.26 L 291.5 104.1 L 309.64 132.95 L 319.32 164.54 L 320.4 196.52 L 313.32 226.67 L 299.1 253.0 L 279.19 273.94 L 255.38 288.39 L 229.61 295.81 L 203.82 296.17 L 179.85 289.98 L 159.26 278.2 L 143.25 262.12 L 132.58 243.26 L 127.57 223.25 L 128.06 203.64 L 133.49 185.86" 
                fill="none" 
                stroke="url(#bhSpiralGrad2)" 
                strokeWidth="9" 
                strokeLinecap="round"
              />

              {/* Arm 3 */}
              <path 
                d="M 107.5 39.79 L 152.85 25.29 L 199.36 23.07 L 243.84 32.75 L 283.37 53.16 L 315.49 82.4 L 338.37 118.1 L 350.89 157.52 L 352.71 197.79 L 344.23 236.14 L 326.56 270.05 L 301.39 297.44 L 270.84 316.78 L 237.3 327.19 L 203.25 328.48 L 171.05 321.07 L 142.81 306.01 L 120.25 284.8 L 104.55 259.32 L 96.37 231.61 L 95.76 203.77 L 102.23 177.74 L 114.81 155.23 L 132.15 137.56 L 152.65 125.62 L 174.58 119.79 L 196.24 119.98 L 216.08 125.65 L 232.82 135.88 L 245.5 149.47" 
                fill="none" 
                stroke="url(#bhSpiralGrad1)" 
                strokeWidth="8" 
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {/* 4. Tilted 3D Relativistic Accretion Disk (Breaks flat 2D CD appearance) */}
        {phase === 'collapsing' && (
          <div className="bh-tilted-plasma-disk"></div>
        )}

        {/* 5. Razor-Sharp Photon Sphere Boundary */}
        {phase === 'collapsing' && (
          <div className="bh-photon-ring-border"></div>
        )}

        {/* 6. The Black Hole Event Horizon (Central Pitch Black Core / Singularity) */}
        <div 
          ref={singularityRef}
          className={`event-horizon-core ${phase === 'singularity' ? 'interactive-singularity' : ''}`}
          onClick={phase === 'singularity' ? triggerBigBang : undefined}
          title={phase === 'singularity' ? (lang === 'en' ? 'Click to trigger Big Bang' : '点击触发宇宙大爆炸 / Click to trigger Big Bang') : ''}
        >
          {phase === 'singularity' && <div className="singularity-core-dot"></div>}
          {phase === 'singularity' && <div className="singularity-wave-ripple"></div>}
        </div>

        {/* Big Bang Plasma Shockwave */}
        {phase === 'bigbang' && (
          <div className="big-bang-shockwave"></div>
        )}

        {/* Instruction Message during Singularity */}
        {phase === 'singularity' && (
          <div className="singularity-message-box" onClick={triggerBigBang}>
            <div className="singularity-title">
              <i className="ph-fill ph-sparkle"></i>
              <span>{lang === 'en' ? 'Cosmic Singularity Reached' : '宇宙已归于奇点 (Cosmic Singularity)'}</span>
            </div>
            <p className="singularity-sub">
              {lang === 'en' 
                ? 'All matter has collapsed into the event horizon · Space and time stand still' 
                : '一切物质已坍缩进入超高密视界 · 空间与时间在此静止'}
            </p>
            <div className="singularity-action-pill">
              <i className="ph-bold ph-hand-pointing"></i>
              <span>
                {lang === 'en'
                  ? 'Click anywhere to trigger the Big Bang and rebirth the universe (or press ESC / Space)'
                  : '点击任意处唤醒【宇宙大爆炸】重塑时空 (或按 ESC / 空格键)'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Injected Scoped CSS Animation Keyframes */}
      <style jsx global>{`
        /* --- Page Collapse Animation --- */
        .bh-collapsing-anim {
          transform-origin: 50% 50%;
          animation: blackHoleVortexSuck 2.4s cubic-bezier(0.3, 0, 0.2, 1) forwards !important;
          pointer-events: none !important;
          user-select: none !important;
        }

        @keyframes blackHoleVortexSuck {
          0% {
            transform: scale(1) rotate(0deg);
            filter: blur(0px) brightness(1);
            opacity: 1;
          }
          35% {
            transform: scale(0.68) rotate(120deg);
            filter: blur(2px) brightness(1.2) hue-rotate(50deg);
            opacity: 0.95;
          }
          70% {
            transform: scale(0.22) rotate(460deg);
            filter: blur(6px) brightness(2) hue-rotate(180deg);
            opacity: 0.6;
          }
          100% {
            transform: scale(0) rotate(720deg);
            filter: blur(14px) brightness(3);
            opacity: 0;
          }
        }

        /* --- Page Big Bang Reborn Animation --- */
        .bh-reborn-anim {
          transform-origin: 50% 50%;
          animation: blackHoleBigBangReborn 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }

        @keyframes blackHoleBigBangReborn {
          0% {
            transform: scale(0) rotate(-180deg);
            filter: blur(20px) brightness(3);
            opacity: 0;
          }
          55% {
            transform: scale(1.06) rotate(6deg);
            filter: blur(2px) brightness(1.3);
            opacity: 0.95;
          }
          80% {
            transform: scale(0.98) rotate(-2deg);
            filter: blur(0px) brightness(1.05);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(0deg);
            filter: blur(0px) brightness(1);
            opacity: 1;
          }
        }

        /* --- Overlay Root --- */
        .black-hole-overlay-root {
          position: fixed;
          inset: 0;
          z-index: 99998;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .black-hole-overlay-root.phase-singularity {
          pointer-events: auto;
          cursor: pointer;
        }

        .black-hole-overlay-root.phase-bigbang {
          pointer-events: auto;
        }

        /* Backdrop dimming */
        .black-hole-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(3, 4, 15, 0.92);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          animation: bhBackdropFadeIn 1.5s ease forwards;
        }

        @keyframes bhBackdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Centerpiece */
        .black-hole-centerpiece {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }

        /* --- 1. Continuous Inward Gravitational Suction Rings --- */
        .bh-inward-suction-ring {
          position: absolute;
          width: 360px;
          height: 360px;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: rgba(168, 85, 247, 0.85);
          border-right-color: rgba(59, 130, 246, 0.75);
          border-bottom-color: rgba(236, 72, 153, 0.65);
          box-shadow: 0 0 24px rgba(168, 85, 247, 0.5);
          pointer-events: none;
        }

        .bh-ring-1 {
          animation: bhInwardSuctionFlow 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .bh-ring-2 {
          animation: bhInwardSuctionFlow 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          animation-delay: -0.85s;
        }

        .bh-ring-3 {
          animation: bhInwardSuctionFlow 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          animation-delay: -1.7s;
        }

        @keyframes bhInwardSuctionFlow {
          0% {
            transform: scale(1.7) rotate(0deg);
            opacity: 0;
            filter: blur(8px);
          }
          25% {
            opacity: 0.9;
          }
          70% {
            opacity: 0.75;
            filter: blur(3px);
          }
          100% {
            transform: scale(0.38) rotate(320deg);
            opacity: 0;
            filter: blur(0px);
          }
        }

        /* --- 2. Lensing Halo (Interstellar Light-Bending Arc) --- */
        .bh-lensing-halo-warp {
          position: absolute;
          width: 190px;
          height: 310px;
          border-radius: 50%;
          border: 3px solid transparent;
          border-top: 3.5px solid rgba(236, 72, 153, 0.8);
          border-bottom: 3.5px solid rgba(59, 130, 246, 0.8);
          filter: blur(4px);
          box-shadow: 0 0 35px rgba(168, 85, 247, 0.6);
          animation: bhHaloBreathing 3.6s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes bhHaloBreathing {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            opacity: 0.75;
          }
          50% {
            transform: scale(1.08) rotate(10deg);
            opacity: 1;
          }
        }

        /* --- 3. Spiral Accretion Vortex (3-Arm Logarithmic Whirlpool) --- */
        .bh-accretion-spiral-container {
          position: absolute;
          width: 380px;
          height: 380px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .bh-spiral-svg {
          width: 380px;
          height: 380px;
          animation: bhWhirlpoolDrain 3.2s linear infinite;
          filter: drop-shadow(0 0 16px rgba(168, 85, 247, 0.85)) drop-shadow(0 0 30px rgba(59, 130, 246, 0.5));
        }

        @keyframes bhWhirlpoolDrain {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* --- 4. Tilted 3D Relativistic Accretion Disk --- */
        .bh-tilted-plasma-disk {
          position: absolute;
          width: 340px;
          height: 180px;
          border-radius: 50%;
          background: radial-gradient(
            ellipse at center,
            transparent 30%,
            rgba(168, 85, 247, 0.5) 55%,
            rgba(59, 130, 246, 0.4) 75%,
            transparent 100%
          );
          filter: blur(6px);
          transform: rotate(-16deg);
          pointer-events: none;
          animation: bhTiltedDiscPulsar 4s ease-in-out infinite;
        }

        @keyframes bhTiltedDiscPulsar {
          0%, 100% {
            opacity: 0.75;
            transform: rotate(-16deg) scale(0.96);
          }
          50% {
            opacity: 1;
            transform: rotate(-16deg) scale(1.06);
          }
        }

        /* --- 5. Razor-Sharp Photon Sphere Boundary --- */
        .bh-photon-ring-border {
          position: absolute;
          width: 144px;
          height: 144px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.95);
          box-shadow: 
            0 0 16px 4px rgba(192, 132, 252, 0.95),
            0 0 40px 10px rgba(59, 130, 246, 0.6);
          pointer-events: none;
          z-index: 4;
        }

        /* --- 6. Event Horizon (100% Pure Black Void) --- */
        .event-horizon-core {
          width: 140px;
          height: 140px;
          border-radius: 50%;
          background: #000000;
          position: relative;
          z-index: 5;
          box-shadow: inset 0 0 25px #000000;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.6s cubic-bezier(0.34, 1.4, 0.64, 1);
        }

        /* During Singularity: Shrink into intense pulsating white-violet pearl */
        .event-horizon-core.interactive-singularity {
          width: 38px;
          height: 38px;
          cursor: pointer;
          background: #ffffff;
          box-shadow: 
            0 0 0 3px rgba(255, 255, 255, 0.95),
            0 0 35px 12px rgba(168, 85, 247, 0.95),
            0 0 70px 25px rgba(59, 130, 246, 0.7),
            0 0 110px 45px rgba(236, 72, 153, 0.5);
          animation: singularityPulse 1.8s ease-in-out infinite;
        }

        .event-horizon-core.interactive-singularity:hover {
          transform: scale(1.35);
          box-shadow: 
            0 0 0 4px #ffffff,
            0 0 50px 18px rgba(168, 85, 247, 1),
            0 0 90px 35px rgba(59, 130, 246, 0.9),
            0 0 140px 60px rgba(236, 72, 153, 0.7);
        }

        @keyframes singularityPulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.18);
          }
        }

        .singularity-core-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ffffff;
        }

        /* Gravitational Wave Ripple */
        .singularity-wave-ripple {
          position: absolute;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 2px solid rgba(168, 85, 247, 0.75);
          animation: rippleWave 2.2s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
          pointer-events: none;
        }

        @keyframes rippleWave {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(7);
            opacity: 0;
          }
        }

        /* Big Bang Shockwave Flash */
        .big-bang-shockwave {
          position: absolute;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: radial-gradient(circle, #ffffff 0%, rgba(192, 132, 252, 0.9) 35%, rgba(59, 130, 246, 0.7) 65%, transparent 100%);
          animation: bigBangShockwaveExpand 1.2s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
          z-index: 20;
          pointer-events: none;
        }

        @keyframes bigBangShockwaveExpand {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          70% {
            transform: scale(55);
            opacity: 0.85;
          }
          100% {
            transform: scale(80);
            opacity: 0;
          }
        }

        /* Message Box */
        .singularity-message-box {
          position: absolute;
          top: 100px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
          cursor: pointer;
          user-select: none;
          animation: msgFloatIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          width: 90vw;
          max-width: 500px;
        }

        @keyframes msgFloatIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .singularity-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: #f8fafc;
          display: flex;
          align-items: center;
          gap: 8px;
          text-shadow: 0 0 16px rgba(168, 85, 247, 0.8);
        }

        .singularity-sub {
          font-size: 0.84rem;
          color: #cbd5e1;
          margin: 0;
          line-height: 1.5;
        }

        .singularity-action-pill {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(168, 85, 247, 0.3) 50%, rgba(236, 72, 153, 0.25) 100%);
          border: 1px solid rgba(168, 85, 247, 0.55);
          color: #ffffff;
          font-size: 0.82rem;
          font-weight: 600;
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
          transition: all 0.2s ease;
          animation: pulseAction 2s infinite;
        }

        .singularity-action-pill:hover {
          transform: scale(1.05);
          border-color: #ec4899;
          box-shadow: 0 0 28px rgba(236, 72, 153, 0.6);
        }

        @keyframes pulseAction {
          0%, 100% {
            box-shadow: 0 0 16px rgba(168, 85, 247, 0.35);
          }
          50% {
            box-shadow: 0 0 28px rgba(168, 85, 247, 0.7);
          }
        }
      `}</style>
    </div>
  );
}
