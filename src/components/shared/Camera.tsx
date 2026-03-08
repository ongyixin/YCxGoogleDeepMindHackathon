"use client";
// Camera component — getUserMedia, rear camera, periodic frame capture
// Shared by Story Mode (object detection) and Quest Mode (context detection)

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

/** Scan lifecycle states exposed to parent for status indicator */
export type ScanState = "idle" | "scanning" | "analyzing" | "result_updated" | "error";

/** Imperative handle — lets parent manually trigger a frame capture */
export interface CameraHandle {
  captureFrame: () => string | null;
}

export interface CameraProps {
  /** Story or Quest — affects scan indicator label only */
  mode?: "story" | "quest";
  /** Current scan lifecycle state (controlled externally) */
  scanState?: ScanState;
  /** Called with base64 JPEG on each periodic capture */
  onFrame?: (base64: string) => void;
  /** Called when camera initialization fails */
  onError?: (error: Error) => void;
  /** Capture interval in ms. Default 4000. */
  scanInterval?: number;
  /** Overlay children rendered on top of camera feed */
  children?: React.ReactNode;
  className?: string;
  /** Render as a full-screen background layer (absolute inset-0, z-0) */
  asBackground?: boolean;
  /** Session ID, passed for context; currently unused internally */
  sessionId?: string;
}

const Camera = forwardRef<CameraHandle, CameraProps>(function Camera(
  {
    mode = "story",
    scanState: _scanState,
    onFrame,
    onError,
    scanInterval = 4000,
    children,
    className = "",
    asBackground = false,
    sessionId: _sessionId,
  },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  /** Capture current video frame as base64 JPEG */
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return null;

    const maxDim = 720;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    // Strip the data URI prefix so callers get raw base64
    return dataUrl.split(",")[1] ?? null;
  }, [ready]);

  // Expose captureFrame to parent via ref
  useImperativeHandle(ref, () => ({ captureFrame }), [captureFrame]);

  // Start camera on mount
  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // "environment" is ideal for mobile rear camera but ignored gracefully
            // on desktop where only one camera exists.
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
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
          setReady(true);
        }
      } catch (err) {
        if (!active) return;
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setPermissionDenied(true);
        }
        onError?.(error);
      }
    }

    startCamera();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
  }, [onError]);

  // Periodic frame capture
  useEffect(() => {
    if (!ready || !onFrame) return;
    const id = setInterval(() => {
      const frame = captureFrame();
      if (frame) onFrame(frame);
    }, scanInterval);
    return () => clearInterval(id);
  }, [ready, onFrame, captureFrame, scanInterval]);

  if (permissionDenied) {
    return (
      <div
        className={`flex items-center justify-center bg-black text-white/60 ${className}`}
      >
        <div className="text-center px-8">
          <p className="text-base mb-2">Camera access denied</p>
          <p className="text-base text-white/40">
            Enable camera permissions and reload to play.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${asBackground ? "absolute inset-0 z-0" : ""} ${className}`}>
      <canvas ref={canvasRef} className="hidden" />
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
});

export { Camera };
export default Camera;
