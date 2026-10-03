"use client";

import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import { motion } from "framer-motion";

/**
 * Pages two and three hero (from the provided ShaderShowcase), recoloured from
 * cyan/orange to lapis, verdigris and illumination gold.
 */
export function NightHero({ className, still }: { className?: string; still?: boolean }) {
  return (
    <div className={className} style={{ background: "#0b1320" }}>
      <MeshGradient
        className="absolute inset-0 h-full w-full"
        colors={["#0b1320", "#1f3a5f", "#2f5a63", "#101c2e", "#8a6d2c"]}
        distortion={0.9}
        swirl={0.25}
        speed={still ? 0 : 0.3}
        maxPixelCount={720 * 450}
      />
      <MeshGradient
        className="absolute inset-0 h-full w-full opacity-30 mix-blend-screen"
        colors={["#0b1320", "#cfd6d2", "#3e6b73", "#c9a24a"]}
        distortion={1}
        swirl={0.7}
        speed={still ? 0 : 0.2}
        scale={1.5}
        maxPixelCount={360 * 240}
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
