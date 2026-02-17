import * as THREE from 'three';
import { 
    MeasurementPoint, 
    VibrationComponent, 
    AXIAL_PLUS, 
    VERTICAL_PLUS, 
    HORIZONTAL_PLUS 
} from './types';

export const SHAFT_LENGTH = 10;
export const MOTOR_CENTER = 1.5;
export const PUMP_CENTER = 8.5;

const calculateInstantVal = (comp: VibrationComponent, omega: number, t: number): number => {
    // Math Rule: Motion is derived from phase (Normalized to Reference)
    // We must use phase to respect the Reference Point selection.
    
    // Use the calculated relative phase from the store.
    const effectivePhase = comp.phase;

    const relPhaseRad = (effectivePhase * Math.PI) / 180;
    const fund = comp.amplitude * Math.sin(omega * t + relPhaseRad);
    
    let total = fund;
    if (comp.harmonics) {
        for (const h of comp.harmonics) {
            const hOmega = omega * h.order;
            // Phase shift for harmonics is added to the relative phase of fundamental
            const hPh = relPhaseRad + (h.phaseShift * Math.PI / 180);
            total += (comp.amplitude * h.amplitudeRatio) * Math.sin(hOmega * t + hPh);
        }
    }
    if (comp.noise) {
        total += comp.noise * 0.5 * (Math.sin(omega * 25 * t) + Math.random() * 0.2);
    }
    return total;
};

export const calculateVertexDisplacement = (
  x: number, y: number, z: number,
  t: number,
  animationRpm: number,
  points: MeasurementPoint[],
  globalGain: number
): THREE.Vector3 => {
  const omega = (animationRpm * 2 * Math.PI) / 60;
  const displacement = new THREE.Vector3(0, 0, 0);
  
  let totalWeight = 0;
  const power = 3.5; 
  const SCALAR = 0.015;

  for (const p of points) {
    const dx = x - p.position[0];
    const dy = y - p.position[1];
    const dz = z - p.position[2];
    const distSq = dx*dx + dy*dy + dz*dz;
    const dist = Math.sqrt(distSq);

    const weight = 1.0 / (Math.pow(dist, power) + 0.1);
    
    // Project scalars along unified global vectors
    const magA = calculateInstantVal(p.axial, omega, t);
    const magV = calculateInstantVal(p.vertical, omega, t);
    const magH = calculateInstantVal(p.horizontal, omega, t);
    
    displacement.addScaledVector(AXIAL_PLUS, magA * weight);
    displacement.addScaledVector(VERTICAL_PLUS, magV * weight);
    displacement.addScaledVector(HORIZONTAL_PLUS, magH * weight);
    
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    displacement.divideScalar(totalWeight);
  }

  return displacement.multiplyScalar(globalGain * SCALAR);
};