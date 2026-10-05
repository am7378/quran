"use client";

import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import type { PaperShaderElement } from "@paper-design/shaders";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { SKY, isTouch } from "@/lib/motion";

/**
 * Pages two and three hero (from the provided ShaderShowcase), recoloured from
 * cyan/orange to lapis, verdigris and illumination gold. Its two gradients are stepped on here, at
 * the sky's own pace (lib/motion: fewer frames and pixels on a phone), not drawn at every frame of
 * the screen; held while `still` or the page is hidden, and taken up again from the same moment.
 */
export function NightHero({ className, still }: { className?: string; still?: boolean }) {
  const deep = useRef<PaperShaderElement>(null);
  const light = useRef<PaperShaderElement>(null);
  const stillRef = useRef(!!still);
  const sync = useRef(() => {});
  useEffect(() => {
    const { fps } = SKY();
    let raf = 0, last = 0, t = 0, prev = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      t += Math.min(100, now - prev);
      prev = now;
      if (now - last < 1000 / fps) return;
      last = now;
      deep.current?.paperShaderMount?.setFrame(t * 0.3);
      light.current?.paperShaderMount?.setFrame(t * 0.2);
    };
    const run = () => {
      const go = document.visibilityState === "visible" && !stillRef.current;
      if (go && !raf) {
        prev = performance.now();
        raf = requestAnimationFrame(step);
      } else if (!go && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    sync.current = run;
    run();
    document.addEventListener("visibilitychange", run);
    return () => {
      sync.current = () => {};
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
  useEffect(() => {
    stillRef.current = !!still;
    sync.current();
  }, [still]);
  const touch = isTouch();
  return (
    <div className={className} style={{ background: "#0b1320" }}>
      <MeshGradient
        ref={deep}
        className="absolute inset-0 h-full w-full"
        colors={["#0b1320", "#1f3a5f", "#2f5a63", "#101c2e", "#8a6d2c"]}
        distortion={0.9}
        swirl={0.25}
        speed={0}
        maxPixelCount={touch ? 480 * 300 : 720 * 450}
      />
      <MeshGradient
        ref={light}
        className="absolute inset-0 h-full w-full opacity-30 mix-blend-screen"
        colors={["#0b1320", "#cfd6d2", "#3e6b73", "#c9a24a"]}
        distortion={1}
        swirl={0.7}
        speed={0}
        scale={1.5}
        maxPixelCount={touch ? 240 * 160 : 360 * 240}
      />
    </div>
  );
}

/** The pulsing badge with orbiting text from the second hero. */
export function PulsingBadge({ text }: { text: string }) {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <PulsingBorder
        colors={["#c9a24a", "#3e6b73", "#e6cf8f", "#1f3a5f", "#efe9dd"]}
        colorBack="#00000000"
        speed={1.2}
        roundness={1}
        thickness={0.1}
        softness={0.2}
        intensity={4}
        bloom={0.3}
        spots={4}
        spotSize={0.1}
        pulse={0.1}
        smoke={0.5}
        smokeSize={4}
        scale={0.65}
        style={{ width: 60, height: 60, borderRadius: "50%" }}
      />
      <motion.svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        animate={{ rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
        style={{ scale: 1.6 }}
        aria-hidden
      >
        <defs>
          <path id="badge-circle" d="M 50, 50 m -38, 0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
        </defs>
        <text style={{ fontFamily: "var(--font-mono)", fontSize: 7.2, letterSpacing: 1.4 }} fill="rgba(239,233,221,0.8)">
          <textPath href="#badge-circle" startOffset="0%">
            {text}
          </textPath>
        </text>
      </motion.svg>
    </div>
  );
}
