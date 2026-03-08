"use client";

/**
 * useFrontCamera — opens a secondary front-facing camera stream.
 *
 * Designed to run alongside the existing rear-camera in Camera.tsx.
 * Returns a videoRef to mount on a <video> element plus a captureFrame
 * helper that encodes the current frame as a raw base64 JPEG string.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseFrontCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isReady: boolean;
  error: string | null;
  captureFrame: () => string | null;
}

export function useFrontCamera(): UseFrontCameraReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // "user" is ideal for mobile front camera; on desktop this is simply
            // the webcam, so treat it as ideal rather than required.
            facingMode: { ideal: "user" },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (active) setIsReady(true);
        }
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof Error ? err.message : "Front camera unavailable";
        setError(msg);
        console.warn("[useFrontCamera]", msg);
      }
    }

    start();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIsReady(false);
    };
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isReady) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Mirror the image so it feels natural as a selfie
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return dataUrl.split(",")[1] ?? null;
  }, [isReady]);

  return { videoRef, canvasRef, isReady, error, captureFrame };
}
