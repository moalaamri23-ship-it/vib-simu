import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { ODSMode, OrbitFault, MeasurementPoint, FilterType, ChatMessage, UploadedFile } from '../../types';
import { Play, Pause, Activity, Settings2, Eye, EyeOff, Target, Gauge, ArrowRightLeft, ArrowUpDown, Move, Table, Download, Upload, X, LineChart, Settings, UploadCloud, Zap, List, Plus, Trash2, CheckCircle2, BarChart3, Scan, Waves, ChevronUp, ChevronDown, Save, Folder, Key, AlertTriangle, ClipboardList, Stethoscope, FileText, Flame, Filter, PencilRuler, StopCircle, PenTool, BrainCircuit, RefreshCw, MessageSquare, Paperclip, Send } from 'lucide-react';
import { AnalysisWindow } from './AnalysisWindow';
import { OrbitWindow } from './OrbitWindow';
import { OrbitLiveDashboard } from './OrbitLiveDashboard';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';
import { jsPDF } from "jspdf";

const speedOptions = [
    { label: 'SLOW', val: 30 },
    { label: 'MED', val: 110 },
    { label: 'FAST', val: 300 },
    { label: 'MAX', val: 800 }
];

export const Interface: React.FC = () => {
  const { 
    appMode, setAppMode,
    animationRpm, setAnimationRpm,
    machineRpm, setMachineRpm,
    lineFreq, setLineFreq,
    globalGain, setGlobalGain,
    points, orbitPoints, selectedPointId, updatePoint, setReferencePoint, referencePointId,
    resetToMode, currentMode, currentOrbitFault,
    wireframe, toggleWireframe,
    isPlaying, togglePlay,
    setAllPoints,
    isAnalysisMode, toggleAnalysisMode,
    isSettingsOpen, toggleSettings,
    isUploadModalOpen, toggleUploadModal,
    isOrbitPlotOpen, toggleOrbitPlot,
    isOrbitSimulationVisible, toggleOrbitSimulation,
    showVectors, toggleVectors,
    isHeatMapMode, toggleHeatMap,
    isFilterModalOpen, toggleFilterModal,
    filterType, setFilterType,
    filterOrder, setFilterOrder,
    isCustomOrbitModalOpen, toggleCustomOrbitModal,
    setCustomOrbitPath,
    customOrbitPath,
    isSimulatingCustomOrbit,
    toggleCustomOrbitSimulation,
    customOrbitDescription,
    // Chatbot State
    isChatbotOpen, setChatbotOpen,
    baselineDiagnosticMemory, setBaselineDiagnostic,
    chatMessages, addChatMessage, clearChat,
    uploadedFiles, addUploadedFile,
    caseNotes, updateCaseNotes
  } = useStore();

  const activePoints = appMode === 'ORBIT' ? orbitPoints : points;
  const selectedPoint = activePoints.find(p => p.id === selectedPointId);
  const isProbe = selectedPointId?.startsWith('probe');
  const isKeyphasor = selectedPointId === 'keyphasor';
  
  const [activeAxis, setActiveAxis] = useState<'horizontal' | 'vertical' | 'axial'>('vertical');
  const [showDataManager, setShowDataManager] = useState(false);
  const [customTab, setCustomTab] = useState<'manual' | 'ai'>('manual');
  const [manualFund, setManualFund] = useState({ amp: 0, phase: 0 });
  const [manualHarmonics, setManualHarmonics] = useState<{id: number, order: number, amp: number}[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  
  // Custom Orbit AI & Manual State
  const [orbitTab, setOrbitTab] = useState<'ai' | 'manual'>('ai');
  const [customOrbitImage, setCustomOrbitImage] = useState<string | null>(null);
  const [isAnalyzingOrbit, setIsAnalyzingOrbit] = useState(false);
  const customOrbitCanvasRef = useRef<HTMLCanvasElement>(null);
  const manualCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPath, setDrawnPath] = useState<number[][]>([]);

  // UI State
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [projects, setProjects] = useState<{name: string, data: MeasurementPoint[]}[]>([]);
  const [currentProject, setCurrentProject] = useState<string>("");
  const [apiKey, setApiKey] = useState(process.env.API_KEY || '');
  
  // Project Dropdown State
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Save Project Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveProjectTitle, setSaveProjectTitle] = useState("");

  // Delete Project Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  // Diagnostics State
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [contextInput, setContextInput] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<any>(null);
  
  // Chat Input
  const [chatInput, setChatInput] = useState("");
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (appMode === 'ORBIT') setActiveAxis('horizontal'); 
      else setActiveAxis('vertical');
  }, [selectedPointId, appMode]);

  useEffect(() => {
      if (isUploadModalOpen && selectedPoint) {
          const comp = selectedPoint[activeAxis];
          setManualFund({ amp: comp.amplitude, phase: comp.phaseMeas });
          
          const existing = comp.harmonics?.map((h, i) => ({
              id: Date.now() + i,
              order: h.order,
              amp: parseFloat((h.amplitudeRatio * comp.amplitude).toFixed(2))
          })) || [];
          setManualHarmonics(existing);
      }
  }, [isUploadModalOpen, selectedPoint, activeAxis]);

  // Load Projects from Local Storage on Mount
  useEffect(() => {
      const saved = localStorage.getItem('ods_projects');
      if (saved) {
          try {
              setProjects(JSON.parse(saved));
          } catch (e) { console.error("Error loading projects", e); }
      }
      if (process.env.API_KEY) setApiKey(process.env.API_KEY);
  }, []);

  // Scroll Chat to bottom
  useEffect(() => {
      if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
  }, [chatMessages, isChatbotOpen]);

  // Draw Custom Orbit Preview (AI Result)
  useEffect(() => {
      if (isCustomOrbitModalOpen && orbitTab === 'ai' && customOrbitPath && customOrbitCanvasRef.current) {
          const canvas = customOrbitCanvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          const w = canvas.width;
          const h = canvas.height;
          const cx = w / 2;
          const cy = h / 2;
          const scale = w * 0.4;
          
          ctx.clearRect(0, 0, w, h);
          
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.beginPath();
          ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
          
          ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
          customOrbitPath.forEach((pt, i) => {
              const px = cx + pt[0] * scale;
              const py = cy - pt[1] * scale;
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          if (customOrbitPath.length > 2) {
              const first = customOrbitPath[0];
              ctx.lineTo(cx + first[0] * scale, cy - first[1] * scale);
          }
          ctx.stroke();
      }
  }, [isCustomOrbitModalOpen, customOrbitPath, orbitTab]);

  // Draw Manual Replica Canvas
  useEffect(() => {
      if (isCustomOrbitModalOpen && orbitTab === 'manual' && manualCanvasRef.current) {
          const canvas = manualCanvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          const w = canvas.width;
          const h = canvas.height;
          const cx = w / 2;
          const cy = h / 2;
          const scale = w * 0.4; 
          
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.beginPath();
          ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, scale, 0, Math.PI * 2); ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = '#64748b'; ctx.font = '10px monospace'; ctx.fillText("+Y", cx + 4, 10); ctx.fillText("+X", w - 15, cy - 4);

          if (drawnPath.length > 0) {
              ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
              drawnPath.forEach((pt, i) => {
                  const px = cx + pt[0] * scale; const py = cy - pt[1] * scale;
                  if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              });
              if (drawnPath.length > 10) {
                  const first = drawnPath[0]; const last = drawnPath[drawnPath.length - 1];
                  const dist = Math.sqrt(Math.pow(last[0]-first[0], 2) + Math.pow(last[1]-first[1], 2));
                  if (dist < 0.1) ctx.lineTo(cx + first[0] * scale, cy - first[1] * scale);
              }
              ctx.stroke();
              const start = drawnPath[0];
              ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(cx + start[0]*scale, cy - start[1]*scale, 4, 0, Math.PI*2); ctx.fill();
          }
      }
  }, [isCustomOrbitModalOpen, orbitTab, drawnPath]);

  // --- MANUAL ORBIT HANDLERS ---
  const addManualPoint = (e: React.MouseEvent, reset = false) => {
      const canvas = manualCanvasRef.current;
      if(!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const w = canvas.width;
      const scale = w * 0.4;
      const nx = (x - w/2) / scale;
      const ny = -(y - canvas.height/2) / scale;
      if (reset) setDrawnPath([[nx, ny]]);
      else setDrawnPath(prev => [...prev, [nx, ny]]);
  };

  const handleManualDrawStart = (e: React.MouseEvent) => { setIsDrawing(true); setDrawnPath([]); addManualPoint(e, true); };
  const handleManualDrawMove = (e: React.MouseEvent) => { if(!isDrawing) return; addManualPoint(e); };
  const handleManualDrawEnd = () => { setIsDrawing(false); if (drawnPath.length > 10) { const first = drawnPath[0]; const last = drawnPath[drawnPath.length - 1]; const dist = Math.sqrt(Math.pow(last[0]-first[0], 2) + Math.pow(last[1]-first[1], 2)); if (dist < 0.1) setDrawnPath(prev => [...prev, first]); } };
  const handleManualLeave = () => { setIsDrawing(false); };
  const applyManualOrbit = () => { if (drawnPath.length < 2) return; setCustomOrbitPath(drawnPath, "Manual Replica"); if (!isSimulatingCustomOrbit) toggleCustomOrbitSimulation(); };

  // --- STANDARD HANDLERS ---
  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => { if (appMode === 'ODS') resetToMode(e.target.value as ODSMode); else resetToMode(e.target.value as OrbitFault); };
  const updateComponent = (field: 'amplitude' | 'phaseMeas', value: number) => { if (!selectedPoint) return; const component = { ...selectedPoint[activeAxis], [field]: value }; updatePoint(selectedPoint.id, { [activeAxis]: component }); };
  const handleDataUpdate = (id: string, axis: 'vertical' | 'horizontal' | 'axial', field: 'amplitude' | 'phaseMeas', val: string) => { const point = points.find(p => p.id === id); if (!point) return; const value = parseFloat(val) || 0; updatePoint(id, { [axis]: { ...point[axis], [field]: value } }); };
  const addHarmonic = () => { setManualHarmonics([...manualHarmonics, { id: Date.now(), order: 2.0, amp: 0.0 }]); };
  const removeHarmonic = (id: number) => { setManualHarmonics(manualHarmonics.filter(h => h.id !== id)); };
  const updateHarmonic = (id: number, field: 'order' | 'amp', value: number) => { setManualHarmonics(manualHarmonics.map(h => h.id === id ? { ...h, [field]: value } : h)); };
  const applyManualSimulation = () => { if (!selectedPoint) return; const harmonics = manualHarmonics.map(h => ({ order: h.order, amplitudeRatio: manualFund.amp > 0 ? h.amp / manualFund.amp : 0, phaseShift: 0 })); updatePoint(selectedPoint.id, { [activeAxis]: { amplitude: manualFund.amp, phaseMeas: manualFund.phase, harmonics: harmonics, noise: 0 } }); toggleUploadModal(); };
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; setApiKey(val); process.env.API_KEY = val; };

  // --- IMAGE ANALYSIS HANDLERS ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => { setSelectedImage(reader.result as string); setAnalysisResult(null); }; reader.readAsDataURL(file); } };
  const handleCustomOrbitImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => { setCustomOrbitImage(reader.result as string); }; reader.readAsDataURL(file); } };
  
  const analyzeOrbitImage = async () => { if (!customOrbitImage) return; setIsAnalyzingOrbit(true); try { const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); const base64Data = customOrbitImage.split(',')[1]; const promptText = `Analyze the attached vibration orbit plot image. Extract the shape of the orbit trace (the main blue loop). Return a JSON object with: 1. 'coordinates': A key containing an array of exactly 360 [x, y] pairs representing the path of the loop, normalized between -1.0 and 1.0. Order the points sequentially to form a continuous closed loop. 2. 'description': A concise professional description of the orbit shape (e.g., 'Figure-8 loop', 'Flattened ellipse', 'Banana shape', 'Circular with internal loop').`; const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: { parts: [ { inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: promptText } ] }, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { coordinates: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "A pair of x, y coordinates", }, }, description: { type: Type.STRING } }, } } }); if (response.text) { const data = JSON.parse(response.text); if (data.coordinates && Array.isArray(data.coordinates)) { setCustomOrbitPath(data.coordinates, data.description); if (!isOrbitPlotOpen) toggleOrbitPlot(); } } } catch (error) { console.error("Gemini Orbit Error:", error); alert("Failed to analyze orbit image. Please check API Key and image."); } finally { setIsAnalyzingOrbit(false); } };
  
  const analyzeSpectrum = async () => { if (!selectedImage) return; setAnalyzing(true); try { const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); const base64Data = selectedImage.split(',')[1]; const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: { parts: [ { inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: `Analyze this vibration spectrum image. Extract dominant amplitude and harmonics.` } ] }, config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { amplitude: { type: Type.NUMBER }, phase: { type: Type.NUMBER }, harmonics: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { order: { type: Type.NUMBER }, amplitudeRatio: { type: Type.NUMBER } } } } } } } }); if (response.text) { const data = JSON.parse(response.text); setAnalysisResult(data); } } catch (error) { console.error("Gemini Error:", error); alert("Failed to analyze image. Ensure API Key is configured in Settings."); } finally { setAnalyzing(false); } };
  const applyAISimulation = () => { if (!selectedPoint || !analysisResult) return; const updates = { amplitude: analysisResult.amplitude || 0, phaseMeas: analysisResult.phase || 0, harmonics: analysisResult.harmonics?.map((h: any) => ({ order: h.order, amplitudeRatio: h.amplitudeRatio, phaseShift: 0 })) || [] }; updatePoint(selectedPoint.id, { [activeAxis]: updates }); toggleUploadModal(); };
  
  // --- HELPERS FOR DATA FORMATTING ---
  const buildDataString = () => {
      let dataString = "";
      if (appMode === 'ODS') {
          points.forEach(p => {
              dataString += `\nPOINT [${p.label} (ID: ${p.id})] ${p.isReference ? '<<REFERENCE PHASE>>' : ''}\n`;
              ['vertical', 'horizontal', 'axial'].forEach(axis => {
                  const comp = p[axis as 'vertical' | 'horizontal' | 'axial'];
                  dataString += `  - ${axis.toUpperCase()}: ${comp.amplitude.toFixed(2)} mm/s @ ${comp.phaseMeas.toFixed(0)}°`;
                  if (comp.harmonics && comp.harmonics.length > 0) {
                      const harmonicDesc = comp.harmonics.map(h => `${h.order}X: ${(h.amplitudeRatio * comp.amplitude).toFixed(2)} mm/s`).join(', ');
                      dataString += ` | Harmonics: [${harmonicDesc}]`;
                  } else {
                      dataString += ` | Dominant 1X`;
                  }
                  dataString += '\n';
              });
          });
      } else {
          if (isSimulatingCustomOrbit && customOrbitDescription) {
              dataString += `\n\n**VISUAL INSPECTION (CUSTOM ORBIT):**\nThe user has identified and traced the following orbit shape: "${customOrbitDescription}".\nUse this visual confirmation as a PRIMARY factor in your diagnosis.\n`;
          }
          const probeX = orbitPoints.find(p => p.id === 'probe-x');
          const probeY = orbitPoints.find(p => p.id === 'probe-y');
          [probeX, probeY].forEach(p => {
              if (!p) return;
              const comp = p.horizontal; 
              dataString += `\nPROBE [${p.label}]\n`;
              dataString += `  - Amplitude: ${comp.amplitude.toFixed(2)} µm pp (Peak-to-Peak)\n`;
              dataString += `  - Phase: ${comp.phaseMeas.toFixed(0)}°\n`;
              if (comp.harmonics && comp.harmonics.length > 0) {
                  const harmonicDesc = comp.harmonics.map(h => `${h.order}X: ${(h.amplitudeRatio * comp.amplitude).toFixed(2)} µm`).join(', ');
                  dataString += `  - Spectrum Peaks: [${harmonicDesc}]\n`;
              } else {
                  dataString += `  - Spectrum: Dominant 1X\n`;
              }
          });
      }
      return dataString;
  };

  const getDiagnosticsPrompt = (dataString: string, context: string, caseNotesStr: string = "") => {
      if (appMode === 'ODS') {
          return `
Role: Senior Vibration Analyst (Mobius Category IV certified).
Objective: Analyze the provided vibration data and user context to generate a professional failure diagnostics report.
Standards: Reference ISO 10816-3 (Group 1: Large rigid machines) for severity and Mobius Institute spectral patterns for fault identification.

User Context: "${context}"
${caseNotesStr ? `\nAdditional Case Notes Derived from Investigation:\n${caseNotesStr}\n` : ''}

Vibration Data (Amplitude in mm/s RMS, Phase in Degrees):
${dataString}

Instructions:
1. Relate the vibration data (Direction, Amplitude, Phase shifts between points) to the User Context.
2. Identify specific faults (e.g., Static Unbalance vs Couple Unbalance, Angular vs Parallel Misalignment, Soft Foot, etc.).
3. Note that 'REFERENCE PHASE' marks the 0-degree measuring point. Use phase differences (e.g., 180 deg shift across coupling) for diagnosis.

Return a JSON object strictly adhering to this schema:
{
  "machineHealth": "Good" | "Satisfactory" | "Unsatisfactory" | "Unacceptable",
  "isoCheck": "string describing ISO compliance status",
  "faults": [ 
      { "faultName": "string", "probability": "Low"|"Medium"|"High", "reasoning": "string referencing specific data points/phases" } 
  ],
  "recommendations": [ "string", "string" ]
}
          `;
      } else {
          return `
Role: Senior Machinery Diagnostician & Tribologist.
Objective: Analyze Shaft Relative Vibration (Proximity Probe Orbit/Timebase) data for a Sleeve Bearing machine.
Standards: Reference ISO 7919-3, API 670, and Mobius Orbit Patterns.

User Context: "${context}"
${caseNotesStr ? `\nAdditional Case Notes Derived from Investigation:\n${caseNotesStr}\n` : ''}

Vibration Data (Displacement in microns/µm Peak-to-Peak):
${dataString}

Instructions:
1. Analyze the relationship between Probe X and Probe Y data. 
   - Equal amplitudes with 90° phase shift typically indicates Unbalance (Circular Orbit).
   - High 1X with 0° or 180° phase shift often indicates Misalignment (Elliptical/Banana Orbit).
   - Presence of Sub-synchronous peaks (0.4X - 0.48X) indicates Oil Whirl / Fluid Instability.
   - Integer harmonics (2X, 3X) often indicate Looseness, Rub, or Crack.
2. Infer the likely Orbit Shape based on the X/Y amplitude ratio and phase difference.
3. Provide recommendations specific to Fluid Film bearings (e.g., check oil temperature, verify clearances, check alignment).

Return a JSON object strictly adhering to this schema:
{
  "machineHealth": "Good" | "Satisfactory" | "Unsatisfactory" | "Unacceptable",
  "isoCheck": "string describing ISO 7919 / API compliance",
  "faults": [ 
      { "faultName": "string", "probability": "Low"|"Medium"|"High", "reasoning": "string referencing specific orbit characteristics" } 
  ],
  "recommendations": [ "string", "string" ]
}
          `;
      }
  };

  // --- DIAGNOSTICS FEATURE ---
  const handleDiagnosticsClick = () => {
      setIsContextModalOpen(true);
  };

  // Renamed from generateDiagnosticsReport to support new flow
  const runBaselineDiagnostics = async () => {
      setIsContextModalOpen(false);
      setIsGeneratingReport(true);
      clearChat();
      
      try {
          const dataString = buildDataString();
          const promptText = getDiagnosticsPrompt(dataString, contextInput);

          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
              model: 'gemini-3-pro-preview',
              contents: {
                  parts: [{ text: promptText }]
              },
              config: { responseMimeType: "application/json" }
          });

          if (response.text) {
              const baseline = JSON.parse(response.text);
              setBaselineDiagnostic(baseline);
              setChatbotOpen(true); // Open Chatbot instead of Report
              
              // Seed initial chat
              addChatMessage({
                  role: 'model',
                  text: `I've analyzed the baseline data. The machine appears to be in **${baseline.machineHealth}** condition. I've identified potential issues with: ${baseline.faults.map((f:any) => f.faultName).join(', ')}. \n\nBefore I finalize the report, do you have any specific observations, or would you like to upload maintenance logs/photos to refine the diagnosis?`,
                  timestamp: Date.now()
              });
          }
      } catch (error) {
          console.error("Baseline Diagnostics Error", error);
          alert("Failed to generate baseline. Check API Key.");
      } finally {
          setIsGeneratingReport(false);
      }
  };

  // --- CHATBOT HANDLERS ---
  const handleChatSubmit = async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!chatInput.trim() && uploadedFiles.length === 0) return;
      
      const userMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: Date.now() };
      addChatMessage(userMsg);
      setChatInput("");
      setIsChatProcessing(true);

      try {
          // Construct Context for Chat
          const dataString = buildDataString();
          const baselineStr = JSON.stringify(baselineDiagnosticMemory);
          const fileContext = uploadedFiles.map(f => `FILE [${f.name}]: ${f.content}`).join('\n\n');
          
          const systemContext = `
Role: You are an expert Rotating Equipment Failure Investigator and ISO Category IV Vibration Analyst.
Objective: Collaborate with the user to determine the root cause of the machine's vibration issues.

Context:
- Vibration Data: ${dataString}
- Initial Analysis (Baseline): ${baselineStr}
- User Provided Context: ${contextInput}
- File Contents: ${fileContext}

Instructions:
1. **Tone & Style**: You are investigating. Start EVERY response with a brief, single-sentence acknowledgement of the user's input (e.g., "I see the vibration is high at 1X.", "Understood, the soft foot check passed."). Then immediately ask a relevant follow-up question or suggest a specific check.
2. **No Jumping to Conclusions**: Do not output the full diagnosis JSON or a final conclusion list in every turn. Only provide the final conclusion when the user explicitly asks for the report or when you have gathered sufficient evidence (e.g. "This strongly suggests misalignment. Shall I finalize the report?").
3. **Interactive Investigation**: Guide the user step-by-step. If they upload a spectrum, analyze it first. If they describe a symptom, check it against the machine data.
4. **Memory**: Remember details from the chat history. If the user ruled out "Soft Foot" earlier, do not suggest it again unless new evidence appears.

Current Conversation History is provided in the message history. Respond to the latest user input.
          `;

          const history = chatMessages.map(m => ({
              role: m.role,
              parts: [{ text: m.text }]
          }));

          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const chat = ai.chats.create({
              model: 'gemini-3-pro-preview',
              config: { systemInstruction: systemContext },
              history: history
          });

          const result = await chat.sendMessage({ message: userMsg.text });
          addChatMessage({
              role: 'model',
              text: result.text || "", 
              timestamp: Date.now()
          });

          // Background: Update Case Notes (Simplified for now - just appending thought process)
          updateCaseNotes({ 
              conditions: [...caseNotes.conditions, `User Input: ${userMsg.text}`] 
          });

      } catch (err) {
          console.error("Chat Error", err);
          addChatMessage({ role: 'model', text: "Error connecting to AI assistant.", timestamp: Date.now() });
      } finally {
          setIsChatProcessing(false);
      }
  };

  const handleFileUploadChat = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
          const content = evt.target?.result as string;
          let extractedText = "";
          
          if (file.type.startsWith('image/')) {
              // Image Handling
              try {
                  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                  const base64Data = content.split(',')[1];
                  const resp = await ai.models.generateContent({
                      model: 'gemini-2.5-flash-image',
                      contents: { parts: [{ inlineData: { mimeType: file.type, data: base64Data } }, { text: "Describe this machinery image in technical detail for diagnostic purposes." }] }
                  });
                  extractedText = `[Image Analysis]: ${resp.text}`;
              } catch (err) { extractedText = "[Error analyzing image]"; }
          } else {
              // Text/CSV Handling
              extractedText = content; // Raw text
          }

          const newFile: UploadedFile = {
              name: file.name,
              type: file.type.startsWith('image') ? 'image' : 'text',
              content: extractedText
          };
          addUploadedFile(newFile);
          addChatMessage({ role: 'model', text: `Analyzed ${file.name}. Added to diagnostic context.`, timestamp: Date.now() });
      };

      if (file.type.startsWith('image/')) {
          reader.readAsDataURL(file);
      } else {
          reader.readAsText(file);
      }
  };

  const runFinalReport = async () => {
      setChatbotOpen(false);
      setIsGeneratingReport(true);
      
      try {
          const dataString = buildDataString();
          
          // Construct Enriched Context
          const chatHistoryStr = chatMessages.map(m => `${m.role === 'user' ? 'USER' : 'ANALYST'}: ${m.text}`).join('\n');
          const fileContext = uploadedFiles.map(f => `FILE [${f.name}]: ${f.content}`).join('\n\n');
          
          const enrichedNotes = `
*** INVESTIGATION SUMMARY ***
The following is a transcript of the investigation between the User and the AI Analyst. 
Use this to override the baseline diagnosis if specific conclusions were reached or negotiated.

BASELINE DIAGNOSIS (Initial): ${JSON.stringify(baselineDiagnosticMemory)}

FULL CHAT TRANSCRIPT:
${chatHistoryStr}

UPLOADED EVIDENCE:
${fileContext}

INSTRUCTION FOR REPORT GENERATION:
- If the User and Analyst agreed on a fault (e.g., "It is definitely Looseness"), the report MUST conclude that fault with High Probability.
- If the User ruled out a fault (e.g., "Soft foot check was passed"), do not list it as a probable fault.
- Synthesize the "Reasoning" based on the vibration data AND the chat discussion.
          `;
          
          const promptText = getDiagnosticsPrompt(dataString, contextInput, enrichedNotes);

          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
              model: 'gemini-3-pro-preview',
              contents: {
                  parts: [{ text: promptText }]
              },
              config: { responseMimeType: "application/json" }
          });

          if (response.text) {
              const report = JSON.parse(response.text);
              setDiagnosticReport(report);
              setIsReportModalOpen(true);
          }
      } catch (error) {
          console.error("Final Report Error", error);
          alert("Failed to generate final report.");
          setChatbotOpen(true); // Reopen chat if failed
      } finally {
          setIsGeneratingReport(false);
      }
  };

  const handleSaveProject = () => { setSaveProjectTitle(""); setIsSaveModalOpen(true); };
  const confirmSaveProject = () => { if (!saveProjectTitle.trim()) { alert("Please enter a project title"); return; } const title = saveProjectTitle.trim(); const newProj = { name: title, data: points }; const updated = [...projects.filter(p => p.name !== title), newProj]; setProjects(updated); setCurrentProject(title); localStorage.setItem('ods_projects', JSON.stringify(updated)); setIsSaveModalOpen(false); };
  const requestDeleteProject = (e: React.MouseEvent, name: string) => { e.preventDefault(); e.stopPropagation(); setProjectToDelete(name); setIsDeleteModalOpen(true); setIsProjectDropdownOpen(false); };
  const confirmDeleteProject = () => { if (projectToDelete) { const updated = projects.filter(p => p.name !== projectToDelete); setProjects(updated); localStorage.setItem('ods_projects', JSON.stringify(updated)); if (currentProject === projectToDelete) setCurrentProject(""); } setIsDeleteModalOpen(false); setProjectToDelete(null); };
  const loadProject = (name: string) => { setCurrentProject(name); setIsProjectDropdownOpen(false); if (!name) return; const proj = projects.find(p => p.name === name); if (proj) setAllPoints(proj.data); };
  const handleDownloadConfig = () => { const data = points.map(p => ({ ID: p.id, Label: p.label, 'Vertical Amp': p.vertical.amplitude, 'Vertical Phase': p.vertical.phaseMeas, 'Horizontal Amp': p.horizontal.amplitude, 'Horizontal Phase': p.horizontal.phaseMeas, 'Axial Amp': p.axial.amplitude, 'Axial Phase': p.axial.phaseMeas })); const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "ODS Data"); XLSX.writeFile(wb, "ods_config_template.xlsx"); };
  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { const arrayBuffer = evt.target?.result; if (arrayBuffer) { try { const wb = XLSX.read(arrayBuffer, { type: 'array' }); const wsname = wb.SheetNames[0]; const ws = wb.Sheets[wsname]; const data = XLSX.utils.sheet_to_json(ws); if (Array.isArray(data)) { const updatedPoints = points.map(p => { const row: any = data.find((r: any) => r.ID === p.id); if (row) { const val = (v: any) => { const parsed = parseFloat(v); return isNaN(parsed) ? 0 : parsed; }; return { ...p, vertical: { ...p.vertical, amplitude: val(row['Vertical Amp']), phaseMeas: val(row['Vertical Phase']) }, horizontal: { ...p.horizontal, amplitude: val(row['Horizontal Amp']), phaseMeas: val(row['Horizontal Phase']) }, axial: { ...p.axial, amplitude: val(row['Axial Amp']), phaseMeas: val(row['Axial Phase']) } }; } return p; }); setAllPoints(updatedPoints); setShowDataManager(false); alert("Data imported successfully!"); } } catch (err) { console.error("Excel Import Error", err); alert("Failed to parse Excel file. Please ensure it matches the template format."); } } }; reader.readAsArrayBuffer(file); e.target.value = ''; };

  const exportReportToPDF = () => {
      if (!diagnosticReport) return;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20; // Increased margin for safety
      const contentWidth = pageWidth - (margin * 2);
      let cursorY = 20;
      const lineHeight = 6; // Standard line height for 11pt text

      // Helper function to manage page breaks
      const checkPageBreak = (heightNeeded: number) => {
          if (cursorY + heightNeeded > pageHeight - margin) {
              doc.addPage();
              cursorY = 20;
              // Small continuation header
              doc.setFontSize(8);
              doc.setTextColor(150);
              doc.text("Pro ODS Simulator Report - Continued", margin, 10);
              doc.setTextColor(0);
          }
      };

      // --- HEADER ---
      doc.setFontSize(22);
      doc.setTextColor(0, 80, 180); 
      const title = appMode === 'ODS' ? "ODS Diagnostics Report" : "Orbit Analysis Report";
      doc.text(title, margin, cursorY);
      cursorY += 10;

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Date: ${new Date().toLocaleString()}`, margin, cursorY);
      cursorY += 5;
      doc.text("Generated by: Pro ODS Simulator AI", margin, cursorY);
      cursorY += 8;
      
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 10;

      // --- HEALTH SECTION ---
      checkPageBreak(40);
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text("1. Machine Health Assessment", margin, cursorY);
      cursorY += 10;
      
      // Status
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Overall Condition: `, margin, cursorY);
      const statusWidth = doc.getTextWidth(`Overall Condition: `);
      
      // Color code the status
      const status = diagnosticReport.machineHealth;
      if (status === 'Good') doc.setTextColor(0, 150, 0);
      else if (status === 'Satisfactory') doc.setTextColor(200, 150, 0);
      else doc.setTextColor(200, 0, 0);
      
      doc.text(status, margin + statusWidth, cursorY);
      doc.setTextColor(0);
      doc.setFont(undefined, 'normal');
      cursorY += 8;
      
      // ISO Text
      doc.setFontSize(11);
      const isoPrefix = `${appMode === 'ODS' ? 'ISO 10816' : 'ISO 7919/API'} Compliance: `;
      const isoFull = `${isoPrefix}${diagnosticReport.isoCheck}`;
      const splitIso = doc.splitTextToSize(isoFull, contentWidth);
      const isoBlockH = splitIso.length * lineHeight;
      
      checkPageBreak(isoBlockH);
      doc.text(splitIso, margin, cursorY);
      cursorY += isoBlockH + 10;

      // --- FAULTS SECTION ---
      checkPageBreak(20);
      doc.setFontSize(16);
      doc.text("2. Identified Faults", margin, cursorY);
      cursorY += 10;
      
      doc.setFontSize(11);
      diagnosticReport.faults.forEach((f: any, index: number) => {
          // Fault Header: Name + Probability
          const faultTitle = `${index + 1}. ${f.faultName}`;
          const probStr = `[${f.probability} Probability]`;
          
          doc.setFont(undefined, 'bold');
          const titleWidth = doc.getTextWidth(faultTitle);
          const probWidth = doc.getTextWidth(probStr);
          
          // Check if header fits on one line
          const headerFits = (margin + titleWidth + probWidth + 5) < (pageWidth - margin);
          const headerHeight = headerFits ? lineHeight + 2 : (lineHeight * 2) + 2;
          
          // Calculate body height
          doc.setFont(undefined, 'normal'); // Reset for calculation
          const reasoningPrefix = "Analysis: ";
          const splitReason = doc.splitTextToSize(reasoningPrefix + f.reasoning, contentWidth - 5); // Indent slightly
          const bodyHeight = splitReason.length * lineHeight;
          
          const totalBlockHeight = headerHeight + bodyHeight + 8; // +8 spacing
          
          checkPageBreak(totalBlockHeight);
          
          // Draw Header
          doc.setFont(undefined, 'bold');
          doc.setTextColor(0);
          doc.text(faultTitle, margin, cursorY);
          
          doc.setFontSize(10);
          if (f.probability === 'High') doc.setTextColor(200, 0, 0);
          else if (f.probability === 'Medium') doc.setTextColor(200, 140, 0);
          else doc.setTextColor(0, 150, 0);
          
          if (headerFits) {
              doc.text(probStr, pageWidth - margin - probWidth, cursorY); // Align right
              cursorY += 7;
          } else {
              cursorY += 5;
              doc.text(probStr, margin + 5, cursorY);
              cursorY += 7;
          }
          
          // Draw Body
          doc.setFontSize(11);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(50);
          doc.text(splitReason, margin + 5, cursorY);
          cursorY += bodyHeight + 8;
          doc.setTextColor(0);
      });
      
      cursorY += 5;

      // --- RECOMMENDATIONS SECTION ---
      checkPageBreak(20);
      doc.setFontSize(16);
      doc.text("3. Recommendations", margin, cursorY);
      cursorY += 10;
      
      doc.setFontSize(11);
      diagnosticReport.recommendations.forEach((rec: string) => {
          const bullet = "• ";
          // Calculate wrapped text width accounting for bullet indent
          const textWidth = contentWidth - 5; 
          const splitRec = doc.splitTextToSize(rec, textWidth);
          const recHeight = splitRec.length * lineHeight;
          
          checkPageBreak(recHeight + 4);
          
          doc.text(bullet, margin, cursorY);
          doc.text(splitRec, margin + 5, cursorY);
          cursorY += recHeight + 4;
      });
      
      // Footer/End of Report
      checkPageBreak(20);
      cursorY += 10;
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text("--- End of Report ---", pageWidth / 2, cursorY, { align: 'center' });

      doc.save(`${appMode}_Diagnostics_Report.pdf`);
  };

  const currentComponent = selectedPoint ? selectedPoint[activeAxis] : { amplitude: 0, phaseMeas: 0 };
  const unitLabel = appMode === 'ORBIT' ? (isKeyphasor ? 'Volts' : 'µm') : 'mm/s';
  const showPhase = appMode === 'ODS' || isKeyphasor; 

  return (
    <>
    <AnalysisWindow />
    <OrbitWindow />
    <OrbitLiveDashboard />

    {/* ... (Main Interface Panel - Unchanged) */}
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-[60]">
      <div className="flex flex-col gap-4 pointer-events-auto max-w-xs w-full">
        <div className="bg-slate-900/95 border border-slate-700 p-4 rounded-md backdrop-blur-md shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-2">
            <div className="flex items-center gap-2">
                <Activity className="text-cyan-400 w-5 h-5" />
                <h1 className="text-cyan-400 font-bold tracking-wider text-sm uppercase flex gap-2">
                    <span onClick={() => setAppMode('ODS')} className={`cursor-pointer hover:text-white transition-colors ${appMode === 'ODS' ? 'text-cyan-400 underline underline-offset-4' : 'text-slate-500'}`}>ODS Simulator</span>
                    <span className="text-slate-600">/</span>
                    <span onClick={() => setAppMode('ORBIT')} className={`cursor-pointer hover:text-white transition-colors ${appMode === 'ORBIT' ? 'text-cyan-400 underline underline-offset-4' : 'text-slate-500'}`}>Orbit</span>
                </h1>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={toggleSettings} className="text-slate-400 hover:text-white" title="Settings"><Settings className="w-4 h-4" /></button>
                <button 
                    onClick={() => setIsPanelCollapsed(!isPanelCollapsed)} 
                    className="text-slate-400 hover:text-white" 
                    title={isPanelCollapsed ? "Expand Panel" : "Minimize Panel"}
                >
                    {isPanelCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
            </div>
          </div>
          
          {!isPanelCollapsed && (
            <div className="space-y-5 animate-in fade-in slide-in-from-top-4 duration-300">
                {appMode === 'ODS' && (
                    <div className="space-y-1 relative">
                        <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><Folder className="w-3 h-3" /> Project</label>
                        <div 
                            className="relative w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded p-2 flex justify-between items-center cursor-pointer hover:bg-slate-750 transition-colors"
                            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                        >
                            <span className="truncate">{currentProject || "-- Current / Unsaved --"}</span>
                            <ChevronDown className={`w-3 h-3 transition-transform ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
                        </div>
                        
                        {isProjectDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsProjectDropdownOpen(false)} />
                                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-600 rounded shadow-xl z-50 max-h-40 overflow-y-auto">
                                    <div onClick={() => loadProject("")} className={`p-2 text-xs cursor-pointer hover:bg-slate-800 border-b border-slate-700/50 ${currentProject === "" ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>-- Current / Unsaved --</div>
                                    {projects.map(p => (
                                        <div key={p.name} className="flex items-center justify-between p-2 hover:bg-slate-800 group border-b border-slate-800/50 last:border-0 relative">
                                            <div onClick={() => loadProject(p.name)} className={`flex-1 text-xs cursor-pointer truncate ${currentProject === p.name ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>{p.name}</div>
                                            <button type="button" onClick={(e) => requestDeleteProject(e, p.name)} className="text-slate-500 hover:text-red-400 p-1.5 transition-colors z-10 relative rounded hover:bg-slate-700" title="Delete Project"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ))}
                                    {projects.length === 0 && <div className="p-2 text-[10px] text-slate-500 italic text-center">No saved projects</div>}
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><Settings2 className="w-3 h-3" /> Fault Condition</label>
                    <div className="relative">
                        <select onChange={handleModeChange} value={appMode === 'ODS' ? currentMode : currentOrbitFault} className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded p-2 focus:ring-1 focus:ring-cyan-500 outline-none appearance-none cursor-pointer hover:bg-slate-750 transition-colors">
                            {appMode === 'ODS' ? (
                                <>
                                    <option value={ODSMode.Manual}>Manual Analysis</option>
                                    <optgroup label="Unbalance">
                                        <option value={ODSMode.UnbalanceStatic}>Static Unbalance</option>
                                        <option value={ODSMode.UnbalanceCouple}>Couple Unbalance</option>
                                        <option value={ODSMode.UnbalanceDynamic}>Dynamic Unbalance</option>
                                        <option value={ODSMode.UnbalanceOverhung}>Overhung Rotor</option>
                                    </optgroup>
                                    <optgroup label="Misalignment">
                                        <option value={ODSMode.AngularMisalignment}>Angular Misalignment</option>
                                        <option value={ODSMode.ParallelMisalignment}>Parallel Misalignment</option>
                                        <option value={ODSMode.MisalignmentCombo}>Combined Misalignment</option>
                                    </optgroup>
                                    <optgroup label="Eccentricity / Bent Shaft">
                                        <option value={ODSMode.BentShaft}>Bent Shaft</option>
                                        <option value={ODSMode.EccentricRotor}>Eccentric Rotor</option>
                                    </optgroup>
                                    <optgroup label="Mechanical Looseness">
                                        <option value={ODSMode.LoosenessStructural}>Structural Looseness (Type A)</option>
                                        <option value={ODSMode.LoosenessRocking}>Rocking Looseness (Type B)</option>
                                        <option value={ODSMode.LoosenessBearing}>Bearing Loose Fit (Type C)</option>
                                        <option value={ODSMode.SoftFoot}>Soft Foot</option>
                                    </optgroup>
                                    <optgroup label="Bearings & Resonance">
                                        <option value={ODSMode.ResonanceVert}>Vertical Resonance</option>
                                    </optgroup>
                                </>
                            ) : (
                                <>
                                    <option value={OrbitFault.Manual}>Manual Config</option>
                                    <optgroup label="Common Faults">
                                        <option value={OrbitFault.Unbalance}>Unbalance (1X Circle)</option>
                                        <option value={OrbitFault.Misalignment}>Misalignment (Banana/Ellipse)</option>
                                        <option value={OrbitFault.ShaftCrack}>Shaft Crack (1X + 2X Loop)</option>
                                        <option value={OrbitFault.RotorBow}>Rotor Bow (High 1X)</option>
                                    </optgroup>
                                    <optgroup label="Fluid Film / Bearings">
                                        <option value={OrbitFault.OilWhirl}>Oil Whirl (0.4X - 0.48X)</option>
                                        <option value={OrbitFault.OilWhip}>Oil Whip (Locked Sub-sync)</option>
                                        <option value={OrbitFault.Preload}>Radial Preload (Flattened)</option>
                                    </optgroup>
                                    <optgroup label="Transient / Mechanical">
                                        <option value={OrbitFault.Rub}>Rub (Truncated/Bouncing)</option>
                                        <option value={OrbitFault.Looseness}>Mechanical Looseness</option>
                                        <option value={OrbitFault.Resonance}>Resonance (Phase Shift)</option>
                                    </optgroup>
                                </>
                            )}
                        </select>
                    </div>
                </div>

                <div className="space-y-1">
                <div className="flex justify-between items-center">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1"><Gauge className="w-3 h-3" /> Animation Speed</label>
                    <span className="text-xs text-cyan-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">{animationRpm} CPM</span>
                </div>
                <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                    {speedOptions.map((opt) => (
                        <button key={opt.label} onClick={() => setAnimationRpm(opt.val)} className={`flex-1 text-[9px] uppercase font-bold py-1.5 rounded transition-all ${animationRpm === opt.val ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}>{opt.label}</button>
                    ))}
                </div>
                </div>

                <div className="space-y-1">
                <div className="flex justify-between items-center">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Motion Amplification</label>
                    <span className="text-xs text-yellow-500 font-mono bg-slate-800 px-1.5 py-0.5 rounded">{globalGain.toFixed(1)}x</span>
                </div>
                <input type="range" min="0.1" max="25" step="0.1" value={globalGain} onChange={(e) => setGlobalGain(Number(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500 hover:accent-yellow-400" />
                </div>
                
                <div className="flex gap-2 pt-2">
                    <button onClick={togglePlay} className={`flex-1 flex items-center justify-center gap-2 text-xs font-bold py-2 rounded transition-all ${isPlaying ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50'}`}>{isPlaying ? <><Pause className="w-3 h-3" /> FREEZE</> : <><Play className="w-3 h-3" /> SIMULATE</>}</button>
                    <button onClick={toggleWireframe} className={`px-3 flex items-center justify-center rounded border transition-all ${wireframe ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`} title="Toggle Housing Visibility">{wireframe ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
                </div>

                {appMode === 'ODS' && (
                    <div className="flex gap-2 pt-2">
                        <button onClick={toggleVectors} className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-2 rounded border transition-all ${showVectors ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}>
                            {showVectors ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} VECTORS
                        </button>
                        <button onClick={toggleHeatMap} className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-2 rounded border transition-all ${isHeatMapMode ? 'bg-red-600 text-white border-red-500 shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}>
                            <Flame className="w-3 h-3" /> HEAT CAM
                        </button>
                    </div>
                )}
                
                {appMode === 'ODS' && (
                    <>
                        <button onClick={toggleAnalysisMode} className={`w-full mt-2 flex items-center justify-center gap-2 text-xs font-bold py-2 rounded border transition-all ${isAnalysisMode ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_10px_rgba(147,51,234,0.5)]' : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'}`}><LineChart className="w-3 h-3" /> {isAnalysisMode ? 'ANALYZER ACTIVE' : 'ENABLE ANALYZER'}</button>
                        <button onClick={() => setShowDataManager(true)} className="w-full mt-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded border border-slate-600 transition-all"><Table className="w-3 h-3" /> DATA MANAGER</button>
                        
                        {/* DIAGNOSTICS BUTTON */}
                        <button onClick={handleDiagnosticsClick} className="w-full mt-3 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-bold py-3 rounded border border-indigo-500/50 shadow-lg transition-all" disabled={isGeneratingReport}>
                            {isGeneratingReport ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <ClipboardList className="w-3 h-3" />}
                            {isGeneratingReport ? 'DIAGNOSING...' : 'RUN DIAGNOSTICS'}
                        </button>
                    </>
                )}

                {appMode === 'ORBIT' && (
                    <div className="flex flex-col gap-2 mt-2">
                        <div className="flex gap-2">
                            <button onClick={toggleOrbitPlot} className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-3 rounded border transition-all ${isOrbitPlotOpen ? 'bg-yellow-600 text-white border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-slate-800 text-yellow-500 border-slate-600 hover:bg-slate-700'}`}><Scan className="w-3 h-3" /> OPEN ORBIT PLOT</button>
                            <button onClick={toggleOrbitSimulation} className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-3 rounded border transition-all ${isOrbitSimulationVisible ? 'bg-cyan-600 text-white border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-slate-800 text-cyan-400 border-slate-600 hover:bg-slate-700'}`}><Waves className="w-3 h-3" /> SIMULATE ORBIT</button>
                        </div>
                        <button onClick={toggleCustomOrbitModal} className="w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all"><PencilRuler className="w-3 h-3" /> Custom Orbit</button>
                        <button onClick={toggleFilterModal} className="w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-all"><Filter className="w-3 h-3" /> Filter Options</button>
                        <button onClick={toggleAnalysisMode} className={`w-full flex items-center justify-center gap-2 text-xs font-bold py-2 rounded border transition-all ${isAnalysisMode ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_10px_rgba(147,51,234,0.5)]' : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'}`}><LineChart className="w-3 h-3" /> {isAnalysisMode ? 'ANALYZER ACTIVE' : 'ENABLE ANALYZER'}</button>
                        
                        {/* ORBIT DIAGNOSTICS BUTTON */}
                        <button onClick={handleDiagnosticsClick} className="w-full mt-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-bold py-3 rounded border border-indigo-500/50 shadow-lg transition-all" disabled={isGeneratingReport}>
                            {isGeneratingReport ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <ClipboardList className="w-3 h-3" />}
                            {isGeneratingReport ? 'DIAGNOSING...' : 'RUN DIAGNOSTICS'}
                        </button>
                    </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Sensor Config Point - Unchanged */}
      {selectedPoint && !isAnalysisMode && (
        <div className="absolute top-4 right-4 pointer-events-auto w-72 z-[60]">
             <div className="bg-slate-900/95 border border-yellow-500/50 p-4 rounded-md backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-2">
                    <div className="flex items-center gap-2">
                        <Target className="text-yellow-500 w-4 h-4" />
                        <h2 className="text-yellow-500 font-bold text-xs uppercase tracking-wide">{isKeyphasor ? 'Keyphasor Config' : 'Sensor Config'}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={toggleUploadModal} className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded flex items-center gap-1 transition-colors"><UploadCloud className="w-3 h-3" /> Custom</button>
                        <div className="text-[10px] text-slate-500 font-mono">{selectedPoint.id}</div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] text-slate-400 uppercase font-semibold">Location</label>
                        <div className="text-sm font-medium text-white">{selectedPoint.label}</div>
                    </div>
                    
                    {appMode === 'ODS' && (
                        <div className="flex bg-slate-800 rounded p-1 gap-1">
                            <button onClick={() => setActiveAxis('horizontal')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold transition-all ${activeAxis === 'horizontal' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}><ArrowRightLeft className="w-3 h-3" /> HOR</button>
                            <button onClick={() => setActiveAxis('vertical')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold transition-all ${activeAxis === 'vertical' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}><ArrowUpDown className="w-3 h-3" /> VERT</button>
                            <button onClick={() => setActiveAxis('axial')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold transition-all ${activeAxis === 'axial' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}><Move className="w-3 h-3" /> AXL</button>
                        </div>
                    )}

                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] text-slate-400 uppercase font-semibold">{isKeyphasor ? 'Voltage (Pk-Pk)' : 'Amplitude'} <span className="text-slate-500 lowercase ml-1">({unitLabel})</span></label>
                            <input type="number" min="0" max="200" step="0.1" value={currentComponent.amplitude} onChange={(e) => updateComponent('amplitude', parseFloat(e.target.value) || 0)} className="w-16 text-xs text-white font-mono bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded focus:border-cyan-500 focus:outline-none" />
                        </div>
                        <input type="range" min="0" max={appMode === 'ORBIT' ? 100 : 10} step="0.1" value={currentComponent.amplitude} onChange={(e) => updateComponent('amplitude', Number(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white" />
                    </div>

                    {showPhase && (
                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-400 uppercase font-semibold">{isKeyphasor ? 'Reference Phase Angle' : 'Phase Angle'}</label>
                                 <div className="flex items-center">
                                    <input type="number" min="-180" max="180" step="1" value={currentComponent.phaseMeas} onChange={(e) => updateComponent('phaseMeas', parseFloat(e.target.value) || 0)} className={`w-12 text-xs text-white font-mono bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded focus:border-cyan-500 focus:outline-none`} />
                                    <span className="ml-1 text-xs text-slate-500">°</span>
                                </div>
                            </div>
                            <div className="relative w-full h-6 flex items-center">
                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500 z-0"></div>
                                <input type="range" min="-180" max="180" step="1" value={currentComponent.phaseMeas} onChange={(e) => updateComponent('phaseMeas', Number(e.target.value))} className={`w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer z-10 accent-white`} />
                            </div>
                        </div>
                    )}
                    
                    {isKeyphasor && (
                         <div className="text-[9px] text-slate-500 italic">Keyphasor sets the T=0 trigger reference for the orbit dot.</div>
                    )}
                </div>
             </div>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 pointer-events-auto bg-black/50 px-3 py-1 rounded-full backdrop-blur text-center z-[60]">
        <div>Mouse: Left Click Rotate • Right Click Pan • Scroll Zoom • Click Nodes to Edit • Click Background to Close</div>
        <div className="mt-0.5">Developed by: Mohamed Al Amri</div>
      </div>

    {/* FILTER OPTIONS MODAL - Unchanged */}
    {isFilterModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto">
             <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-sm flex flex-col animate-in fade-in zoom-in-95 duration-200">
                 <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                    <div className="flex items-center gap-2"><Filter className="text-cyan-400 w-5 h-5" /><h2 className="text-white font-bold text-sm uppercase">Orbit Filtering</h2></div>
                    <button onClick={toggleFilterModal} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                 </div>
                 <div className="p-6 space-y-4">
                     <div className="space-y-2">
                         <label className="text-xs text-slate-400 uppercase font-bold">Filter Type</label>
                         <select 
                            value={filterType} 
                            onChange={(e) => setFilterType(e.target.value as FilterType)}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:border-cyan-500 outline-none appearance-none cursor-pointer"
                         >
                             <option value="None">None (All Frequencies)</option>
                             <option value="BandPass">Band Pass (Specific Order)</option>
                             <option value="LowPass">Low Pass (Up to Order)</option>
                         </select>
                     </div>

                     {filterType !== 'None' && (
                         <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                             <label className="text-xs text-slate-400 uppercase font-bold">
                                 {filterType === 'BandPass' ? 'Target Order (X)' : 'Cutoff Order (X)'}
                             </label>
                             <input 
                                type="number" 
                                min="0.1" 
                                step="0.1"
                                value={filterOrder}
                                onChange={(e) => setFilterOrder(parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white text-sm focus:border-cyan-500 outline-none"
                             />
                             <p className="text-[10px] text-slate-500 italic">
                                 {filterType === 'BandPass' 
                                    ? `Shows only vibration at ${filterOrder}X RPM.` 
                                    : `Shows all vibration at or below ${filterOrder}X RPM.`}
                             </p>
                         </div>
                     )}

                     <button onClick={toggleFilterModal} className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded transition-colors mt-2">Apply & Close</button>
                 </div>
             </div>
        </div>
    )}

    {/* DIAGNOSTICS CONTEXT MODAL (Step 1) - Preserved Style */}
    {isContextModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                    <h2 className="text-white font-bold text-sm uppercase flex items-center gap-2"><Stethoscope className="w-4 h-4" /> AI Diagnostics Setup</h2>
                    <button onClick={() => setIsContextModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-300">Provide machine context to start the investigation (e.g., "750kW Pump, 4 vanes, running near critical speed").</p>
                    <textarea 
                        className="w-full h-32 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white focus:border-cyan-500 outline-none resize-none"
                        placeholder="Enter machine context here..."
                        value={contextInput}
                        onChange={(e) => setContextInput(e.target.value)}
                    ></textarea>
                    <button 
                        onClick={runBaselineDiagnostics} 
                        className="w-full py-3 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white text-sm font-bold rounded shadow-lg transition-all flex justify-center items-center gap-2"
                        disabled={isGeneratingReport}
                    >
                        {isGeneratingReport ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                Initializing Diagnostics...
                            </>
                        ) : (
                            'Start Diagnosis'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )}

    {/* CHATBOT MODAL (Step 2) - New but matching style */}
    {isChatbotOpen && (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600/20 rounded-full">
                            <BrainCircuit className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-sm uppercase">AI Reliability Assistant</h2>
                            <div className="text-[10px] text-slate-400 flex gap-2">
                                <span>{appMode} Analysis</span>
                                <span>•</span>
                                <span>{uploadedFiles.length} Files Attached</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setChatbotOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/50" ref={chatScrollRef}>
                    {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700'}`}>
                                <div className="whitespace-pre-wrap">{msg.text}</div>
                                <div className={`text-[9px] mt-1 text-right ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-500'}`}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}
                    {isChatProcessing && (
                        <div className="flex justify-start">
                            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-150"></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-slate-700 bg-slate-900">
                    {/* Uploaded Files Preview */}
                    {uploadedFiles.length > 0 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                            {uploadedFiles.map((f, i) => (
                                <div key={i} className="flex items-center gap-2 bg-slate-800 px-2 py-1 rounded border border-slate-700 text-[10px] text-slate-300 whitespace-nowrap">
                                    {f.type === 'image' ? <Eye className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                    <span className="truncate max-w-[100px]">{f.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleChatSubmit} className="flex gap-2">
                        <label className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-slate-400 hover:text-white cursor-pointer transition-colors" title="Upload File (Image/Text)">
                            <Paperclip className="w-5 h-5" />
                            <input type="file" className="hidden" onChange={handleFileUploadChat} accept="image/*,.txt,.csv" />
                        </label>
                        <input 
                            type="text" 
                            value={chatInput} 
                            onChange={(e) => setChatInput(e.target.value)} 
                            placeholder="Ask about specific faults, symptoms, or request analysis..." 
                            className="flex-1 bg-slate-950 border border-slate-700 rounded p-3 text-sm text-white focus:border-blue-500 outline-none"
                        />
                        <button type="submit" disabled={isChatProcessing || (!chatInput.trim() && uploadedFiles.length === 0)} className="p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors">
                            <Send className="w-5 h-5" />
                        </button>
                    </form>
                    
                    <div className="mt-3 flex justify-between items-center border-t border-slate-800 pt-3">
                        <div className="text-[10px] text-slate-500">AI Context: Baseline + Chat History + Uploads</div>
                        <button 
                            onClick={runFinalReport} 
                            disabled={isGeneratingReport}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-4 rounded flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {isGeneratingReport ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <FileText className="w-3 h-3" />}
                            Generate Final Report
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )}

    {/* DIAGNOSTICS REPORT MODAL (Step 3) - Preserved Style */}
    {isReportModalOpen && diagnosticReport && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                    <h2 className="text-white font-bold text-sm uppercase flex items-center gap-2"><FileText className="w-4 h-4" /> Final Diagnostics Report</h2>
                    <button onClick={() => setIsReportModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                        <div className={`text-2xl font-bold ${diagnosticReport.machineHealth === 'Good' ? 'text-emerald-400' : diagnosticReport.machineHealth === 'Satisfactory' ? 'text-yellow-400' : 'text-red-500'}`}>
                            {diagnosticReport.machineHealth}
                        </div>
                        <div className="border-l border-slate-600 pl-4">
                            <div className="text-[10px] text-slate-400 uppercase font-bold">ISO Compliance</div>
                            <div className="text-sm text-slate-200">{diagnosticReport.isoCheck}</div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-slate-300 uppercase border-b border-slate-700 pb-2 mb-3">Identified Faults</h3>
                        <div className="space-y-3">
                            {diagnosticReport.faults.map((f: any, i: number) => (
                                <div key={i} className="bg-slate-800/30 p-3 rounded border border-slate-700/50">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-bold text-white text-sm">{f.faultName}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${f.probability === 'High' ? 'bg-red-500/20 text-red-400' : f.probability === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{f.probability}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">{f.reasoning}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-slate-300 uppercase border-b border-slate-700 pb-2 mb-3">Recommendations</h3>
                        <ul className="space-y-2">
                            {diagnosticReport.recommendations.map((rec: string, i: number) => (
                                <li key={i} className="flex gap-2 text-xs text-slate-300">
                                    <span className="text-cyan-500">•</span> {rec}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end gap-2">
                    <button onClick={exportReportToPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded transition-colors"><FileText className="w-3 h-3" /> Export PDF</button>
                    <button onClick={() => setIsReportModalOpen(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded transition-colors">Close</button>
                </div>
            </div>
        </div>
    )}

    {/* CUSTOM UPLOAD, SAVE, DELETE, SETTINGS, DATA MANAGER, CUSTOM ORBIT - All Unchanged from Root */}
    {isCustomOrbitModalOpen && appMode === 'ORBIT' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto">
             <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                 <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                    <div className="flex items-center gap-2"><PencilRuler className="text-cyan-400 w-5 h-5" /><h2 className="text-white font-bold text-sm uppercase">Custom Orbit</h2></div>
                    <button onClick={toggleCustomOrbitModal} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                 </div>
                 
                 {/* Tabs */}
                 <div className="flex border-b border-slate-700">
                     <button 
                        onClick={() => setOrbitTab('ai')} 
                        className={`flex-1 py-3 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2 ${orbitTab === 'ai' ? 'text-white border-b-2 border-cyan-500 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
                     >
                         <BrainCircuit className="w-3 h-3" /> AI Extract
                     </button>
                     <button 
                        onClick={() => setOrbitTab('manual')} 
                        className={`flex-1 py-3 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2 ${orbitTab === 'manual' ? 'text-white border-b-2 border-cyan-500 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}
                     >
                         <PenTool className="w-3 h-3" /> Manual Replica
                     </button>
                 </div>

                 <div className="p-6 space-y-4">
                     {orbitTab === 'ai' ? (
                         // AI EXTRACT CONTENT
                         <>
                             {!customOrbitImage && !customOrbitPath ? (
                                 <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center text-center gap-2 hover:bg-slate-800/50 transition-colors">
                                     <UploadCloud className="w-10 h-10 text-slate-500" />
                                     <p className="text-sm text-slate-300 font-medium">Upload Orbit Plot Image</p>
                                     <label className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 px-4 rounded cursor-pointer transition-colors">
                                         Browse Files
                                         <input type="file" accept="image/*" className="hidden" onChange={handleCustomOrbitImageUpload} />
                                     </label>
                                 </div>
                             ) : (
                                 <div className="space-y-4">
                                     {customOrbitPath ? (
                                         // Render the processed path on canvas
                                         <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black aspect-square flex items-center justify-center">
                                             <canvas ref={customOrbitCanvasRef} width={400} height={400} className="w-full h-full" />
                                             <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded text-[10px] text-cyan-400 border border-cyan-500/50">AI Digitized</div>
                                             <button onClick={() => { setCustomOrbitPath(null); setCustomOrbitImage(null); }} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-red-500/50 transition-colors"><X className="w-4 h-4" /></button>
                                         </div>
                                     ) : (
                                         // Render the uploaded image
                                         <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black aspect-square flex items-center justify-center">
                                             <img src={customOrbitImage || ''} alt="Orbit Plot" className="max-h-full max-w-full object-contain" />
                                             <button onClick={() => setCustomOrbitImage(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-red-500/50 transition-colors"><X className="w-4 h-4" /></button>
                                         </div>
                                     )}
                                     
                                     {customOrbitPath ? (
                                         <button 
                                            onClick={toggleCustomOrbitSimulation} 
                                            className={`w-full py-3 ${isSimulatingCustomOrbit ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-lg`}
                                         >
                                             {isSimulatingCustomOrbit ? (
                                                 <><StopCircle className="w-4 h-4" /> Stop Simulating</>
                                             ) : (
                                                 <><Play className="w-4 h-4" /> Simulate</>
                                             )}
                                         </button>
                                     ) : (
                                         <button 
                                            onClick={analyzeOrbitImage} 
                                            disabled={isAnalyzingOrbit} 
                                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                                         >
                                             {isAnalyzingOrbit ? (
                                                 <>
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                    Analyzing Shape...
                                                 </>
                                             ) : (
                                                 'Digitize Orbit Trace'
                                             )}
                                         </button>
                                     )}
                                 </div>
                             )}
                             <p className="text-[10px] text-slate-500 text-center">
                                 AI will analyze the image and replicate the exact orbit path in the simulation.
                             </p>
                         </>
                     ) : (
                         // MANUAL REPLICA CONTENT
                         <div className="space-y-4">
                             <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-900 aspect-square flex items-center justify-center cursor-crosshair">
                                 <canvas 
                                    ref={manualCanvasRef} 
                                    width={400} 
                                    height={400} 
                                    className="w-full h-full"
                                    onMouseDown={handleManualDrawStart}
                                    onMouseMove={handleManualDrawMove}
                                    onMouseUp={handleManualDrawEnd}
                                    onMouseLeave={handleManualLeave}
                                 />
                                 {drawnPath.length === 0 && (
                                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
                                         <p className="text-xs text-slate-400">Click & Drag to Draw</p>
                                     </div>
                                 )}
                             </div>
                             
                             <div className="flex gap-2">
                                 <button 
                                    onClick={() => setDrawnPath([])} 
                                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded border border-slate-600 transition-colors"
                                 >
                                     Clear
                                 </button>
                                 <button 
                                    onClick={applyManualOrbit}
                                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={drawnPath.length < 2}
                                 >
                                     Simulate This
                                 </button>
                             </div>
                             
                             <div className="bg-slate-800/50 p-2 rounded border border-slate-700/50">
                                 <ul className="text-[10px] text-slate-400 list-disc list-inside space-y-1">
                                     <li>Start point (Red Dot) marks <span className="text-red-400 font-bold">Keyphasor (t=0)</span>.</li>
                                     <li>End near start point to create a <strong>Closed Loop</strong>.</li>
                                     <li>Grid scale is normalized (-1.0 to +1.0).</li>
                                 </ul>
                             </div>
                         </div>
                     )}
                 </div>
             </div>
        </div>
    )}
    
    {isSettingsOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-sm flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                    <h2 className="text-white font-bold text-sm uppercase flex items-center gap-2"><Settings className="w-4 h-4" /> Global Settings</h2>
                    <button onClick={toggleSettings} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 uppercase font-bold">Google Gemini API Key</label>
                        <input 
                            type="password" 
                            value={apiKey} 
                            onChange={handleApiKeyChange} 
                            placeholder="Enter API Key for AI Features"
                            className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-xs focus:border-cyan-500 outline-none"
                        />
                        <p className="text-[10px] text-slate-500">Required for Auto-Diagnostics and Image Analysis.</p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 uppercase font-bold">Machine Speed (RPM)</label>
                        <input
                            type="number"
                            value={machineRpm}
                            onChange={(e) => setMachineRpm(Number(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-xs focus:border-cyan-500 outline-none"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 uppercase font-bold">Line Frequency</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setLineFreq(50)}
                                className={`flex-1 py-2 text-xs font-bold rounded border transition-colors ${lineFreq === 50 ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                            >
                                50 Hz
                            </button>
                            <button
                                onClick={() => setLineFreq(60)}
                                className={`flex-1 py-2 text-xs font-bold rounded border transition-colors ${lineFreq === 60 ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                            >
                                60 Hz
                            </button>
                        </div>
                    </div>

                    <button onClick={toggleSettings} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded border border-slate-600 transition-colors">Close</button>
                </div>
            </div>
        </div>
    )}

    {showDataManager && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                    <div className="flex items-center gap-2"><Table className="text-cyan-400 w-5 h-5" /><h2 className="text-white font-bold text-sm uppercase">Data Manager</h2></div>
                    <button onClick={() => setShowDataManager(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex gap-2">
                    <button onClick={handleDownloadConfig} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded transition-colors"><Download className="w-3 h-3" /> Export Excel Template</button>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded cursor-pointer transition-colors">
                        <Upload className="w-3 h-3" /> Import Excel Data
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportConfig} />
                    </label>
                    <button 
                        onClick={() => resetToMode(ODSMode.Manual)} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-800 text-xs font-bold rounded transition-colors ml-2"
                    >
                        <RefreshCw className="w-3 h-3" /> Reset Data
                    </button>
                    <button onClick={handleSaveProject} className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors"><Save className="w-3 h-3" /> Save Project</button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-800 text-slate-400 text-[10px] uppercase sticky top-0">
                            <tr>
                                <th className="p-2 border-b border-slate-700 text-center w-10">Ref</th>
                                <th className="p-2 border-b border-slate-700">Point ID</th>
                                <th className="p-2 border-b border-slate-700">Label</th>
                                <th className="p-2 border-b border-slate-700 text-center" colSpan={2}>Vertical</th>
                                <th className="p-2 border-b border-slate-700 text-center" colSpan={2}>Horizontal</th>
                                <th className="p-2 border-b border-slate-700 text-center" colSpan={2}>Axial</th>
                            </tr>
                            <tr>
                                <th className="p-2 border-b border-slate-700"></th>
                                <th className="p-2 border-b border-slate-700"></th>
                                <th className="p-2 border-b border-slate-700"></th>
                                <th className="p-2 border-b border-slate-700 text-center text-[9px]">Amp (mm/s)</th>
                                <th className="p-2 border-b border-slate-700 text-center text-[9px]">Phase (°)</th>
                                <th className="p-2 border-b border-slate-700 text-center text-[9px]">Amp (mm/s)</th>
                                <th className="p-2 border-b border-slate-700 text-center text-[9px]">Phase (°)</th>
                                <th className="p-2 border-b border-slate-700 text-center text-[9px]">Amp (mm/s)</th>
                                <th className="p-2 border-b border-slate-700 text-center text-[9px]">Phase (°)</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-300 text-xs">
                            {points.map(p => (
                                <tr key={p.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                                    <td className="p-2 text-center">
                                        <div 
                                            className={`w-4 h-4 rounded-full border cursor-pointer mx-auto flex items-center justify-center transition-all ${p.id === referencePointId ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'border-slate-600 hover:border-slate-400'}`}
                                            onClick={() => setReferencePoint(p.id)}
                                            title="Set as Phase Reference (0°)"
                                        >
                                            {p.id === referencePointId && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </div>
                                    </td>
                                    <td className="p-2 font-mono text-slate-500">{p.id}</td>
                                    <td className="p-2 font-medium">{p.label}</td>
                                    
                                    <td className="p-1"><input type="number" step="0.1" className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center focus:border-cyan-500 outline-none" value={p.vertical.amplitude} onChange={(e) => handleDataUpdate(p.id, 'vertical', 'amplitude', e.target.value)} /></td>
                                    <td className="p-1"><input type="number" step="1" className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center focus:border-cyan-500 outline-none" value={p.vertical.phaseMeas} onChange={(e) => handleDataUpdate(p.id, 'vertical', 'phaseMeas', e.target.value)} /></td>
                                    
                                    <td className="p-1"><input type="number" step="0.1" className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center focus:border-cyan-500 outline-none" value={p.horizontal.amplitude} onChange={(e) => handleDataUpdate(p.id, 'horizontal', 'amplitude', e.target.value)} /></td>
                                    <td className="p-1"><input type="number" step="1" className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center focus:border-cyan-500 outline-none" value={p.horizontal.phaseMeas} onChange={(e) => handleDataUpdate(p.id, 'horizontal', 'phaseMeas', e.target.value)} /></td>
                                    
                                    <td className="p-1"><input type="number" step="0.1" className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center focus:border-cyan-500 outline-none" value={p.axial.amplitude} onChange={(e) => handleDataUpdate(p.id, 'axial', 'amplitude', e.target.value)} /></td>
                                    <td className="p-1"><input type="number" step="1" className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center focus:border-cyan-500 outline-none" value={p.axial.phaseMeas} onChange={(e) => handleDataUpdate(p.id, 'axial', 'phaseMeas', e.target.value)} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )}

    {isUploadModalOpen && selectedPoint && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-sm flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                    <h2 className="text-white font-bold text-sm uppercase flex items-center gap-2"><UploadCloud className="w-4 h-4" /> Point Configuration</h2>
                    <button onClick={toggleUploadModal} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex border-b border-slate-700">
                    <button onClick={() => setCustomTab('manual')} className={`flex-1 py-3 text-xs font-bold uppercase transition-colors ${customTab === 'manual' ? 'text-white border-b-2 border-cyan-500 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>Manual Entry</button>
                    <button onClick={() => setCustomTab('ai')} className={`flex-1 py-3 text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2 ${customTab === 'ai' ? 'text-white border-b-2 border-cyan-500 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}><Zap className="w-3 h-3" /> AI Extract</button>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {customTab === 'manual' ? (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 uppercase font-bold">Fundamental (1X)</label>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <div className="text-[9px] text-slate-500 mb-1">Amplitude</div>
                                        <input type="number" value={manualFund.amp} onChange={(e) => setManualFund({...manualFund, amp: parseFloat(e.target.value)||0})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-xs focus:border-cyan-500 outline-none" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-[9px] text-slate-500 mb-1">Phase (°)</div>
                                        <input type="number" value={manualFund.phase} onChange={(e) => setManualFund({...manualFund, phase: parseFloat(e.target.value)||0})} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-xs focus:border-cyan-500 outline-none" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs text-slate-400 uppercase font-bold">Harmonics</label>
                                    <button onClick={addHarmonic} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-400 px-2 py-1 rounded flex items-center gap-1 transition-colors"><Plus className="w-3 h-3" /> Add</button>
                                </div>
                                <div className="space-y-2">
                                    {manualHarmonics.map((h) => (
                                        <div key={h.id} className="flex gap-2 items-center">
                                            <div className="w-16">
                                                <input type="number" value={h.order} onChange={(e) => updateHarmonic(h.id, 'order', parseFloat(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white text-xs text-center focus:border-cyan-500 outline-none" placeholder="Ord" />
                                            </div>
                                            <div className="flex-1">
                                                <input type="number" value={h.amp} onChange={(e) => updateHarmonic(h.id, 'amp', parseFloat(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-white text-xs focus:border-cyan-500 outline-none" placeholder="Amp" />
                                            </div>
                                            <button onClick={() => removeHarmonic(h.id)} className="text-slate-500 hover:text-red-400"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                    {manualHarmonics.length === 0 && <div className="text-[10px] text-slate-600 italic text-center py-2">No harmonics added</div>}
                                </div>
                            </div>
                            <button onClick={applyManualSimulation} className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded transition-colors mt-2">Apply Configuration</button>
                        </>
                    ) : (
                        <div className="space-y-4">
                            {!selectedImage ? (
                                <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center text-center gap-2 hover:bg-slate-800/50 transition-colors">
                                    <UploadCloud className="w-10 h-10 text-slate-500" />
                                    <p className="text-sm text-slate-300 font-medium">Upload Spectrum Image</p>
                                    <p className="text-[10px] text-slate-500">Supports PNG, JPG (Max 5MB)</p>
                                    <label className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 px-4 rounded cursor-pointer transition-colors">
                                        Browse Files
                                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                    </label>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="relative rounded-lg overflow-hidden border border-slate-700">
                                        <img src={selectedImage} alt="Spectrum" className="w-full h-40 object-cover" />
                                        <button onClick={() => setSelectedImage(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-red-500/50 transition-colors"><X className="w-4 h-4" /></button>
                                    </div>
                                    {analysisResult ? (
                                        <div className="bg-slate-950 p-3 rounded border border-slate-700 space-y-2">
                                            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold"><CheckCircle2 className="w-3 h-3" /> Analysis Complete</div>
                                            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
                                                <div>Amp: <span className="text-white">{analysisResult.amplitude}</span></div>
                                                <div>Phase: <span className="text-white">{analysisResult.phase}°</span></div>
                                            </div>
                                            <button onClick={applyAISimulation} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded transition-colors">Apply Extracted Data</button>
                                        </div>
                                    ) : (
                                        <button onClick={analyzeSpectrum} disabled={analyzing} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded transition-colors flex items-center justify-center gap-2">
                                            {analyzing ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Zap className="w-3 h-3" />}
                                            {analyzing ? 'Analyzing Spectrum...' : 'Extract Data with AI'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )}

    {isSaveModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-xl w-full max-w-sm flex flex-col duration-200">
                <div className="p-4 border-b border-slate-700 bg-slate-800">
                    <h3 className="text-white font-bold text-sm">Save Project</h3>
                </div>
                <div className="p-4 space-y-4">
                    <input 
                        type="text" 
                        value={saveProjectTitle} 
                        onChange={(e) => setSaveProjectTitle(e.target.value)} 
                        placeholder="Project Name..."
                        className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm outline-none focus:border-cyan-500"
                        autoFocus
                    />
                    <div className="flex gap-2">
                        <button onClick={() => setIsSaveModalOpen(false)} className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded hover:bg-slate-700 transition-colors">Cancel</button>
                        <button onClick={confirmSaveProject} className="flex-1 py-2 bg-cyan-600 text-white text-xs font-bold rounded hover:bg-cyan-500 transition-colors">Save</button>
                    </div>
                </div>
            </div>
        </div>
    )}

    {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-xl w-full max-w-sm flex flex-col duration-200">
                <div className="p-4 border-b border-slate-700 bg-slate-800 flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="font-bold text-sm">Delete Project?</h3>
                </div>
                <div className="p-4 space-y-4">
                    <p className="text-sm text-slate-300">Are you sure you want to delete <span className="font-bold text-white">{projectToDelete}</span>?</p>
                    <div className="flex gap-2">
                        <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded hover:bg-slate-700 transition-colors">Cancel</button>
                        <button onClick={confirmDeleteProject} className="flex-1 py-2 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-500 transition-colors">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    )}
</div>
            </div>
        </div>
    </>
  );
};