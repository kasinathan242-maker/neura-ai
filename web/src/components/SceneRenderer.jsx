import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, Html, Line, OrbitControls, PerspectiveCamera, Text } from '@react-three/drei';
import { XR } from '@react-three/xr';
import * as THREE from 'three';
import { xrStore } from '../lib/xrStore';

/**
 * Renders a scene specification produced by the API into interactive 3D,
 * viewable on screen or in AR/VR through WebXR.
 *
 * The model never sends code — only a validated JSON description of primitives,
 * positions and links. Mapping that description to geometry here means a bad or
 * adversarial generation can at worst produce an odd-looking diagram, never
 * execute anything.
 */

const GEOMETRY = {
    box: () => <boxGeometry args={[1, 1, 1]} />,
    sphere: () => <sphereGeometry args={[0.5, 32, 32]} />,
    cylinder: () => <cylinderGeometry args={[0.5, 0.5, 1, 32]} />,
    cone: () => <coneGeometry args={[0.5, 1, 32]} />,
    torus: () => <torusGeometry args={[0.5, 0.18, 20, 48]} />,
    plane: () => <planeGeometry args={[1, 1]} />,
    tetrahedron: () => <tetrahedronGeometry args={[0.6]} />,
    octahedron: () => <octahedronGeometry args={[0.6]} />,
    icosahedron: () => <icosahedronGeometry args={[0.6]} />,
    capsule: () => <capsuleGeometry args={[0.3, 0.6, 8, 20]} />,
    ring: () => <ringGeometry args={[0.3, 0.5, 40]} />,
};

function SceneObject({ spec, onSelect, selected, showLabels }) {
    const meshRef = useRef();

    useFrame((_, delta) => {
        // Guard the ref: useFrame can run before the mesh mounts, which is what
        // made the original background component throw on first paint.
        if (meshRef.current && spec.spin) {
            meshRef.current.rotation.y += delta * spec.spin;
        }
    });

    if (spec.type === 'text') {
        return (
            <Text
                position={spec.position}
                rotation={spec.rotation}
                fontSize={0.28 * (spec.scale?.[0] || 1)}
                color={spec.color}
                anchorX="center"
                anchorY="middle"
                maxWidth={4}
            >
                {spec.label || ''}
            </Text>
        );
    }

    const geometry = GEOMETRY[spec.type] || GEOMETRY.box;

    return (
        <group position={spec.position}>
            <mesh
                ref={meshRef}
                rotation={spec.rotation}
                scale={spec.scale}
                castShadow
                receiveShadow
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect?.(spec);
                }}
                onPointerOver={(event) => {
                    event.stopPropagation();
                    document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                    document.body.style.cursor = 'auto';
                }}
            >
                {geometry()}
                <meshStandardMaterial
                    color={spec.color}
                    transparent={spec.opacity < 1}
                    opacity={spec.opacity}
                    metalness={spec.metalness}
                    roughness={spec.roughness}
                    emissive={selected ? spec.color : '#000000'}
                    emissiveIntensity={selected ? 0.45 : 0}
                    side={spec.type === 'plane' || spec.type === 'ring' ? THREE.DoubleSide : THREE.FrontSide}
                />
            </mesh>

            {showLabels && spec.label && (
                <Html
                    position={[0, (spec.scale?.[1] || 1) * 0.62 + 0.18, 0]}
                    center
                    distanceFactor={9}
                    // Labels must not swallow clicks meant for the geometry.
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                    <div className="whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        {spec.label}
                    </div>
                </Html>
            )}
        </group>
    );
}

function Connection({ from, to, label, objects }) {
    const points = useMemo(() => {
        const a = objects.find((o) => o.id === from);
        const b = objects.find((o) => o.id === to);
        if (!a || !b) return null;
        return [new THREE.Vector3(...a.position), new THREE.Vector3(...b.position)];
    }, [from, to, objects]);

    if (!points) return null;

    const midpoint = points[0].clone().lerp(points[1], 0.5);

    return (
        <>
            <Line points={points} color="#64748b" lineWidth={1.4} dashed dashSize={0.14} gapSize={0.09} />
            {label && (
                <Html position={midpoint} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
                    <div className="whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {label}
                    </div>
                </Html>
            )}
        </>
    );
}

function SceneContents({ scene, onSelect, selectedId, showLabels, showGrid }) {
    return (
        <>
            {/*
              Explicit three-point lighting rather than drei's <Environment
              preset>. The presets fetch (and bundle) multi-megabyte HDRI room
              assets -- they added ~13MB to the build for a visual difference
              nobody would notice on a diagram of coloured primitives.
            */}
            <ambientLight intensity={0.75} />
            <hemisphereLight args={['#a5b4fc', '#1e293b', 0.5]} />
            <directionalLight position={[6, 10, 6]} intensity={1.2} castShadow />
            <directionalLight position={[-6, 4, -6]} intensity={0.45} color="#818cf8" />
            <directionalLight position={[0, -4, 4]} intensity={0.22} color="#f472b6" />

            {showGrid && scene.grid && (
                <Grid
                    args={[24, 24]}
                    position={[0, -0.01, 0]}
                    cellColor="#1e293b"
                    sectionColor="#334155"
                    fadeDistance={26}
                    fadeStrength={1.4}
                    infiniteGrid
                />
            )}

            {scene.connections?.map((connection, index) => (
                <Connection
                    key={`${connection.from}-${connection.to}-${index}`}
                    {...connection}
                    objects={scene.objects}
                />
            ))}

            {scene.objects.map((spec) => (
                <SceneObject
                    key={spec.id}
                    spec={spec}
                    onSelect={onSelect}
                    selected={selectedId === spec.id}
                    showLabels={showLabels}
                />
            ))}
        </>
    );
}

export function SceneRenderer({
    scene,
    onSelect,
    selectedId,
    showLabels = true,
    showGrid = true,
    className = '',
    enableXR = true,
}) {
    if (!scene?.objects?.length) return null;

    const camera = scene.camera?.position || [6, 4, 6];
    const target = scene.camera?.target || [0, 0, 0];

    return (
        <div className={className}>
            <Canvas
                shadows
                dpr={[1, 2]}
                // preserveDrawingBuffer lets the page export a screenshot of the
                // canvas; without it the buffer is cleared before we can read it.
                gl={{ antialias: true, preserveDrawingBuffer: true }}
            >
                <PerspectiveCamera makeDefault position={camera} fov={50} />
                <color attach="background" args={['#08080c']} />
                <fog attach="fog" args={['#08080c', 18, 44]} />

                {enableXR ? (
                    <XR store={xrStore}>
                        <SceneContents
                            scene={scene}
                            onSelect={onSelect}
                            selectedId={selectedId}
                            showLabels={showLabels}
                            showGrid={showGrid}
                        />
                    </XR>
                ) : (
                    <SceneContents
                        scene={scene}
                        onSelect={onSelect}
                        selectedId={selectedId}
                        showLabels={showLabels}
                        showGrid={showGrid}
                    />
                )}

                <OrbitControls
                    makeDefault
                    target={target}
                    enableDamping
                    dampingFactor={0.08}
                    minDistance={1.5}
                    maxDistance={40}
                />
            </Canvas>
        </div>
    );
}

export default SceneRenderer;
