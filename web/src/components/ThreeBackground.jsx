import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';

/**
 * Ambient 3D backdrop.
 *
 * Two problems in the original: `useFrame` dereferenced `meshRef.current`
 * without a guard, which throws on the first frame before the mesh mounts, and
 * the canvas ran at full device pixel ratio with 5000 stars on every page —
 * enough GPU work to make the rest of the UI stutter on integrated graphics.
 */

function Crystal() {
    const meshRef = useRef();

    useFrame((_, delta) => {
        if (!meshRef.current) return;
        meshRef.current.rotation.x += delta * 0.18;
        meshRef.current.rotation.y += delta * 0.1;
    });

    return (
        <Float speed={1.4} rotationIntensity={0.9} floatIntensity={1.6}>
            <mesh ref={meshRef}>
                <octahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color="#6d28d9" wireframe />
            </mesh>
        </Float>
    );
}

export const ThreeBackground = () => {
    // Skip the canvas entirely for users who asked for reduced motion, and drop
    // the star count on small screens where the GPU is usually weakest.
    const config = useMemo(() => {
        if (typeof window === 'undefined') return { render: false, stars: 0 };
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        return { render: !reduceMotion, stars: window.innerWidth < 768 ? 900 : 2200 };
    }, []);

    if (!config.render) return null;

    return (
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-25" aria-hidden="true">
            <Canvas
                camera={{ position: [0, 0, 5] }}
                dpr={[1, 1.5]}
                gl={{ antialias: false, powerPreference: 'low-power' }}
            >
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />
                <Stars
                    radius={100}
                    depth={50}
                    count={config.stars}
                    factor={4}
                    saturation={0}
                    fade
                    speed={0.8}
                />
                <Crystal />
            </Canvas>
        </div>
    );
};

export default ThreeBackground;
