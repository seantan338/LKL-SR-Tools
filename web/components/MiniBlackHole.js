'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * MiniBlackHole - A realistic, inward-swirling gravitational singularity in the Settings Page background.
 * Uses logarithmic spiral streams and continuous inward-collapsing suction rings to eliminate the flat "CD" look.
 * Clicking it 5 times consecutively triggers the full-page Black Hole Event Horizon vortex collapse.
 */
export default function MiniBlackHole() {
  const [clickCount, setClickCount] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);
  const [isGeminiTheme, setIsGeminiTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 
                          localStorage.getItem('talent_flow_theme');
      return activeTheme === 'gemini';
    }
    return false;
  });
  const resetTimerRef = useRef(null);

  // Strictly bind easter egg visibility to Gemini Cosmic theme
  useEffect(() => {
    const checkTheme = () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 
                          (typeof window !== 'undefined' ? localStorage.getItem('talent_flow_theme') : null) || 
                          'dark';
      const isGemini = activeTheme === 'gemini';
      setIsGeminiTheme(isGemini);
      if (!isGemini) {
        setClickCount(0);
      }
    };

    checkTheme();
    window.addEventListener('themechange', checkTheme);

    // Watch for dynamic attribute changes on <html>
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          checkTheme();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      window.removeEventListener('themechange', checkTheme);
      observer.disconnect();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  // Synthesize a sci-fi gravitational resonance chirp on each click using Web Audio API
  const playGravitationalBlip = (stage) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      // Incremental rising pitches: 180Hz -> 260Hz -> 360Hz -> 480Hz -> 650Hz
      const pitches = [180, 260, 360, 480, 650];
      const baseFreq = pitches[Math.min(stage - 1, 4)] || 220;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.6, now + 0.12);

      gain.gain.setValueAtTime(0.09 + stage * 0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {
      // Gracefully ignore audio blockers
    }
  };

  const handleMiniBlackHoleClick = (e) => {
    e.stopPropagation();

    // Trigger local inward suction pulse animation
    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 320);

    const nextCount = clickCount + 1;
    setClickCount(nextCount);
    playGravitationalBlip(nextCount);

    // Clear previous inactivity timeout
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    // 5 consecutive clicks -> Trigger full black hole collapse!
    if (nextCount >= 5) {
      setClickCount(0);
      if (typeof window !== 'undefined' && window.blackhole) {
        window.blackhole();
      }
      return;
    }

    // Reset back to 0 if idle for 3 seconds
    resetTimerRef.current = setTimeout(() => {
      setClickCount(0);
    }, 3000);
  };

  // If not in Gemini Cosmic theme, do not render this easter egg at all
  if (!isGeminiTheme) {
    return null;
  }

  return (
    <div 
      className={`mini-black-hole-anchor ${isPulsing ? 'is-pulsing' : ''} clicks-${clickCount}`}
      onClick={handleMiniBlackHoleClick}
      title={clickCount > 0 ? `时空曲率: ${clickCount * 20}%` : '时空微透镜'}
      aria-label="Gravitational Microlensing Anomaly"
    >
      {/* 1. Inward Continuous Gravitational Suction Rings (Continuous Collapse Motion) */}
      <div className="inward-suction-ring ring-1"></div>
      <div className="inward-suction-ring ring-2"></div>
      <div className="inward-suction-ring ring-3"></div>

      {/* 2. Gravitational Lensing Halo (Interstellar vertical light bending arc) */}
      <div className="lensing-halo-warp"></div>

      {/* 3. Spiral Accretion Vortex (3-Arm Logarithmic Inward Whirlpool Streams) */}
      <div className="accretion-spiral-container">
        <svg viewBox="0 0 100 100" className="spiral-svg">
          <defs>
            <linearGradient id="spiralGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
              <stop offset="45%" stopColor="#a855f7" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="spiralGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
              <stop offset="50%" stopColor="#c084fc" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Logarithmic Spiral Arm 1 */}
          <path 
            d="M 94.0 50.0 L 90.66 63.21 L 83.57 74.39 L 73.66 82.56 L 62.05 87.09 L 50.0 87.75 L 38.72 84.71 L 29.28 78.52 L 22.49 69.98 L 18.85 60.12 L 18.5 50.0 L 21.23 40.65 L 26.54 32.95 L 33.69 27.55 L 41.81 24.8 L 50.0 24.75 L 57.42 27.17 L 63.37 31.59 L 67.39 37.36 L 69.26 43.74 L 69.0 50.0 L 66.88 55.49 L 63.35 59.7 L 58.96 62.34 L 54.33 63.31" 
            fill="none" 
            stroke="url(#spiralGrad1)" 
            strokeWidth="1.8" 
            strokeLinecap="round"
          />

          {/* Logarithmic Spiral Arm 2 */}
          <path 
            d="M 28.0 88.11 L 18.23 78.61 L 12.09 66.88 L 9.97 54.21 L 11.85 41.89 L 17.31 31.13 L 25.58 22.88 L 35.66 17.8 L 46.45 16.19 L 56.81 17.97 L 65.75 22.72 L 72.48 29.76 L 76.49 38.2 L 77.6 47.1 L 75.92 55.51 L 71.87 62.62 L 66.06 67.84 L 59.25 70.78 L 52.25 71.38 L 45.79 69.81 L 40.5 66.45 L 36.81 61.88 L 34.93 56.71 L 34.83 51.59 L 36.31 47.09" 
            fill="none" 
            stroke="url(#spiralGrad2)" 
            strokeWidth="1.6" 
            strokeLinecap="round"
          />

          {/* Logarithmic Spiral Arm 3 */}
          <path 
            d="M 28.0 11.89 L 41.11 8.18 L 54.34 8.73 L 66.37 13.23 L 76.1 21.02 L 82.69 31.12 L 85.7 42.41 L 85.06 53.68 L 81.06 63.83 L 74.34 71.91 L 65.75 77.28 L 56.29 79.59 L 46.97 78.84 L 38.71 75.35 L 32.27 69.69 L 28.13 62.62 L 26.52 54.99 L 27.37 47.62 L 30.36 41.26 L 34.95 36.45 L 40.5 33.55 L 46.31 32.64 L 51.72 33.59 L 56.2 36.07 L 59.37 39.6" 
            fill="none" 
            stroke="url(#spiralGrad1)" 
            strokeWidth="1.4" 
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* 4. Tilted 3D Relativistic Accretion Disc (Breaks flat 2D CD appearance) */}
      <div className="tilted-plasma-disk"></div>

      {/* 5. Razor-Sharp Photon Sphere Boundary */}
      <div className="photon-ring-border"></div>

      {/* 6. Central Pitch-Black Event Horizon (100% Pure Void, Absorbing All Light) */}
      <div className="mini-event-horizon"></div>

      {/* 7. Dynamic Click Shockwave Wave */}
      {isPulsing && <div className="mini-click-wave"></div>}

      {/* 8. Subtle Charging Energy Particles for consecutive clicks */}
      {clickCount > 0 && (
        <div className="mini-charge-indicator">
          {Array.from({ length: 5 }).map((_, i) => (
            <span 
              key={i} 
              className={`charge-dot ${i < clickCount ? 'active' : ''}`}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        .mini-black-hole-anchor {
          position: absolute;
          top: 32px;
          left: 24px;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          user-select: none;
          z-index: 10;
          opacity: 0.35;
          filter: brightness(0.78) saturate(0.88);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .mini-black-hole-anchor:hover {
          opacity: 0.95;
          filter: brightness(1.12) saturate(1.2);
          transform: scale(1.12);
        }

        .mini-black-hole-anchor.is-pulsing {
          transform: scale(0.85);
        }

        /* Incremental awakening when clicked */
        .mini-black-hole-anchor.clicks-1 { opacity: 0.50; filter: brightness(0.88); }
        .mini-black-hole-anchor.clicks-2 { opacity: 0.65; filter: brightness(1.0); }
        .mini-black-hole-anchor.clicks-3 { opacity: 0.82; filter: brightness(1.12); }
        .mini-black-hole-anchor.clicks-4 { opacity: 1.0; filter: brightness(1.25); }

        /* --- 1. Continuous Inward Gravitational Suction Rings --- */
        .inward-suction-ring {
          position: absolute;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 1px solid transparent;
          border-top-color: rgba(168, 85, 247, 0.4);
          border-right-color: rgba(59, 130, 246, 0.35);
          border-bottom-color: rgba(236, 72, 153, 0.28);
          box-shadow: 0 0 5px rgba(168, 85, 247, 0.2);
          pointer-events: none;
        }

        .ring-1 {
          animation: inwardSuctionFlow 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .ring-2 {
          animation: inwardSuctionFlow 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          animation-delay: -0.85s;
        }

        .ring-3 {
          animation: inwardSuctionFlow 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          animation-delay: -1.7s;
        }

        @keyframes inwardSuctionFlow {
          0% {
            transform: scale(1.6) rotate(0deg);
            opacity: 0;
            filter: blur(3px);
          }
          30% {
            opacity: 0.65;
          }
          70% {
            opacity: 0.5;
            filter: blur(1.5px);
          }
          100% {
            transform: scale(0.55) rotate(300deg);
            opacity: 0;
            filter: blur(0px);
          }
        }

        /* --- 2. Lensing Halo (Interstellar Light-Bending Arc) --- */
        .lensing-halo-warp {
          position: absolute;
          width: 28px;
          height: 44px;
          border-radius: 50%;
          border: 1.5px solid transparent;
          border-top: 2px solid rgba(236, 72, 153, 0.45);
          border-bottom: 2px solid rgba(59, 130, 246, 0.45);
          filter: blur(2px);
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.35);
          animation: haloBreathing 3.8s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes haloBreathing {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.08) rotate(8deg);
            opacity: 0.85;
          }
        }

        /* --- 3. Spiral Accretion Vortex (SVG Whirlpool) --- */
        .accretion-spiral-container {
          position: absolute;
          width: 54px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .spiral-svg {
          width: 54px;
          height: 54px;
          animation: whirlpoolDrain 3.8s linear infinite;
          filter: drop-shadow(0 0 4px rgba(168, 85, 247, 0.4));
          opacity: 0.75;
          transition: all 0.4s ease;
        }

        .mini-black-hole-anchor:hover .spiral-svg {
          animation-duration: 1.8s;
          filter: drop-shadow(0 0 8px rgba(236, 72, 153, 0.85));
          opacity: 1;
        }

        @keyframes whirlpoolDrain {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* --- 4. Tilted 3D Relativistic Accretion Disk --- */
        .tilted-plasma-disk {
          position: absolute;
          width: 46px;
          height: 25px;
          border-radius: 50%;
          background: radial-gradient(
            ellipse at center,
            transparent 28%,
            rgba(168, 85, 247, 0.3) 52%,
            rgba(59, 130, 246, 0.22) 75%,
            transparent 100%
          );
          filter: blur(2.5px);
          transform: rotate(-18deg);
          pointer-events: none;
          animation: tiltedDiscPulsar 4s ease-in-out infinite;
        }

        @keyframes tiltedDiscPulsar {
          0%, 100% {
            opacity: 0.55;
            transform: rotate(-18deg) scale(0.96);
          }
          50% {
            opacity: 0.8;
            transform: rotate(-18deg) scale(1.06);
          }
        }

        /* --- 5. Photon Ring (Razor-thin luminous event horizon edge) --- */
        .photon-ring-border {
          position: absolute;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.45);
          box-shadow: 
            0 0 5px 1px rgba(192, 132, 252, 0.45),
            0 0 10px 2px rgba(59, 130, 246, 0.3);
          pointer-events: none;
          z-index: 4;
          transition: all 0.4s ease;
        }

        .mini-black-hole-anchor:hover .photon-ring-border {
          border-color: rgba(255, 255, 255, 0.85);
          box-shadow: 
            0 0 8px 2px rgba(192, 132, 252, 0.9),
            0 0 16px 4px rgba(59, 130, 246, 0.55);
        }

        /* --- 6. Event Horizon (100% Pure Black Void, Absolute Darkness) --- */
        .mini-event-horizon {
          position: relative;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #000000;
          box-shadow: inset 0 0 6px #000000;
          z-index: 5;
          pointer-events: none;
        }

        /* --- 7. Click Inward Gravitational Shockwave --- */
        .mini-click-wave {
          position: absolute;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid rgba(236, 72, 153, 0.9);
          animation: clickShockwave 0.35s ease-out forwards;
          pointer-events: none;
          z-index: 6;
        }

        @keyframes clickShockwave {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(3.5);
            opacity: 0;
          }
        }

        /* --- 8. Energy charging dots --- */
        .mini-charge-indicator {
          position: absolute;
          bottom: -14px;
          display: flex;
          gap: 3px;
          pointer-events: none;
        }

        .charge-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.2s ease;
        }

        .charge-dot.active {
          background: #c084fc;
          box-shadow: 0 0 6px #c084fc;
          transform: scale(1.3);
        }

        @media (max-width: 1024px) {
          .mini-black-hole-anchor {
            left: 12px;
            top: 16px;
            transform: scale(0.85);
          }
        }
      `}</style>
    </div>
  );
}
