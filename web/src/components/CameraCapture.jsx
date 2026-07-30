import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Image as ImageIcon, RefreshCw, SwitchCamera, X } from 'lucide-react';
import { Button, ErrorNote } from './ui';

/**
 * Live camera preview with frame capture, plus a file-picker fallback.
 *
 * Captured frames are downscaled and JPEG-encoded before upload: a modern phone
 * shoots 12MP, which is both far more detail than a vision model consumes and
 * slow to upload on mobile data. 1280px on the long edge keeps handwriting
 * legible at roughly a tenth of the bytes.
 */

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;

export function CameraCapture({ onCapture, disabled, hint }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const fileInputRef = useRef(null);

    const [active, setActive] = useState(false);
    const [error, setError] = useState(null);
    const [facing, setFacing] = useState('environment');
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    const [starting, setStarting] = useState(false);

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setActive(false);
    }, []);

    const start = useCallback(
        async (mode = facing) => {
            setError(null);
            setStarting(true);
            stop();

            if (!navigator.mediaDevices?.getUserMedia) {
                setError('This browser has no camera API. Use "Upload an image" instead.');
                setStarting(false);
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        // `ideal` rather than `exact`: a laptop with only a front
                        // camera would reject an exact environment constraint.
                        facingMode: { ideal: mode },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {
                        // Autoplay can be blocked; the poster frame still shows and
                        // the user can tap the video to start it.
                    });
                }
                setActive(true);
                setFacing(mode);

                const devices = await navigator.mediaDevices.enumerateDevices();
                setHasMultipleCameras(devices.filter((d) => d.kind === 'videoinput').length > 1);
            } catch (err) {
                const reason =
                    err?.name === 'NotAllowedError'
                        ? 'Camera permission was denied. Allow it in your browser settings, or upload an image instead.'
                        : err?.name === 'NotFoundError'
                          ? 'No camera was found on this device. Upload an image instead.'
                          : err?.message || 'Could not start the camera.';
                setError(reason);
            } finally {
                setStarting(false);
            }
        },
        [facing, stop],
    );

    // Release the camera when the component unmounts, or the indicator light
    // stays on after navigating away.
    useEffect(() => stop, [stop]);

    const encode = (source, width, height) => {
        const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);

        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
                'image/jpeg',
                JPEG_QUALITY,
            );
        });
    };

    const capture = async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) {
            setError('The camera is still warming up. Try again in a moment.');
            return;
        }
        try {
            const blob = await encode(video, video.videoWidth, video.videoHeight);
            onCapture?.(blob, URL.createObjectURL(blob));
        } catch (err) {
            setError(err.message);
        }
    };

    const pickFile = async (event) => {
        const file = event.target.files?.[0];
        // Reset so choosing the same file twice still fires a change event.
        event.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('That is not an image file.');
            return;
        }

        try {
            const bitmap = await createImageBitmap(file);
            const blob = await encode(bitmap, bitmap.width, bitmap.height);
            bitmap.close?.();
            onCapture?.(blob, URL.createObjectURL(blob));
        } catch {
            // createImageBitmap does not handle every format everywhere; the raw
            // file is still a valid upload.
            onCapture?.(file, URL.createObjectURL(file));
        }
    };

    return (
        <div className="space-y-3">
            <div className="surface relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                    style={{
                        display: active ? 'block' : 'none',
                        // Mirror the selfie camera so movement matches expectation.
                        transform: facing === 'user' ? 'scaleX(-1)' : 'none',
                    }}
                />

                {!active && (
                    <div className="text-app-muted absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                        <Camera size={34} className="opacity-40" />
                        <p className="text-sm">
                            {hint || 'Point your camera at a problem, diagram or page.'}
                        </p>
                    </div>
                )}

                {active && (
                    <>
                        {/* Framing guides: users centre the subject far better with them. */}
                        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/25" />
                        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
                            Fill the frame with the problem
                        </div>
                    </>
                )}
            </div>

            <ErrorNote error={error} />

            <div className="flex flex-wrap gap-2">
                {!active ? (
                    <Button icon={Camera} onClick={() => start()} loading={starting} disabled={disabled}>
                        Open camera
                    </Button>
                ) : (
                    <>
                        <Button icon={Camera} onClick={capture} disabled={disabled}>
                            Capture
                        </Button>
                        {hasMultipleCameras && (
                            <Button
                                variant="ghost"
                                icon={SwitchCamera}
                                onClick={() => start(facing === 'environment' ? 'user' : 'environment')}
                            >
                                Flip
                            </Button>
                        )}
                        <Button variant="ghost" icon={CameraOff} onClick={stop}>
                            Stop
                        </Button>
                    </>
                )}

                <Button variant="ghost" icon={ImageIcon} onClick={() => fileInputRef.current?.click()} disabled={disabled}>
                    Upload an image
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    // `capture` makes mobile browsers open the camera app directly.
                    capture="environment"
                    className="hidden"
                    onChange={pickFile}
                />
            </div>
        </div>
    );
}

/** Preview of a captured frame with a clear/retake affordance. */
export function CapturePreview({ url, onClear, onRetry, children }) {
    if (!url) return null;
    return (
        <div className="space-y-3">
            <div className="surface relative overflow-hidden rounded-2xl">
                <img src={url} alt="Captured frame" className="max-h-72 w-full object-contain bg-black" />
                <button
                    type="button"
                    onClick={onClear}
                    aria-label="Discard this capture"
                    className="focus-ring absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white transition-colors hover:bg-black"
                >
                    <X size={16} />
                </button>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="focus-ring absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white transition-colors hover:bg-black"
                    >
                        <RefreshCw size={13} /> Ask again
                    </button>
                )}
            </div>
            {children}
        </div>
    );
}

export default CameraCapture;
