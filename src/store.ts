import { create } from 'zustand';
import { ODSMode, OrbitFault, AppMode, SimulationState, MeasurementPoint, VibrationComponent, Harmonic, FilterType, ChatMessage, UploadedFile, CaseNotes } from './types';
import { MOTOR_CENTER, PUMP_CENTER, SHAFT_LENGTH } from './odsMath';

const MOTOR_DE_ID = 'm-de';

const wrapDeg = (deg: number) => {
    let res = deg % 360;
    if (res < 0) res += 360;
    return res;
};

const normalizeWithOffset = (comp: VibrationComponent, phaseOffset: number): VibrationComponent => {
    return {
        ...comp,
        phase: wrapDeg(comp.phaseMeas - phaseOffset)
    };
};

const calculateAllRelativePhases = (points: MeasurementPoint[], refId: string): MeasurementPoint[] => {
    const refPoint = points.find(p => p.id === refId) || points.find(p => p.id === MOTOR_DE_ID) || points[0];
    // Requirement: Phase REF is always the horizontal direction of the selected point
    const globalRefPhase = refPoint ? refPoint.horizontal.phaseMeas : 0;

    return points.map(p => ({
        ...p,
        isReference: p.id === refId,
        // FIX: Only subtract globalRefPhase from Horizontal.
        // Vertical and Axial phases remain absolute (offset 0).
        vertical: normalizeWithOffset(p.vertical, 0),
        horizontal: normalizeWithOffset(p.horizontal, globalRefPhase),
        axial: normalizeWithOffset(p.axial, 0)
    }));
};

const createPoint = (id: string, label: string, x: number, y: number, z: number): MeasurementPoint => ({
    id, label, position: [x, y, z],
    // Initial Manual Defaults: All phases set to 0 as requested
    horizontal: { amplitude: 0.2, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 },
    vertical: { amplitude: 0.1, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 }, 
    axial: { amplitude: 0.1, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 },
    isReference: id === MOTOR_DE_ID
});

const RAW_ODS_POINTS: MeasurementPoint[] = [
  createPoint('m-foot-de-l', 'Motor Foot DE-L', 0.6, 0.2, 0.8),
  createPoint('m-foot-de-r', 'Motor Foot DE-R', -0.6, 0.2, 0.8),
  createPoint('m-foot-nde-l', 'Motor Foot NDE-L', 0.6, 0.2, -0.8),
  createPoint('m-foot-nde-r', 'Motor Foot NDE-R', -0.6, 0.2, -0.8),
  createPoint('m-nde', 'Motor NDE Brg', 0, 1.95, -0.8), 
  createPoint('m-de', 'Motor DE Brg', 0, 1.95, 1.0),   
  createPoint('p-de', 'Pump Inboard Brg', 0, 1.35, 5.5),
  createPoint('p-nde', 'Pump Outboard Brg', 0, 1.35, 6.5),
];

const INITIAL_ODS_POINTS = calculateAllRelativePhases(RAW_ODS_POINTS, MOTOR_DE_ID);

const createOrbitPoint = (id: string, label: string, x: number, y: number, z: number): MeasurementPoint => ({
    id, label, position: [x, y, z],
    horizontal: { amplitude: 0, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 },
    vertical: { amplitude: 0, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 },
    axial: { amplitude: 0, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 }
});

const INITIAL_ORBIT_POINTS: MeasurementPoint[] = [
    createOrbitPoint('probe-x', 'Probe X', 1.0, 1.0, 0), 
    createOrbitPoint('probe-y', 'Probe Y', -1.0, 1.0, 0),
    createOrbitPoint('keyphasor', 'Keyphasor', 0, 1.5, -0.5), 
];
INITIAL_ORBIT_POINTS[0].horizontal = { amplitude: 10, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 };
INITIAL_ORBIT_POINTS[1].horizontal = { amplitude: 10, phaseMeas: 90, phase: 90, harmonics: [], noise: 0 };

