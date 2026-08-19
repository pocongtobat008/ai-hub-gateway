"use client";

import { useCallback, useEffect, useRef } from "react";

type ConfettiPiece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  gravity: number;
  drag: number;
};

const COLORS = [
  "#292524", "#57534e", "#78716c", "#a8a29e", "#d6d3d1",
  "#1c1917", "#44403c", "#78716c", "#e7e5e4", "#fafaf9",
];

function createPiece(canvasWidth: number, canvasHeight: number): ConfettiPiece {
  const angle = Math.random() * Math.PI * 2;
  const velocity = 8 + Math.random() * 12;
  return {
    x: canvasWidth / 2 + (Math.random() - 0.5) * canvasWidth * 0.6,
    y: canvasHeight / 2 - 50,
    vx: Math.cos(angle) * velocity * (0.5 + Math.random()),
    vy: Math.sin(angle) * velocity * 0.8 - 4,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 15,
    width: 6 + Math.random() * 6,
    height: 4 + Math.random() * 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    opacity: 1,
    gravity: 0.15 + Math.random() * 0.1,
    drag: 0.98 + Math.random() * 0.015,
  };
}

export function Confetti({ active, onComplete }: { active: boolean; onComplete?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<ConfettiPiece[]>([]);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const startConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Create pieces
    piecesRef.current = Array.from({ length: 80 }, () => createPiece(canvas.width, canvas.height));
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = 0;

      for (const piece of piecesRef.current) {
        if (piece.opacity <= 0) continue;
        alive++;

        // Physics
        piece.vy += piece.gravity;
        piece.vx *= piece.drag;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.rotationSpeed;

        // Fade out after 1.5s
        if (elapsed > 1500) {
          piece.opacity -= 0.02;
        }

        // Draw
        ctx.save();
        ctx.globalAlpha = Math.max(0, piece.opacity);
        ctx.translate(piece.x, piece.y);
        ctx.rotate((piece.rotation * Math.PI) / 180);
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        ctx.restore();
      }

      if (alive > 0 && elapsed < 4000) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onComplete?.();
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [onComplete]);

  useEffect(() => {
    if (active) {
      startConfetti();
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [active, startConfetti]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}

// Singleton hook for triggering confetti from anywhere
let globalConfettiCallback: (() => void) | null = null;

export function triggerConfetti() {
  globalConfettiCallback?.();
}

export function ConfettiProvider({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<ConfettiPiece[]>([]);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const startConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    piecesRef.current = Array.from({ length: 80 }, () => createPiece(canvas.width, canvas.height));
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = 0;

      for (const piece of piecesRef.current) {
        if (piece.opacity <= 0) continue;
        alive++;

        piece.vy += piece.gravity;
        piece.vx *= piece.drag;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.rotationSpeed;

        if (elapsed > 1500) {
          piece.opacity -= 0.02;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, piece.opacity);
        ctx.translate(piece.x, piece.y);
        ctx.rotate((piece.rotation * Math.PI) / 180);
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        ctx.restore();
      }

      if (alive > 0 && elapsed < 4000) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    globalConfettiCallback = startConfetti;
    return () => {
      globalConfettiCallback = null;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [startConfetti]);

  return (
    <>
      {children}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-[100]"
        style={{ width: "100vw", height: "100vh" }}
      />
    </>
  );
}
