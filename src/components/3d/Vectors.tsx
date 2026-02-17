import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { 
    MeasurementPoint, 
    AXIAL_PLUS, 
    VERTICAL_PLUS, 
    HORIZONTAL_PLUS 
} from '../../types';

const ResultantArrow: React.FC<{ point: MeasurementPoint }> = ({ point }) => {
    const { animationRpm, isPlaying } = useStore();
    const timeRef = useRef(0);
    const groupRef = useRef<THREE.Group>(null);
    const shaftRef = useRef<THREE.Mesh>(null);
    const headRef = useRef<THREE.Mesh>(null);

    useFrame((_, delta) => {
        if (isPlaying) timeRef.current += delta;
        if (!groupRef.current || !shaftRef.current || !headRef.current) return;

        const t = timeRef.current;
        const omega = (animationRpm * 2 * Math.PI) / 60;

        // Calculate instantaneous scalar displacement for each axis
        // Using normalized phase (Relative to Reference) from store
        const getInst = (comp: any) => comp.amplitude * Math.sin(omega * t + (comp.phase * Math.PI / 180));

        const vVal = getInst(point.vertical);
        const hVal = getInst(point.horizontal);
        const aVal = getInst(point.axial);

        // Combine into single resultant vector
        const resultant = new THREE.Vector3();
        resultant.addScaledVector(VERTICAL_PLUS, vVal);
        resultant.addScaledVector(HORIZONTAL_PLUS, hVal);
        resultant.addScaledVector(AXIAL_PLUS, aVal);

        const mag = resultant.length();

        // Threshold to hide noise
        if (mag < 0.1) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;

        // Visual Scale Factor
        const scale = 0.15; 
        const totalLen = mag * scale;

        // Orient Arrow
        const dir = resultant.normalize();
        const up = new THREE.Vector3(0, 1, 0); // Default cylinder orientation
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        groupRef.current.setRotationFromQuaternion(quat);

        // Adjust Dimensions
        const headLen = 0.35;
        const shaftLen = Math.max(0.01, totalLen - headLen);
        
        // If vector is very small, scale down head too
        const effectiveHeadLen = totalLen < headLen ? totalLen * 0.6 : headLen;
        const effectiveShaftLen = totalLen - effectiveHeadLen;

        shaftRef.current.scale.set(1, effectiveShaftLen, 1);
        shaftRef.current.position.y = effectiveShaftLen / 2;

        headRef.current.scale.set(1, 1, 1);
        headRef.current.position.y = effectiveShaftLen; // Place head at end of shaft
    });

    return (
        <group ref={groupRef} position={point.position}>
            <mesh ref={shaftRef}>
                <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
                <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
            </mesh>
            <mesh ref={headRef}>
                <coneGeometry args={[0.12, 0.35, 12]} />
                <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
            </mesh>
        </group>
    );
};

export const VectorField: React.FC = () => {
    const { points, isAnalysisMode, showVectors } = useStore();
    
    // Hide vectors in Analysis Mode to reduce clutter, or if user toggled them off
    if (isAnalysisMode || !showVectors) return null;
    
    return (
        <group>
            {points.map(p => (
                <ResultantArrow key={p.id} point={p} />
            ))}
        </group>
    );
};