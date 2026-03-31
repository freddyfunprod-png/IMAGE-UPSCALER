/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Upload, Image as ImageIcon, Download, Loader2, Key, Maximize2, X, CheckCircle2, AlertCircle, Play, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Extend window interface for AI Studio specific functions
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface QueueItem {
  id: string;
  source: string;
  result: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  resolution: '2K' | '4K';
  originalAspectRatio: string;
  targetAspectRatio: string;
  name: string;
}

export default function App() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [globalResolution, setGlobalResolution] = useState<'2K' | '4K'>('4K');
  const [globalTargetAspectRatio, setGlobalTargetAspectRatio] = useState<string>('Original');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync global settings to pending items
  useEffect(() => {
    setQueue(prev => prev.map(item => 
      (item.status === 'pending' || item.status === 'error') 
        ? { ...item, resolution: globalResolution, targetAspectRatio: globalTargetAspectRatio } 
        : item
    ));
  }, [globalResolution, globalTargetAspectRatio]);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    if (window.aistudio) {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true); // Assume success as per guidelines
    }
  };

  const processFiles = async (files: File[]) => {
    const newItems: QueueItem[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      const source = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const originalAspectRatio = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const ratio = img.width / img.height;
          let detectedRatio = "1:1";
          if (ratio > 1.5) detectedRatio = "16:9";
          else if (ratio > 1.2) detectedRatio = "4:3";
          else if (ratio < 0.6) detectedRatio = "9:16";
          else if (ratio < 0.8) detectedRatio = "3:4";
          resolve(detectedRatio);
        };
        img.src = source;
      });

      newItems.push({
        id: Math.random().toString(36).substring(7),
        source,
        result: null,
        status: 'pending',
        resolution: globalResolution,
        originalAspectRatio,
        targetAspectRatio: globalTargetAspectRatio,
        name: file.name
      });
    }

    setQueue(prev => [...prev, ...newItems]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const processQueue = async () => {
    if (loading || queue.length === 0) return;
    
    const pendingItems = queue.filter(item => item.status === 'pending' || item.status === 'error');
    if (pendingItems.length === 0) return;

    setLoading(true);

    for (const item of pendingItems) {
      // Update status to processing
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing' } : q));

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const base64Data = item.source.split(',')[1];
        const mimeType = item.source.split(';')[0].split(':')[1];

        const finalAspectRatio = item.targetAspectRatio === 'Original' ? item.originalAspectRatio : item.targetAspectRatio;

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType } },
              { text: `STRICT FIDELITY UPSCALING: 
              Recreate this image in high definition ${item.resolution} resolution. 
              The result must be a 1:1 REPLICA in terms of content, architecture, and composition.

              CORE DIRECTIVE: 
              DO NOT add new objects, DO NOT change the structure, and DO NOT invent details that aren't there. 
              Only ENHANCE and REFINE what is already present to make it look like a high-end professional photograph.

              MATERIAL ENHANCEMENT:
              Refine existing surfaces to look like real-world materials: enhance the natural grain of wood, the subtle texture of concrete, the depth of stone, and the realistic reflections of glass. Do not replace them with different materials.

              LIGHTING & ATMOSPHERE:
              Maintain the EXACT time of day and lighting mood. If it's night, keep it night. If it's day, keep it day. 
              Enhance the contrast and light falloff to match a professional 28mm architectural lens, but do not change the light sources.

              VEGETATION:
              Refine existing plants and grass to look organic and natural, but keep their original placement and types.

              ASPECT RATIO & COMPOSITION:
              Target Aspect Ratio: ${finalAspectRatio}.
              Original Aspect Ratio: ${item.originalAspectRatio}.
              If these differ, you MUST perform OUTPAINTING: 
              1. Keep the original image content 100% intact, centered, and at its original scale.
              2. ONLY extend the background/environment (sky, ground, peripheral walls) to fill the new frame.
              3. DO NOT stretch or distort any part of the original image.

              QUALITY BAR:
              No CGI, no 3D render look, no plastic textures, no AI artifacts. 
              The final image must look like a sharp, clean, premium real estate photo taken with a professional camera.` },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            imageConfig: {
              imageSize: item.resolution,
              aspectRatio: (finalAspectRatio as any) || "1:1",
            },
          },
        });

        let foundImage = false;
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            const result = `data:image/png;base64,${part.inlineData.data}`;
            setQueue(prev => prev.map(q => q.id === item.id ? { ...q, result, status: 'completed' } : q));
            foundImage = true;
            break;
          }
        }

        if (!foundImage) {
          throw new Error("No image returned");
        }
      } catch (error: any) {
        console.error(`Error processing ${item.name}:`, error);
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error' } : q));
        
        if (error.message?.includes("Requested entity was not found")) {
          setHasKey(false);
          setLoading(false);
          alert("API Key error. Please select your API key again.");
          return;
        }
      }
      
      // Small delay between requests to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setLoading(false);
  };

  const removeItem = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const clearQueue = () => {
    if (loading) return;
    setQueue([]);
  };

  const downloadItem = (item: QueueItem) => {
    if (!item.result) return;
    const link = document.createElement('a');
    link.href = item.result;
    link.download = `upscaled_${item.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAll = () => {
    queue.filter(item => item.status === 'completed').forEach(item => {
      downloadItem(item);
    });
  };

  return (
    <div 
      className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500 selection:text-black"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-orange-500/20 backdrop-blur-md border-4 border-dashed border-orange-500 m-4 rounded-[40px] flex flex-col items-center justify-center pointer-events-none"
          >
            <Upload size={64} className="text-orange-500 animate-bounce" />
            <h2 className="text-4xl font-black uppercase italic tracking-tighter mt-4 text-orange-500">Drop to Upload</h2>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="border-b border-white/5 p-6 flex justify-between items-center bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.3)]">
            <Maximize2 className="text-black" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">HD Batch Upscaler</h1>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.3em] mt-1 font-mono">Professional Imaging Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {!hasKey ? (
            <button 
              onClick={handleSelectKey}
              className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-full font-bold hover:bg-orange-500 transition-all active:scale-95 text-sm shadow-xl"
            >
              <Key size={16} />
              Connect API Key
            </button>
          ) : (
            <div className="hidden md:flex items-center gap-3 text-[10px] text-white/40 uppercase tracking-[0.2em] font-mono bg-white/5 px-4 py-2 rounded-full border border-white/10">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              API Connected
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-12">
        {!hasKey ? (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-24 h-24 border border-white/10 rounded-3xl flex items-center justify-center bg-white/5"
            >
              <Key size={48} className="text-orange-500" />
            </motion.div>
            <div className="space-y-4">
              <h2 className="text-4xl font-black tracking-tighter uppercase italic">Authorization Required</h2>
              <p className="text-white/40 max-w-md mx-auto text-lg leading-relaxed">
                Connect your Google Cloud API key to unlock the 4K Neural Upscaling engine.
              </p>
            </div>
            <div className="flex flex-col items-center gap-4">
              <button 
                onClick={handleSelectKey}
                className="bg-orange-500 text-black px-12 py-4 rounded-full font-black text-xl uppercase tracking-tighter hover:scale-105 transition-all shadow-[0_0_30px_rgba(249,115,22,0.4)] active:scale-95"
              >
                Select API Key
              </button>
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white/30 hover:text-orange-500 text-xs font-mono uppercase tracking-widest transition-colors"
              >
                Billing Documentation ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
              <div className="flex flex-wrap gap-4 items-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-3 bg-white text-black px-6 py-3 rounded-2xl font-bold hover:bg-orange-500 transition-all active:scale-95"
                >
                  <Upload size={20} />
                  Add Images
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  multiple
                  className="hidden" 
                />

                <div className="flex bg-black/40 p-1 rounded-2xl border border-white/10">
                  {(['2K', '4K'] as const).map((res) => (
                    <button
                      key={res}
                      onClick={() => setGlobalResolution(res)}
                      className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                        globalResolution === res 
                        ? 'bg-white text-black shadow-lg' 
                        : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>

                <div className="flex bg-black/40 p-1 rounded-2xl border border-white/10">
                  {['Original', '1:1', '16:9', '9:16', '4:3', '3:4'].map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setGlobalTargetAspectRatio(ratio)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all uppercase tracking-tighter ${
                        globalTargetAspectRatio === ratio 
                        ? 'bg-orange-500 text-black shadow-lg' 
                        : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto">
                {queue.length > 0 && (
                  <>
                    <button
                      onClick={clearQueue}
                      disabled={loading}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border border-white/10 text-white/40 hover:bg-red-500/10 hover:text-red-500 transition-all disabled:opacity-20"
                    >
                      <Trash2 size={18} />
                      Clear
                    </button>
                    <button
                      onClick={processQueue}
                      disabled={loading || queue.every(i => i.status === 'completed')}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-orange-500 text-black px-8 py-3 rounded-2xl font-black uppercase tracking-tighter hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 shadow-[0_0_20px_rgba(249,115,22,0.3)]"
                    >
                      {loading ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
                      {loading ? 'Processing...' : 'Process All'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Queue Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {queue.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="group relative bg-white/5 border border-white/10 rounded-3xl overflow-hidden flex flex-col h-[400px]"
                  >
                    {/* Status Overlay */}
                    <div className="absolute top-4 left-4 z-10 flex gap-2">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md border ${
                        item.status === 'pending' ? 'bg-white/10 border-white/20 text-white/60' :
                        item.status === 'processing' ? 'bg-orange-500/20 border-orange-500/50 text-orange-500' :
                        item.status === 'completed' ? 'bg-green-500/20 border-green-500/50 text-green-500' :
                        'bg-red-500/20 border-red-500/50 text-red-500'
                      }`}>
                        {item.status}
                      </div>
                      <div className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-black/40 backdrop-blur-md border border-white/10 text-white/40">
                        {item.resolution} • {item.targetAspectRatio === 'Original' ? item.originalAspectRatio : item.targetAspectRatio}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.status === 'completed' && (
                        <button 
                          onClick={() => downloadItem(item)}
                          className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors"
                        >
                          <Download size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => removeItem(item.id)}
                        disabled={item.status === 'processing'}
                        className="w-8 h-8 bg-black/60 text-white/60 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors disabled:opacity-20"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Image Display */}
                    <div className="flex-1 bg-black/20 relative overflow-hidden">
                      <img 
                        src={item.result || item.source} 
                        alt={item.name} 
                        className={`w-full h-full object-contain transition-all duration-700 ${item.status === 'processing' ? 'scale-110 blur-sm opacity-50' : 'scale-100'}`}
                      />
                      
                      {item.status === 'processing' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-orange-500 animate-pulse">Upscaling...</p>
                        </div>
                      )}

                      {item.status === 'completed' && (
                        <div className="absolute inset-0 bg-green-500/5 pointer-events-none flex items-center justify-center">
                           <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                             <CheckCircle2 size={48} className="text-green-500/20" />
                           </motion.div>
                        </div>
                      )}

                      {item.status === 'error' && (
                        <div className="absolute inset-0 bg-red-500/10 flex flex-col items-center justify-center gap-2">
                          <AlertCircle size={32} className="text-red-500" />
                          <p className="text-[10px] font-mono uppercase text-red-500">Processing Failed</p>
                        </div>
                      )}
                    </div>

                    {/* Info Footer */}
                    <div className="p-4 bg-black/40 border-t border-white/5">
                      <p className="text-xs font-mono text-white/40 truncate uppercase tracking-wider">{item.name}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {queue.length === 0 && (
                <div className="col-span-full py-32 border-2 border-dashed border-white/5 rounded-[40px] flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                    <ImageIcon size={32} className="text-white/10" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-white/40 uppercase tracking-[0.2em] text-sm font-bold">Queue is empty</p>
                    <p className="text-white/20 text-xs max-w-[240px]">Upload multiple images to start batch upscaling to 2K or 4K.</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-orange-500 hover:text-white transition-colors text-sm font-bold uppercase tracking-widest"
                  >
                    Browse Files
                  </button>
                </div>
              )}
            </div>

            {/* Batch Actions */}
            {queue.some(i => i.status === 'completed') && (
              <motion.div 
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
              >
                <button
                  onClick={downloadAll}
                  className="bg-white text-black px-10 py-4 rounded-full font-black uppercase tracking-tighter flex items-center gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:bg-orange-500 transition-all active:scale-95"
                >
                  <Download size={20} />
                  Download All Completed
                </button>
              </motion.div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 p-12 mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 opacity-20 text-[10px] font-mono tracking-[0.3em] uppercase">
          <div className="flex items-center gap-4">
            <Maximize2 size={14} />
            <span>Neural Upscale Engine v2.0</span>
          </div>
          <div className="flex gap-12">
            <span>Batch Processing Enabled</span>
            <span>Gemini 3.1 Flash Image</span>
          </div>
          <div>© 2026 HD Upscaler AI</div>
        </div>
      </footer>
    </div>
  );
}
