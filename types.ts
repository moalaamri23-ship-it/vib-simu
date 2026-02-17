import * as THREE from 'three';

export type AppMode = 'ODS' | 'ORBIT';
export type FilterType = 'None' | 'BandPass' | 'LowPass';

export const AXIAL_PLUS = new THREE.Vector3(0, 0, 1);    
export const VERTICAL_PLUS = new THREE.Vector3(0, -1, 0); 
export const HORIZONTAL_PLUS = new THREE.Vector3(1, 0, 0); 

export enum ODSMode {
  Manual = 'Manual Analysis',
  UnbalanceStatic = 'Static Unbalance',
  UnbalanceCouple = 'Couple Unbalance',
  UnbalanceDynamic = 'Dynamic Unbalance',
  UnbalanceOverhung = 'Overhung Rotor',
  AngularMisalignment = 'Angular Misalignment',
  ParallelMisalignment = 'Parallel Misalignment',
  MisalignmentCombo = 'Combined Misalignment',
  BentShaft = 'Bent Shaft',
  EccentricRotor = 'Eccentric Rotor',
  LoosenessStructural = 'Structural Looseness',
  LoosenessRocking = 'Rocking Looseness',
  LoosenessBearing = 'Loose Bearing Fit',
  SoftFoot = 'Soft Foot',
  BearingWear = 'Bearing Wear',
  GearMesh = 'Gear Mesh Issue',
  ResonanceVert = 'Vertical Resonance',
}

export enum OrbitFault {
    Manual = 'Manual Config',
    Unbalance = 'Unbalance (1X Circle)',
    Misalignment = 'Misalignment (Banana/Ellipse)',
    ShaftCrack = 'Shaft Crack (1X + 2X Loop)',
    RotorBow = 'Rotor Bow (High 1X)',
    OilWhirl = 'Oil Whirl',
    OilWhip = 'Oil Whip',
    Preload = 'Radial Preload',
    Rub = 'Rub',
    Looseness = 'Mechanical Looseness',
    Resonance = 'Resonance',
}

export interface Harmonic {
    order: number;
    amplitudeRatio: number;
    phaseShift: number;
}

export interface VibrationComponent {
    amplitude: number; 
    phaseMeas: number; 
    phase: number;     
    harmonics?: Harmonic[]; 
    noise?: number;
}

export interface MeasurementPoint {
  id: string;
  label: string;
  position: [number, number, number];
  horizontal: VibrationComponent;
  vertical: VibrationComponent;
  axial: VibrationComponent;
  isReference?: boolean;
}

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

export interface UploadedFile {
    name: string;
    type: 'image' | 'text';
    content: string; // Base64 or text content
}

export interface CaseNotes {
    conditions: string[];
}

export interface SimulationState {
  appMode: AppMode;
  animationRpm: number;
  machineRpm: number;
  globalGain: number;
  isPlaying: boolean;
  wireframe: boolean;
  showVectors: boolean;
  isHeatMapMode: boolean;
  isAnalysisMode: boolean; 
  currentMode: ODSMode; 
  currentOrbitFault: OrbitFault;
  simulationTime: { current: number };
  shaftAngle: { current: number };
  lineFreq: number;
  
  // UI State
  isSettingsOpen: boolean;
  isUploadModalOpen: boolean;
  isOrbitPlotOpen: boolean;
  isOrbitSimulationVisible: boolean;
  isCustomOrbitModalOpen: boolean;
  
  // Filter State
  isFilterModalOpen: boolean;
  filterType: FilterType;
  filterOrder: number;

  // Custom Orbit State
  isSimulatingCustomOrbit: boolean;
  customOrbitDescription: string | null;

  // Chatbot & Diagnostics State
  isChatbotOpen: boolean;
  baselineDiagnosticMemory: any;
  chatMessages: ChatMessage[];
  uploadedFiles: UploadedFile[];
  caseNotes: CaseNotes;

  points: MeasurementPoint[];
  orbitPoints: MeasurementPoint[];
  customOrbitPath: number[][] | null; 
  selectedPointId: string | null;
  referencePointId: string;
  
  setAppMode: (mode: AppMode) => void;
  setAnimationRpm: (rpm: number) => void;
  setMachineRpm: (rpm: number) => void;
  setLineFreq: (freq: number) => void;
  setGlobalGain: (gain: number) => void;
  
  togglePlay: () => void;
  toggleWireframe: () => void;
  toggleVectors: () => void;
  toggleHeatMap: () => void;
  toggleAnalysisMode: () => void; 
  toggleSettings: () => void;
  toggleUploadModal: () => void;
  toggleOrbitPlot: () => void;
  toggleOrbitSimulation: () => void;
  toggleFilterModal: () => void;
  toggleCustomOrbitModal: () => void;
  toggleCustomOrbitSimulation: () => void;
  
  setFilterType: (type: FilterType) => void;
  setFilterOrder: (order: number) => void;
  setCustomOrbitPath: (path: number[][] | null, description?: string) => void;

  // Chatbot Actions
  setChatbotOpen: (isOpen: boolean) => void;
  setBaselineDiagnostic: (data: any) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
  addUploadedFile: (file: UploadedFile) => void;
  updateCaseNotes: (notes: Partial<CaseNotes>) => void;

  selectPoint: (id: string | null) => void;
  updatePoint: (id: string, updates: Partial<MeasurementPoint>) => void;
  setReferencePoint: (id: string) => void;
  resetToMode: (mode: ODSMode | OrbitFault) => void;
  setAllPoints: (points: MeasurementPoint[]) => void;
}