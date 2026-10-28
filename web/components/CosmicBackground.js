'use client';

import { useEffect, useRef, useState } from 'react';

export default function CosmicBackground() {
  const canvasRef = useRef(null);
  const [theme, setTheme] = useState('dark');

  // Track global theme
  useEffect(() => {
    const checkTheme = () => {
      const active = document.documentElement.getAttribute('data-theme') || 
                     (typeof window !== 'undefined' ? localStorage.getItem('talent_flow_theme') : null) || 
                     'dark';
      setTheme(active);
    };

    checkTheme();
    window.addEventListener('themechange', checkTheme);
    return () => window.removeEventListener('themechange', checkTheme);
  }, []);

  useEffect(() => {
    if (theme !== 'gemini') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Check reduced motion
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Handle viewport resize with retina resolution support
    const handleResize = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // ==========================================
    // 1. Multi-Layer Twinkling Cosmic Stars
    // ==========================================
    const STAR_COUNT = Math.min(150, Math.floor((width * height) / 10000));
    const starPalette = [
      { r: 255, g: 255, b: 255 }, // 60% Diamond White
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 255, b: 255 },
      { r: 125, g: 211, b: 252 }, // 20% Sapphire Blue
      { r: 192, g: 132, b: 252 }, // 15% Starlight Purple
      { r: 251, g: 207, b: 232 }, // 5% Nebula Rose
    ];

    const stars = Array.from({ length: STAR_COUNT }, () => {
      const color = starPalette[Math.floor(Math.random() * starPalette.length)];
      const isBright = Math.random() < 0.08; // 8% have starburst cross flair
      const depth = Math.random(); // 0 (far) to 1 (near)
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        baseRadius: isBright ? 1.6 + Math.random() * 0.8 : 0.4 + depth * 1.1,
        color: `rgb(${color.r}, ${color.g}, ${color.b})`,
        colorObj: color,
        alpha: 0.2 + Math.random() * 0.6,
        baseAlpha: 0.2 + Math.random() * 0.6,
        twinkleSpeed: 0.015 + Math.random() * 0.03,
        twinklePhase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * (0.02 + depth * 0.05),
        driftY: (Math.random() - 0.5) * (0.02 + depth * 0.05),
        isBright
      };
    });

    // ==========================================
    // 2. Periodic Shooting Stars (流星 / Meteor Trails)
    // ==========================================
    let meteors = [];
    let lastMeteorTime = performance.now();
    let nextMeteorDelay = 5000 + Math.random() * 6000; // 5-11 seconds

    const spawnMeteor = () => {
      const angle = (Math.PI / 4) + (Math.random() - 0.5) * 0.2; // ~45 deg diagonal
      const speed = 10 + Math.random() * 6;
      const length = 140 + Math.random() * 100;
      meteors.push({
        x: Math.random() * (width * 0.75),
        y: Math.random() * (height * 0.35),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length,
        life: 1.0,
        decay: 0.014 + Math.random() * 0.008,
        color: Math.random() > 0.4 ? 'rgba(192, 132, 252,' : 'rgba(125, 211, 252,'
      });
    };

    // ==========================================
    // 3. Animation Loop
    // ==========================================
    const render = (time) => {
      if (document.hidden) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // --- Draw Soft Breathing Nebulae (Cosmic Dust Clouds) ---
      const breathe1 = Math.sin(time * 0.0004) * 0.03;
      const breathe2 = Math.cos(time * 0.00035) * 0.03;

      // Top-Left Sapphire Glow
      const g1 = ctx.createRadialGradient(width * 0.15, height * 0.1, 0, width * 0.15, height * 0.1, width * 0.4);
      g1.addColorStop(0, `rgba(59, 130, 246, ${0.12 + breathe1})`);
      g1.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      // Top-Right Cosmic Violet Glow
      const g2 = ctx.createRadialGradient(width * 0.85, height * 0.15, 0, width * 0.85, height * 0.15, width * 0.45);
      g2.addColorStop(0, `rgba(168, 85, 247, ${0.12 + breathe2})`);
      g2.addColorStop(1, 'rgba(168, 85, 247, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, width, height);

      // Bottom-Center Nebula Magenta
      const g3 = ctx.createRadialGradient(width * 0.5, height * 0.9, 0, width * 0.5, height * 0.9, width * 0.38);
      g3.addColorStop(0, `rgba(236, 72, 153, ${0.08 - breathe1})`);
      g3.addColorStop(1, 'rgba(236, 72, 153, 0)');
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, width, height);

      // --- Draw & Update Stars ---
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        if (!prefersReducedMotion) {
          s.twinklePhase += s.twinkleSpeed;
          s.alpha = s.baseAlpha + Math.sin(s.twinklePhase) * 0.35;
          s.alpha = Math.max(0.1, Math.min(1, s.alpha));

          s.x += s.driftX;
          s.y += s.driftY;

          // Wrap around screen edges smoothly
          if (s.x < 0) s.x = width;
          else if (s.x > width) s.x = 0;
          if (s.y < 0) s.y = height;
          else if (s.y > height) s.y = 0;
        }

        // Draw Star Dot
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.colorObj.r}, ${s.colorObj.g}, ${s.colorObj.b}, ${s.alpha})`;
        ctx.fill();

        // Starburst Cross Flare for Brightest Stars
        if (s.isBright && s.alpha > 0.55) {
          const flareLen = s.baseRadius * 4;
          const flareAlpha = (s.alpha - 0.4) * 0.6;
          ctx.strokeStyle = `rgba(${s.colorObj.r}, ${s.colorObj.g}, ${s.colorObj.b}, ${flareAlpha})`;
          ctx.lineWidth = 0.75;

          ctx.beginPath();
          ctx.moveTo(s.x - flareLen, s.y);
          ctx.lineTo(s.x + flareLen, s.y);
          ctx.moveTo(s.x, s.y - flareLen);
          ctx.lineTo(s.x, s.y + flareLen);
          ctx.stroke();
        }
      }

      // --- Update & Draw Meteors (Shooting Stars) ---
      if (!prefersReducedMotion) {
        if (time - lastMeteorTime > nextMeteorDelay) {
          spawnMeteor();
          lastMeteorTime = time;
          nextMeteorDelay = 6000 + Math.random() * 8000;
        }

        for (let m = meteors.length - 1; m >= 0; m--) {
          const meteor = meteors[m];
          meteor.x += meteor.vx;
          meteor.y += meteor.vy;
          meteor.life -= meteor.decay;

          if (meteor.life <= 0 || meteor.x > width || meteor.y > height) {
            meteors.splice(m, 1);
            continue;
          }

          // Draw Meteor Tail Gradient
          const tailX = meteor.x - (meteor.vx / Math.hypot(meteor.vx, meteor.vy)) * meteor.length;
          const tailY = meteor.y - (meteor.vy / Math.hypot(meteor.vx, meteor.vy)) * meteor.length;

          const mGrad = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
          mGrad.addColorStop(0, `rgba(255, 255, 255, ${meteor.life * 0.95})`);
          mGrad.addColorStop(0.3, `${meteor.color} ${meteor.life * 0.7})`);
          mGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');

          ctx.strokeStyle = mGrad;
          ctx.lineWidth = 1.6 * meteor.life;
          ctx.lineCap = 'round';

          ctx.beginPath();
          ctx.moveTo(meteor.x, meteor.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();

          // Bright Meteor Head
          ctx.beginPath();
          ctx.arc(meteor.x, meteor.y, 1.8 * meteor.life, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${meteor.life})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#c084fc';
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [theme]);

  if (theme === 'tactical') {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '12px',
          right: '18px',
          pointerEvents: 'none',
          zIndex: 9991,
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          fontSize: '10px',
          letterSpacing: '0.12em',
          color: '#4b6b58',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          userSelect: 'none',
          opacity: 0.85
        }}
      >
        <span style={{ width: '6px', height: '6px', background: '#10b981', boxShadow: '0 0 6px #10b981', display: 'inline-block' }} />
        <span>HUD.C4ISR // GRID: 32PX // STATUS: LOCKED</span>
      </div>
    );
  }

  if (theme !== 'gemini') return null;

  return (
    <canvas
      ref={canvasRef}
      className="cosmic-canvas"
      aria-hidden="true"
    />
  );
}
