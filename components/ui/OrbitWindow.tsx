import React, { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { Activity, X, PencilRuler } from 'lucide-react';

export const OrbitWindow: React.FC = () => {
    const { isOrbitPlotOpen, toggleOrbitPlot, orbitPoints, animationRpm, appMode, filterType, filterOrder, customOrbitPath, toggleCustomOrbitModal } = useStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const probeX = orbitPoints.find(p => p.id === 'probe-x')?.horizontal;
    const probeY = orbitPoints.find(p => p.id === 'probe-y')?.horizontal;
    const kp = orbitPoints.find(p => p.id === 'keyphasor');

    useEffect(() => {
        if (!isOrbitPlotOpen || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        // --- 1. Draw Grid ---
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Crosshair
        ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
        ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
        ctx.stroke();
        
        // Circles
        ctx.beginPath();
        ctx.arc(centerX, centerY, width * 0.3, 0, Math.PI * 2); // Clearance Circle approx
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // --- 2. Draw Orbit ---
        ctx.strokeStyle = '#fbbf24'; // Amber
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (customOrbitPath && customOrbitPath.length > 0) {
            // --- CUSTOM ORBIT (AI EXTRACTED) ---
            const scale = width * 0.4; // 40% of canvas as radius
            
            customOrbitPath.forEach((pt, i) => {
                // pt is [x, y] normalized -1 to 1
                const px = centerX + pt[0] * scale;
                const py = centerY - pt[1] * scale; // Invert Y for canvas
                
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            // Close loop
            if (customOrbitPath.length > 2) {
                const first = customOrbitPath[0];
                ctx.lineTo(centerX + first[0] * scale, centerY - first[1] * scale);
            }
            ctx.stroke();
            
            // Render Label
            ctx.fillStyle = '#22d3ee';
            ctx.textAlign = 'center';
            ctx.fillText("CUSTOM ORBIT (AI TRACE)", centerX, 30);

        } else if (probeX && probeY) {
            // --- SIMULATED ORBIT (LISSAJOUS) ---
            
            // FIX: Increase points and duration to 4PI (2 cycles) to show sub-synchronous faults (Oil Whip)
            const numCycles = 2; 
            const points = 720; // Higher resolution for 2 cycles
            const duration = numCycles * 2 * Math.PI;

            const kpPhaseShift = kp?.horizontal.phaseMeas || 0; 
            const kpRad = kpPhaseShift * Math.PI / 180;

            // FIX: Auto Scale must include harmonics/noise to prevent clipping
            const getPeakAmp = (comp: any) => {
                let peak = comp.amplitude;
                if(comp.harmonics) comp.harmonics.forEach((h: any) => peak += comp.amplitude * h.amplitudeRatio);
                if(comp.noise) peak += comp.noise;
                return peak;
            };
            const maxAmp = Math.max(getPeakAmp(probeX), getPeakAmp(probeY)) * 1.5; // 1.5x headroom
            const scale = (width * 0.4) / (maxAmp || 1);

            // Math.sin matches OrbitScene.tsx physics
            const calcVal = (comp: any, t: number) => {
                let v = 0;
                // Fundamental
                const isFundIncluded = filterType === 'None' ||
                    (filterType === 'BandPass' && Math.abs(1.0 - filterOrder) < 0.01) ||
                    (filterType === 'LowPass' && 1.0 <= filterOrder + 0.01);

                if (isFundIncluded) {
                    v += comp.amplitude * Math.sin(t + (comp.phaseMeas * Math.PI / 180));
                }

                // Harmonics
                if(comp.harmonics) {
                        comp.harmonics.forEach((h: any) => {
                            const isHarmIncluded = filterType === 'None' ||
                                (filterType === 'BandPass' && Math.abs(h.order - filterOrder) < 0.01) ||
                                (filterType === 'LowPass' && h.order <= filterOrder + 0.01);
                            
                            if (isHarmIncluded) {
                                v += (comp.amplitude * h.amplitudeRatio) * Math.sin(t * h.order + ((comp.phaseMeas + h.phaseShift) * Math.PI / 180));
                            }
                        });
                }
                return v;
            };

            for (let i = 0; i <= points; i++) {
                // Map i to 0..4PI
                const t = (i / points) * duration;

                const valX = calcVal(probeX, t);
                const valY = calcVal(probeY, t);

                // Plot
                // X acts Horizontal, Y acts Vertical (Canvas Y inverted)
                const px = centerX + valX * scale;
                const py = centerY - valY * scale; 

                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.stroke();

            // --- 3. Draw Keyphasor Dot ---
            const kpTime = 0 - kpRad; 

            const kpx = centerX + calcVal(probeX, kpTime) * scale;
            const kpy = centerY - calcVal(probeY, kpTime) * scale;

            ctx.fillStyle = '#ef4444'; // Red Dot
            ctx.beginPath();
            ctx.arc(kpx, kpy, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            
            // Scale Label
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`Scale: ${maxAmp.toFixed(0)} µm`, width - 10, height - 10);
            
            // Filter Indicator
            if (filterType !== 'None') {
                ctx.fillStyle = '#06b6d4'; // Cyan
                ctx.textAlign = 'center';
                ctx.fillText(`FILTER: ${filterType} ${filterOrder}X`, centerX, height - 10);
            }
        }

        // Labels
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`RPM: ${animationRpm}`, 10, height - 10);
        
        // Sensor Labels on axes
        ctx.fillText("Y", centerX + 5, 15);
        ctx.fillText("X", width - 15, centerY - 5);

    }, [isOrbitPlotOpen, probeX, probeY, kp, animationRpm, filterType, filterOrder, customOrbitPath]);

    if (!isOrbitPlotOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-lg flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <Activity className="text-yellow-500 w-5 h-5" />
                        <div>
                            <h2 className="text-white font-bold text-lg">Orbit Analysis</h2>
                            <div className="text-[10px] text-slate-400">Shaft Centerline Movement (Lissajous)</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => { toggleOrbitPlot(); toggleCustomOrbitModal(); }} 
                            className="text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-400 px-2 py-1 rounded border border-slate-600 flex items-center gap-1 transition-colors"
                        >
                            <PencilRuler className="w-3 h-3" /> Custom
                        </button>
                        <button onClick={toggleOrbitPlot} className="text-slate-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                <div className="p-8 bg-black/50 flex items-center justify-center">
                    <canvas 
                        ref={canvasRef} 
                        width={400} 
                        height={400} 
                        className="bg-slate-900 rounded border border-slate-800"
                    />
                </div>
                
                <div className="p-4 bg-slate-900 border-t border-slate-700 text-xs text-slate-400 flex justify-between">
                     <div>
                         <span className="text-yellow-500 font-bold">Probe X:</span> {probeX?.amplitude || 0} µm
                     </div>
                     <div>
                         <span className="text-yellow-500 font-bold">Probe Y:</span> {probeY?.amplitude || 0} µm
                     </div>
                     <div className="flex items-center gap-1">
                         <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Keyphasor
                     </div>
                </div>
            </div>
        </div>
    );
};