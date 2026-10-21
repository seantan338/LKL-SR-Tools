'use client';

import { useEffect, useState, useRef } from 'react';
import styles from './CachePrefetchEngine.module.css';

/**
 * Timing notes (why these numbers):
 * -----------------------------------------------------------------------
 * The previous cut felt draggy for two concrete reasons, not just "vibes":
 *
 *  1. The comet-trail (`streamGroup`) animation started counting the moment
 *     the component mounted (t=0), but the layer that shows it stayed
 *     invisible until the "split" stage kicked in (t=450ms). So by the
 *     time you could actually see it, it was already ~50% through its own
 *     0.9s animation — you were watching the back half of a motion, which
 *     reads as "it just appeared already moving," not as a clean launch.
 *     Fix: the animation now only starts (via a class, not a base rule)
 *     the instant the "split" stage becomes visible, so you see its full
 *     arc from the first frame.
 *
 *  2. The full-screen stripe/badge state ("reveal") sat there completely
 *     static for ~700ms before "exit" began. A held, high-contrast static
 *     frame for that long reads as a stall even though nothing is broken.
 *     Fix: reveal now holds for ~450ms — long enough to register the
 *     brand badge, short enough to not feel stuck — then immediately
 *     exits.
 *
 * Total runtime dropped from ~2.4s to ~1.85s by default, with every stage
 * boundary lining up against the CSS transition/animation it triggers
 * (no dead air waiting on a timer that outlives its animation, and no
 * animation that starts before its layer is visible).
 * -----------------------------------------------------------------------
 */

export default function CachePrefetchEngine({
  onComplete,
  durationMs = 1850,
  text = '欢迎',
}) {
  const [stage, setStage] = useState('ignite');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const isFinishedRef = useRef(false);

  useEffect(() => {
    const handleFinish = () => {
      if (isFinishedRef.current) return;
      isFinishedRef.current = true;
      onCompleteRef.current?.();
    };

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      const quick = setTimeout(handleFinish, 300);
      return () => clearTimeout(quick);
    }

    // Star ignites for 350ms, then the comet launch plays for exactly the
    // 550ms window it's visible (0.55s animation, see the .module.css),
    // then a fast 100ms flash bridges into the stripe reveal, which now
    // holds only 450ms before exiting.
    const tSplit = setTimeout(() => setStage('split'), 350);
    const tFlash = setTimeout(() => setStage('flash'), 900);
    const tReveal = setTimeout(() => setStage('reveal'), 1000);
    const tExit = setTimeout(() => setStage('exit'), Math.max(1450, durationMs - 400));
    const tFinish = setTimeout(handleFinish, durationMs);

    return () => {
      clearTimeout(tSplit);
      clearTimeout(tFlash);
      clearTimeout(tReveal);
      clearTimeout(tExit);
      clearTimeout(tFinish);
    };
  }, [durationMs]);

  const showStripes = stage === 'flash' || stage === 'reveal' || stage === 'exit';
  const showFlash = stage === 'flash';
  const starVisible = stage === 'ignite';
  const showStream = stage === 'split';

  return (
    <div
      className={`${styles.overlay} ${stage === 'exit' ? styles.exit : ''}`}
      aria-hidden="true"
      role="presentation"
    >
      <div className={`${styles.stripes} ${showStripes ? styles.stripesOn : ''}`} />
      <div className={styles.halftone} />

      <div className={`${styles.streamStage} ${showStream ? styles.streamStageOn : ''}`}>
        <svg
          className={styles.streamSvg}
          viewBox="0 0 1920 1080"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* animation is gated by showStream via CSS class, not a base rule,
              so it always starts fresh the instant this layer is visible */}
          <g className={`${styles.streamGroup} ${showStream ? styles.streamGroupPlay : ''}`}>
            <g transform="translate(420, 680)">
              <polygon points="-40,0 20,-25 -800,1600 -870,1600" fill="#c8102e" opacity="0.95" />
              <polygon points="-15,0 5,-15 -820,1600 -845,1600" fill="#f5f2e9" opacity="0.95" />
              <g transform="translate(-70, -70) rotate(25, 57.5, 58.65) scale(1.15)">
                <polygon points="50,3 62,36 97,36 68,57 79,91 50,70 21,91 32,57 3,36 38,36" fill="#c8102e" />
              </g>
            </g>

            <g transform="translate(760, 480)">
              <polygon points="-55,0 30,-35 -850,1600 -930,1600" fill="#f5f2e9" opacity="0.95" />
              <polygon points="-25,0 10,-20 -875,1600 -905,1600" fill="#c8102e" opacity="0.95" />
              <g transform="translate(-70, -70) rotate(25, 65, 66.3) scale(1.3)">
                <polygon points="50,3 62,36 97,36 68,57 79,91 50,70 21,91 32,57 3,36 38,36" fill="#f5f2e9" />
              </g>
            </g>

            <g transform="translate(1180, 360)">
              <polygon points="-65,0 35,-40 -900,1600 -990,1600" fill="#c8102e" opacity="0.95" />
              <polygon points="-30,0 15,-25 -930,1600 -970,1600" fill="#f5f2e9" opacity="0.95" />
              <g transform="translate(-70, -70) rotate(25, 70, 71.4) scale(1.4)">
                <polygon points="50,3 62,36 97,36 68,57 79,91 50,70 21,91 32,57 3,36 38,36" fill="#c8102e" />
              </g>
            </g>

            <g transform="translate(1450, 620)">
              <polygon points="-50,0 25,-30 -840,1600 -910,1600" fill="#f5f2e9" opacity="0.9" />
              <g transform="translate(-70, -70) rotate(25, 60, 61.2) scale(1.2)">
                <polygon points="50,3 62,36 97,36 68,57 79,91 50,70 21,91 32,57 3,36 38,36" fill="#f5f2e9" />
              </g>
            </g>
          </g>
        </svg>
      </div>

      <div className={`${styles.flash} ${showFlash ? styles.flashOn : ''}`} />

      <svg
        className={`${styles.star} ${starVisible ? '' : styles.starGone}`}
        viewBox="0 0 100 95"
        role="presentation"
      >
        <polygon points="50,3 62,36 97,36 68,57 79,91 50,70 21,91 32,57 3,36 38,36" />
      </svg>

      <div
        className={`${styles.badge} ${stage === 'reveal' || stage === 'exit' ? styles.badgeVisible : ''}`}
      >
        <span className={styles.badgeDot}></span>
        <span>{text}</span>
      </div>
    </div>
  );
}