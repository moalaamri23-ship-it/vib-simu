import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';
import { calculateVertexDisplacement, MOTOR_CENTER, PUMP_CENTER } from '../../odsMath';
import { generateMotorCAD, generatePumpCAD, generateSkidCAD, generateCouplingHalf } from './ProceduralAssets';

// --- Materials ---
const motorMat = new THREE.MeshStandardMaterial({ 
  color: "#1e3a8a", roughness: 0.3, metalness: 0.4 
});
const pumpMat = new THREE.MeshStandardMaterial({ 
  color: "#047857", roughness: 0.3, metalness: 0.4 
});
const couplingMat = new THREE.MeshStandardMaterial({
    color: "#333333", roughness: 0.5, metalness: 0.8
});
const shaftMat = new THREE.MeshStandardMaterial({
    color: "#94a3b8", roughness: 0.2, metalness: 0.8
});
const steelMat = new THREE.MeshStandardMaterial({ 
  color: "#64748b", roughness: 0.7, metalness: 0.3 
});

// Heat Map Material
const heatMapMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.2
});

// Sensor Materials
const sensorMat = new THREE.MeshBasicMaterial({ 
  color: "#ef4444", transparent: true, opacity: 0.8 
});
const sensorSelectedMat = new THREE.MeshBasicMaterial({ 
  color: "#fbbf24", transparent: false, opacity: 1.0 
});
const sensorRefMat = new THREE.MeshBasicMaterial({ 
  color: "#3b82f6", transparent: false, opacity: 1.0 
});

/**
 * DeformableMesh with Simplified Rotation Logic and Heat Cam support.
 */
const DeformableMesh: React.FC<{
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ geometry, material, position, rotation = [0,0,0] }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { animationRpm, points, globalGain, isPlaying, wireframe, isHeatMapMode } = useStore();
  const timeRef = useRef(0);

  const initialPos = useMemo(() => {
    if (!geometry?.attributes?.position) return new Float32Array(0);
    return Float32Array.from(geometry.attributes.position.array);
  }, [geometry]);

  // Ensure color attribute exists for Heat Map
  useEffect(() => {
      if (geometry && !geometry.getAttribute('color')) {
          const count = geometry.attributes.position.count;
          const colors = new Float32Array(count * 3);
          // Initialize white
          for (let i = 0; i < count * 3; i++) colors[i] = 1.0;
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
  }, [geometry]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    // Safety check: Ensure geometry and position attribute exist
    const currentGeo = meshRef.current.geometry;
    if (!currentGeo || !currentGeo.attributes.position) return;

    if (isPlaying) timeRef.current += delta;

    const posAttr = currentGeo.attributes.position;
    const colAttr = currentGeo.getAttribute('color');
    const count = posAttr.count;
    
    // Position Offset
    const [mx, my, mz] = position;
    
    // Euler for World rotation
    const euler = new THREE.Euler(rotation[0], rotation[1], rotation[2]);
    const inverseEuler = new THREE.Euler(-rotation[0], -rotation[1], -rotation[2]);
    const vec = new THREE.Vector3();
    const tempColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // 1. Get Rest Position (Local)
      if (i * 3 + 2 >= initialPos.length) continue;

      vec.set(initialPos[i * 3], initialPos[i * 3 + 1], initialPos[i * 3 + 2]);
      
      // 2. Transform to World for Physics Query
      vec.applyEuler(euler);
      
      const wx = vec.x + mx;
      const wy = vec.y + my;
      const wz = vec.z + mz;

      // 3. Calculate Physics Displacement (World Space) using animationRpm
      const def = calculateVertexDisplacement(wx, wy, wz, timeRef.current, animationRpm, points, globalGain);
      
      // 4. Apply Displacement to Vertex (Simplified: assume aligned or small rot)
      const localDisp = def.clone().applyEuler(inverseEuler);

      posAttr.setXYZ(i, initialPos[i * 3] + localDisp.x, initialPos[i * 3 + 1] + localDisp.y, initialPos[i * 3 + 2] + localDisp.z);

      // 5. Heat Map Coloration
      if (isHeatMapMode && colAttr) {
          const mag = def.length();
          // Scale factor: Normalize relative to gain. 
          // Assuming max normal visual deflection is around 0.2 * globalGain
          // We want red at "high" relative deflection.
          const maxDef = Math.max(0.01, globalGain * 0.025); 
          const t = Math.min(mag / maxDef, 1.0);
          
          // Gradient: Blue (0.66) -> Red (0.0)
          tempColor.setHSL(0.66 * (1.0 - t), 1.0, 0.5);
          colAttr.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
      }
    }
    
    posAttr.needsUpdate = true;
    if (isHeatMapMode && colAttr) colAttr.needsUpdate = true;
    
    // Recalculate normals periodically or every frame for correct lighting on deformed mesh
    if (count < 15000) {
        currentGeo.computeVertexNormals();
    }
  });

  const activeMaterial = isHeatMapMode ? heatMapMat : material;

  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={activeMaterial} attach="material" wireframe={wireframe} />
    </mesh>
  );
};

