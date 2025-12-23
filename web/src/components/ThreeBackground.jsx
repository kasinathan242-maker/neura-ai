import React, { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, Float } from '@react-three/drei'

const FloatingCrystal = () => {
    const meshRef = useRef()

    useFrame((state, delta) => {
        meshRef.current.rotation.x += delta * 0.2
        meshRef.current.rotation.y += delta * 0.1
    })

    return (
        <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
            <mesh ref={meshRef}>
                <octahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color="#6d28d9" wireframe />
            </mesh>
        </Float>
    )
}

export const ThreeBackground = () => {
    return (
        <div className="absolute inset-0 -z-10 opacity-30 pointer-events-none">
            <Canvas camera={{ position: [0, 0, 5] }}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                <FloatingCrystal />
            </Canvas>
        </div>
    )
}