const updateSoftFootPoints = (points: MeasurementPoint[], machineRpm: number, lineFreq: number): MeasurementPoint[] => {
    const safeRpm = machineRpm || 1; 
    const lfOrder = (2 * lineFreq * 60) / safeRpm;
    
    return points.map(p => {
        if (p.id === 'm-foot-de-r') {
            return { 
                ...p, 
                vertical: { 
                    ...p.vertical,
                    amplitude: 6.0, 
                    harmonics: [{ order: lfOrder, amplitudeRatio: 1.2, phaseShift: 180 }], 
                }
            };
        }
        return p;
    });
};

export const useStore = create<SimulationState>((set, get) => ({
  appMode: 'ODS',
  animationRpm: 110,
  machineRpm: 1480,
  globalGain: 10.0, 
  lineFreq: 50,
  isPlaying: true,
  wireframe: false,
  showVectors: true,
  isHeatMapMode: false,
  isAnalysisMode: false,
  isSettingsOpen: false,
  isUploadModalOpen: false,
  isOrbitPlotOpen: false,
  isOrbitSimulationVisible: false,
  isFilterModalOpen: false,
  isCustomOrbitModalOpen: false,
  filterType: 'None',
  filterOrder: 1.0,
  currentMode: ODSMode.Manual,
  currentOrbitFault: OrbitFault.Manual,
  simulationTime: { current: 0 },
  shaftAngle: { current: 0 },
  
  points: INITIAL_ODS_POINTS,
  orbitPoints: INITIAL_ORBIT_POINTS,
  
  isSimulatingCustomOrbit: false,
  customOrbitDescription: null,
  customOrbitPath: null,
  
  selectedPointId: null,
  referencePointId: MOTOR_DE_ID,

  // Chatbot State
  isChatbotOpen: false,
  baselineDiagnosticMemory: null,
  chatMessages: [],
  uploadedFiles: [],
  caseNotes: { conditions: [] },

  setAppMode: (mode) => set({ appMode: mode, selectedPointId: null, isOrbitPlotOpen: false, isAnalysisMode: false }),
  setAnimationRpm: (animationRpm) => set({ animationRpm }),
  
  setMachineRpm: (machineRpm) => {
      const state = get();
      if (state.appMode === 'ODS' && state.currentMode === ODSMode.SoftFoot) {
           const newPoints = updateSoftFootPoints(state.points, machineRpm, state.lineFreq);
           set({ machineRpm, points: calculateAllRelativePhases(newPoints, state.referencePointId) });
      } else {
           set({ machineRpm });
      }
  },

  setLineFreq: (lineFreq) => {
      const state = get();
      if (state.appMode === 'ODS' && state.currentMode === ODSMode.SoftFoot) {
           const newPoints = updateSoftFootPoints(state.points, state.machineRpm, lineFreq);
           set({ lineFreq, points: calculateAllRelativePhases(newPoints, state.referencePointId) });
      } else {
           set({ lineFreq });
      }
  },

  setGlobalGain: (globalGain) => set({ globalGain }),
  
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  toggleWireframe: () => set((state) => ({ wireframe: !state.wireframe })),
  toggleVectors: () => set((state) => ({ showVectors: !state.showVectors })),
  toggleHeatMap: () => set((state) => ({ isHeatMapMode: !state.isHeatMapMode })),
  toggleAnalysisMode: () => set((state) => ({ isAnalysisMode: !state.isAnalysisMode })),
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  toggleUploadModal: () => set((state) => ({ isUploadModalOpen: !state.isUploadModalOpen })),
  toggleOrbitPlot: () => set((state) => ({ isOrbitPlotOpen: !state.isOrbitPlotOpen })),
  toggleOrbitSimulation: () => set((state) => ({ isOrbitSimulationVisible: !state.isOrbitSimulationVisible })),
  
  toggleFilterModal: () => set((state) => ({ isFilterModalOpen: !state.isFilterModalOpen })),
  toggleCustomOrbitModal: () => set((state) => ({ isCustomOrbitModalOpen: !state.isCustomOrbitModalOpen })),
  toggleCustomOrbitSimulation: () => set((state) => ({ isSimulatingCustomOrbit: !state.isSimulatingCustomOrbit })),
  
  setFilterType: (type) => set({ filterType: type }),
  setFilterOrder: (order) => set({ filterOrder: order }),
  setCustomOrbitPath: (path, description) => set({ customOrbitPath: path, customOrbitDescription: description, isSimulatingCustomOrbit: false }),
  
  // Chatbot Actions
  setChatbotOpen: (isOpen) => set({ isChatbotOpen: isOpen }),
  setBaselineDiagnostic: (data) => set({ baselineDiagnosticMemory: data }),
  addChatMessage: (msg) => set(state => ({ chatMessages: [...state.chatMessages, msg] })),
  clearChat: () => set({ chatMessages: [], uploadedFiles: [], baselineDiagnosticMemory: null, caseNotes: { conditions: [] } }),
  addUploadedFile: (file) => set(state => ({ uploadedFiles: [...state.uploadedFiles, file] })),
  updateCaseNotes: (notes) => set(state => ({ caseNotes: { ...state.caseNotes, ...notes } })),

  selectPoint: (id) => set({ selectedPointId: id }),
  
  updatePoint: (id, updates) => set((state) => {
    const isOrbit = state.appMode === 'ORBIT';
    const list = isOrbit ? state.orbitPoints : state.points;
    const nextList = list.map(p => p.id === id ? { ...p, ...updates } : p);
    
    if (isOrbit) {
        const finalOrbitList = nextList.map(p => ({
            ...p,
            horizontal: { ...p.horizontal, phase: p.horizontal.phaseMeas },
            vertical: { ...p.vertical, phase: p.vertical.phaseMeas },
            axial: { ...p.axial, phase: p.axial.phaseMeas }
        }));
        return { orbitPoints: finalOrbitList };
    } else {
        return { points: calculateAllRelativePhases(nextList, state.referencePointId) };
    }
  }),

  setAllPoints: (newPoints) => set((state) => ({ 
      points: calculateAllRelativePhases(newPoints, state.referencePointId) 
  })),

  setReferencePoint: (id) => set((state) => {
    const target = state.points.find(p => p.id === id);
    if (!target) return {};
    
    // Shift ONLY horizontal measured phases so the new reference's horizontal phase becomes 0.
    // This is a permanent data modification to the 'phaseMeas' property for the horizontal axis only.
    const offset = target.horizontal.phaseMeas;
    
    const shiftedPoints = state.points.map(p => ({
        ...p,
        isReference: p.id === id,
        horizontal: { ...p.horizontal, phaseMeas: wrapDeg(p.horizontal.phaseMeas - offset) },
        // Do not shift vertical/axial phases when changing reference
        vertical: p.vertical,
        axial: p.axial
    }));
    
    // Recalculate simulation phases (relative)
    return {
        referencePointId: id,
        points: calculateAllRelativePhases(shiftedPoints, id)
    };
  }),

  resetToMode: (mode) => {
    set((state) => {
        if (Object.values(OrbitFault).includes(mode as OrbitFault)) {
            const baseAmp = 10;
            const customPath = null;
            
            let newOrbitPoints: MeasurementPoint[] = state.orbitPoints.map(p => {
                if(p.id === 'keyphasor') return p;
                
                const cleanH: VibrationComponent = { amplitude: baseAmp, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 };
                const cleanV: VibrationComponent = { amplitude: 0, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 };
                const cleanA: VibrationComponent = { amplitude: 0, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 };

                return {
                    ...p,
                    horizontal: cleanH,
                    vertical: cleanV,
                    axial: cleanA
                };
            });

            const updateProbe = (id: string, amp: number, phase: number, harmonics: Harmonic[] = [], noise = 0) => {
                newOrbitPoints = newOrbitPoints.map(p => {
                    if (p.id !== id) return p;
                    const updatedH: VibrationComponent = { 
                        ...p.horizontal, 
                        amplitude: amp, 
                        phaseMeas: phase, 
                        phase: phase, 
                        harmonics: harmonics, 
                        noise: noise 
                    };
                    return { ...p, horizontal: updatedH };
                });
            };

            switch (mode) {
                case OrbitFault.Unbalance: updateProbe('probe-x', 40, 0); updateProbe('probe-y', 40, 90); break;
                case OrbitFault.Misalignment: updateProbe('probe-x', 35, 0, [{ order: 2, amplitudeRatio: 0.4, phaseShift: 45 }]); updateProbe('probe-y', 20, 120, [{ order: 2, amplitudeRatio: 0.4, phaseShift: 45 }]); break;
                case OrbitFault.ShaftCrack: updateProbe('probe-x', 35, 0, [{ order: 2, amplitudeRatio: 0.5, phaseShift: 180 }]); updateProbe('probe-y', 35, 90, [{ order: 2, amplitudeRatio: 0.5, phaseShift: 180 }]); break;
                case OrbitFault.RotorBow: updateProbe('probe-x', 60, 0); updateProbe('probe-y', 60, 90); break;
                case OrbitFault.OilWhirl: updateProbe('probe-x', 30, 0, [{ order: 0.45, amplitudeRatio: 0.8, phaseShift: 90 }]); updateProbe('probe-y', 30, 90, [{ order: 0.45, amplitudeRatio: 0.8, phaseShift: 90 }]); break;
                case OrbitFault.OilWhip: updateProbe('probe-x', 50, 0, [{ order: 0.48, amplitudeRatio: 1.5, phaseShift: 80 }]); updateProbe('probe-y', 50, 90, [{ order: 0.48, amplitudeRatio: 1.5, phaseShift: 80 }]); break;
                case OrbitFault.Preload: updateProbe('probe-x', 45, 0); updateProbe('probe-y', 10, 90); break;
                case OrbitFault.Rub: updateProbe('probe-x', 30, 0, [{ order: 0.5, amplitudeRatio: 0.3, phaseShift: 0 }, { order: 2.0, amplitudeRatio: 0.3, phaseShift: 180 }, { order: 3.0, amplitudeRatio: 0.2, phaseShift: 0 }], 10); updateProbe('probe-y', 30, 90, [{ order: 0.5, amplitudeRatio: 0.3, phaseShift: 0 }, { order: 2.0, amplitudeRatio: 0.3, phaseShift: 180 }, { order: 3.0, amplitudeRatio: 0.2, phaseShift: 0 }], 10); break;
                case OrbitFault.Looseness: updateProbe('probe-x', 25, 0, [{ order: 2, amplitudeRatio: 0.5, phaseShift: 0 }, { order: 3, amplitudeRatio: 0.3, phaseShift: 0 }, { order: 4, amplitudeRatio: 0.2, phaseShift: 0 }]); updateProbe('probe-y', 30, 90, [{ order: 2, amplitudeRatio: 0.5, phaseShift: 0 }, { order: 3, amplitudeRatio: 0.3, phaseShift: 0 }, { order: 4, amplitudeRatio: 0.2, phaseShift: 0 }]); break;
                case OrbitFault.Resonance: updateProbe('probe-x', 80, 180); updateProbe('probe-y', 80, 270); break;
            }
            return { orbitPoints: newOrbitPoints, currentOrbitFault: mode as OrbitFault, customOrbitPath: customPath, isSimulatingCustomOrbit: false, customOrbitDescription: null };
        } 
        
        else {
              // RESET: Start fresh from current state structure but reset all values to 0.1/0
              let nextPoints = state.points.map(p => ({
                  ...p,
                  horizontal: { amplitude: 0.1, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 },
                  vertical: { amplitude: 0.1, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 }, 
                  axial: { amplitude: 0.1, phaseMeas: 0, phase: 0, harmonics: [], noise: 0 }
              }));
              
              const setAx = (pid: string, axis: 'horizontal'|'vertical'|'axial', amp: number, ph: number) => {
                  const pt = nextPoints.find(p => p.id === pid);
                  if (pt) { 
                      pt[axis].amplitude = amp; 
                      pt[axis].phaseMeas = ph; 
                  }
              };

              const odsMode = mode as ODSMode;

               switch(odsMode) {
                case ODSMode.Manual:
                    nextPoints.forEach(p => {
                        p.horizontal.amplitude = 0.2;
                        p.horizontal.phaseMeas = 0;
                        p.vertical.amplitude = 0.1;
                        p.vertical.phaseMeas = 0;
                        p.axial.amplitude = 0.1;
                        p.axial.phaseMeas = 0;
                        [p.horizontal, p.vertical, p.axial].forEach(axis => {
                            axis.harmonics = [];
                            axis.noise = 0;
                        });
                    });
                    break;

                case ODSMode.UnbalanceStatic:
                    nextPoints.forEach(p => {
                        if (p.id.startsWith('m-') || p.id.startsWith('p-')) {
                            setAx(p.id, 'horizontal', 6.0, 0);
                            setAx(p.id, 'vertical', 6.0, 90); 
                        }
                    });
                    break;

                case ODSMode.UnbalanceCouple:
                    setAx('m-de', 'horizontal', 6.0, 0); setAx('m-de', 'vertical', 6.0, 90);
                    setAx('m-nde', 'horizontal', 6.0, 180); setAx('m-nde', 'vertical', 6.0, 270);
                    break;

                case ODSMode.UnbalanceDynamic:
                    setAx('m-de', 'horizontal', 6.0, 0); setAx('m-de', 'vertical', 6.0, 90);
                    setAx('m-nde', 'horizontal', 6.0, 90); setAx('m-nde', 'vertical', 6.0, 180); 
                    break;

                case ODSMode.UnbalanceOverhung:
                    setAx('m-de', 'horizontal', 2.0, 0); setAx('m-de', 'vertical', 2.0, 90);
                    setAx('p-de', 'horizontal', 8.0, 0); setAx('p-de', 'vertical', 8.0, 90);
                    setAx('p-de', 'axial', 4.0, 0); 
                    setAx('p-nde', 'axial', 4.0, 180);
                    break;

                case ODSMode.AngularMisalignment:
                    setAx('m-de', 'axial', 8.0, 0);
                    setAx('p-de', 'axial', 8.0, 180);
                    break;

                case ODSMode.ParallelMisalignment:
                    setAx('m-de', 'horizontal', 7.0, 0); setAx('m-de', 'vertical', 7.0, 90);
                    setAx('p-de', 'horizontal', 7.0, 180); setAx('p-de', 'vertical', 7.0, 270);
                    break;

                case ODSMode.MisalignmentCombo:
                     setAx('m-de', 'vertical', 6.0, 90); setAx('m-de', 'horizontal', 6.0, 0); setAx('m-de', 'axial', 5.0, 0);
                     setAx('p-de', 'vertical', 6.0, 270); setAx('p-de', 'horizontal', 6.0, 180); setAx('p-de', 'axial', 5.0, 180);
                     break;

                case ODSMode.BentShaft:
                    setAx('m-de', 'axial', 8.0, 0);
                    setAx('m-nde', 'axial', 8.0, 180);
                    break;

                case ODSMode.EccentricRotor:
                    setAx('m-de', 'horizontal', 2.0, 0);
                    setAx('m-de', 'vertical', 8.0, 0); 
                    break;

                case ODSMode.LoosenessStructural:
                    setAx('m-foot-de-l', 'vertical', 10.0, 0);
                    const footL = nextPoints.find(p => p.id === 'm-foot-de-l');
                    if (footL) footL.vertical.harmonics = [{ order: 2, amplitudeRatio: 0.5, phaseShift: 0 }];
                    break;

                case ODSMode.LoosenessRocking:
                     setAx('m-de', 'horizontal', 8.0, 0); 
                     setAx('m-de', 'vertical', 2.0, 90); 
                     const lr = nextPoints.find(p => p.id === 'm-de');
                     if(lr) lr.horizontal.harmonics = [{order: 2, amplitudeRatio: 0.5, phaseShift: 180}];
                     break;

                case ODSMode.SoftFoot:
                    nextPoints = updateSoftFootPoints(nextPoints, state.machineRpm, state.lineFreq); 
                    break;

                case ODSMode.ResonanceVert:
                    nextPoints.forEach(p => {
                       setAx(p.id, 'vertical', 8.0, 0);
                       setAx(p.id, 'horizontal', 1.0, 0);
                    });
                    break;
              }
              
              // Ensure we return to default reference point ID to perform a true "Reset"
              const newRefId = MOTOR_DE_ID;

              return { 
                  referencePointId: newRefId,
                  points: calculateAllRelativePhases(nextPoints, newRefId), 
                  currentMode: odsMode 
              };
        }
    });
  }
}));