const SensorPoint: React.FC<{ id: string }> = ({ id }) => {
  const { points, selectedPointId, selectPoint } = useStore();
  const point = points.find(p => p.id === id);
  if (!point) return null;
  const isSelected = selectedPointId === id;
  
  // Determine material based on state
  let mat = sensorMat;
  if (isSelected) mat = sensorSelectedMat;
  else if (point.isReference) mat = sensorRefMat;

  return (
    <group position={point.position}>
        <mesh 
            onClick={(e) => { e.stopPropagation(); selectPoint(id); }}
            onPointerOver={() => document.body.style.cursor = 'pointer'}
            onPointerOut={() => document.body.style.cursor = 'auto'}
        >
            <sphereGeometry args={[0.12, 16, 16]} />
            <primitive object={mat} />
        </mesh>
        {isSelected && (
           <Html position={[0, 0.2, 0]} center zIndexRange={[100, 0]}>
              <div className="bg-black/80 text-white text-[10px] px-2 py-1 rounded border border-yellow-500 whitespace-nowrap">
                {point.label}
              </div>
           </Html>
        )}
        {/* Helper text for Reference */}
        {point.isReference && !isSelected && (
            <Html position={[0, 0.2, 0]} center zIndexRange={[50, 0]}>
              <div className="bg-blue-900/80 text-blue-100 text-[9px] px-1.5 py-0.5 rounded border border-blue-500 whitespace-nowrap">
                REF
              </div>
           </Html>
        )}
    </group>
  );
};

export const MachineTrain: React.FC = () => {
  const { points, wireframe } = useStore();

  const motorGeo = useMemo(() => generateMotorCAD(), []);
  const pumpGeo = useMemo(() => generatePumpCAD(), []);
  const couplingHalfGeo = useMemo(() => generateCouplingHalf(), []);
  const skidGeo = useMemo(() => generateSkidCAD(), []);
  
  // Dedicated Shaft Geometries
  const motorShaftGeo = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.18, 0.18, 1.8, 16, 10);
    geo.rotateX(Math.PI / 2);
    return geo;
  }, []);

  const pumpShaftGeo = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.18, 0.18, 2.25, 16, 10);
    geo.rotateX(Math.PI / 2);
    return geo;
  }, []);
  
  return (
    <group>
      {points.map(p => <SensorPoint key={p.id} id={p.id} />)}

      {/* MOTOR (Center Z=0) */}
      <DeformableMesh 
        geometry={motorGeo} 
        material={motorMat} 
        position={[0, 1.0, 0]} 
      />
      
      {/* MOTOR SHAFT */}
      <DeformableMesh
        geometry={motorShaftGeo}
        material={shaftMat}
        position={[0, 1.0, 2.1]}
      />

      {/* COUPLING MOTOR SIDE (Face at 2.95) */}
      <DeformableMesh
        geometry={couplingHalfGeo}
        material={couplingMat}
        position={[0, 1.0, 2.95]}
      />

      {/* COUPLING PUMP SIDE (Face at 3.05) - Closer Gap */}
      <DeformableMesh
        geometry={couplingHalfGeo}
        material={couplingMat}
        position={[0, 1.0, 3.05]}
        rotation={[0, Math.PI, 0]}
      />

      {/* PUMP SHAFT */}
      <DeformableMesh
        geometry={pumpShaftGeo}
        material={shaftMat}
        position={[0, 1.0, 4.125]}
      />

      {/* PUMP (Center Z=6.0) */}
      <DeformableMesh 
        geometry={pumpGeo} 
        material={pumpMat} 
        position={[0, 1.0, 6.0]} 
      />

      {/* SKID BASE - NOW DEFORMABLE */}
      <DeformableMesh 
        geometry={skidGeo} 
        material={steelMat} 
        position={[0, 0.05, 0]} 
      />

    </group>
  );
};