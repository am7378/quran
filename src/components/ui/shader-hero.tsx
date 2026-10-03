"use client";

import { MeshGradient } from "@paper-design/shaders-react";

/**
 * Page one hero (from the provided shader-hero), recoloured to a light
 * limestone-and-mist palette. The original's wireframe pass is recreated as a
 * second, translucent mesh moving at a different speed.
 */
export function LightHero({ className }: { className?: string }) {
  return (
    <div className={className} style={{ background: "#f2f1ec" }}>
      <MeshGradient
        className="absolute inset-0 h-full w-full"
        colors={["#f3f2ec", "#cdd7d2", "#a7bbb7", "#ffffff", "#e7dcc2"]}
        distortion={0.85}
        swirl={0.15}
        speed={0.25}
        maxPixelCount={720 * 450}
      />
      <MeshGradient
        className="absolute inset-0 h-full w-full opacity-40 mix-blend-soft-light"
        colors={["#ffffff", "#9fb1b0", "#f2f1ec"]}
        distortion={1}
        swirl={0.6}
        speed={0.15}
        scale={1.6}
        maxPixelCount={360 * 240}
      />
    </div>
  );
}
