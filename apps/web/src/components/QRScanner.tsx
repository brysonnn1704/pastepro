import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, X } from 'lucide-react';
import { Button } from './Button';

interface ScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animId: number;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          requestAnimationFrame(tick);
        }
      } catch (err) {
        setError('Camera permission denied or not available. Please enter the short code manually.');
      }
    }

    function tick() {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.height = videoRef.current.videoHeight;
            canvas.width = videoRef.current.videoWidth;
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });
            if (code && code.data) {
              onScan(code.data);
              return;
            }
          }
        }
      }
      animId = requestAnimationFrame(tick);
    }

    startCamera();

    return () => {
      cancelAnimationFrame(animId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface rounded-xl overflow-hidden shadow-lg border border-default flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-default">
          <div className="flex items-center gap-2 font-medium">
            <Camera className="w-5 h-5 text-accent" />
            <span>Scan PC QR Code</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 text-secondary hover:text-primary rounded-md"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative aspect-square bg-black flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="p-6 text-center text-danger text-sm">
              <p>{error}</p>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-8 border-2 border-accent/80 rounded-lg pointer-events-none" />
            </>
          )}
        </div>

        <div className="p-4 bg-surface-elevated text-center">
          <Button variant="secondary" size="md" className="w-full" onClick={onClose}>
            Enter Code Instead
          </Button>
        </div>
      </div>
    </div>
  );
}
