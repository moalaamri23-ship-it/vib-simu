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

// Define 6 anchor points for the skid foundation (X, Y, Z)
// Based on skid dimensions: Length 12 (Z: -2 to 10), Width 3 (X: -1.5 to 1.5)
const SKID_ANCHORS = [
    [1.4, 0, -1.5], [-1.4, 0, -1.5], // Front anchors (Motor NDE end)
    [1.4, 0, 4.0],  [-1.4, 0, 4.0],  // Middle anchors (Coupling area)
    [1.4, 0, 9.5],  [-1.4, 0, 9.5]   // Rear anchors (Pump end)
];

const calculateInstantVal = (comp: VibrationComponent, omega: number, t: number): number => {
    // Math Rule: Motion is derived from phase (Normalized to Reference)
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
  
  // 1. Foundation Anchoring Logic
  // Calculate how close this vertex is to any anchor point
  // If close to an anchor, damp the movement to 0 to simulate bolting to ground
  let anchorDamping = 1.0;
  const anchorRadius = 1.8; // Distance over which stiffness applies

  // Only apply anchoring if vertex is near ground level (Skid)
  if (y < 0.5) { 
      for (const anchor of SKID_ANCHORS) {
          const dx = x - anchor[0];
          const dz = z - anchor[2];
          // We mainly care about X/Z distance for the anchor bolt
          const dist = Math.sqrt(dx*dx + dz*dz);
          
          if (dist < anchorRadius) {
              // Linear damping: 0 at bolt center, 1 at radius
              const d = Math.max(0, dist / anchorRadius);
              // Smooth easing
              anchorDamping = Math.min(anchorDamping, d * d * (3 - 2 * d));
          }
      }
  }

  // 2. Standard Physics Interpolation
  let totalWeight = 0;
  const power = 3.5; 
  const SCALAR = 0.015;

  for (const p of points) {
    const dx = x - p.position[0];
    const dy = y - p.position[1];
    const dz = z - p.position[2];
    const distSq = dx*dx + dy*dy + dz*dz;
    const dist = Math.sqrt(distSq);

    // Inverse distance weighting
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

  // Apply damping and global gain
  return displacement.multiplyScalar(globalGain * SCALAR * anchorDamping);
};