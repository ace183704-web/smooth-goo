/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, Mic, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { initFluid } from './lib/fluid';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidApi = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "neon" | "minimal">("dark");
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const cleanup = initFluid(canvasRef.current, (api) => {
          fluidApi.current = api;
      });
      return () => {
        cleanup();
      };
    } catch (err: any) {
      console.error(err);
      setError(err?.message || String(err));
    }
  }, []);

  const handleMouseMove = () => {
    setUiVisible(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
        if (!prompt && !isGenerating) setUiVisible(false);
    }, 4000);
  };

  const handleSynthesize = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
        const response = await fetch('/api/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        
        if (data.error) {
            setError(data.error);
        } else if (data.config && fluidApi.current) {
            const { UI_THEME, ...fluidConfig } = data.config;
            if (UI_THEME) setTheme(UI_THEME);
            
            fluidApi.current.updateConfig(fluidConfig);
            
            // Trigger an explosion of splats to signify the change
            setTimeout(() => {
               if (fluidApi.current) fluidApi.current.multipleSplats(15);
            }, 500);
        }
    } catch (err: any) {
        setError(err.message || 'Synthesis failed.');
    } finally {
        setIsGenerating(false);
        setPrompt('');
    }
  };

  const currentThemeClasses = {
      dark: "bg-black/40 text-white border-white/10 placeholder-white/50",
      light: "bg-white/70 text-gray-900 border-gray-300 placeholder-gray-500",
      neon: "bg-purple-900/40 text-cyan-300 border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.5)] placeholder-cyan-500",
      minimal: "bg-transparent text-white border-b-2 border-white/30 rounded-none placeholder-white/30"
  };

  const buttonThemeClasses = {
      dark: "bg-white/10 hover:bg-white/20 text-white",
      light: "bg-black/10 hover:bg-black/20 text-black",
      neon: "bg-cyan-500/20 hover:bg-cyan-500/40 text-pink-400 border border-pink-500/50",
      minimal: "bg-transparent hover:text-white/70 text-white"
  };

  return (
    <div 
        className="w-screen h-screen overflow-hidden bg-black relative font-sans"
        onMouseMove={handleMouseMove}
        onTouchStart={handleMouseMove}
    >
      <canvas ref={canvasRef} className="w-full h-full block absolute inset-0 z-0" />
      
      {/* Decorative gradient overlay that subtly blends with theme */}
      <div className={`absolute inset-0 pointer-events-none z-10 mix-blend-overlay opacity-30 ${
          theme === 'neon' ? 'bg-gradient-to-tr from-purple-900 via-transparent to-cyan-900' : ''
      }`} />

      <AnimatePresence>
        {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 left-4 right-4 max-w-lg mx-auto bg-red-500/90 backdrop-blur text-white text-sm p-4 rounded-xl z-50 flex justify-between items-center"
            >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-4 opacity-50 hover:opacity-100">×</button>
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
          {uiVisible && (
              <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 30 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute bottom-12 left-0 right-0 z-40 px-4 pointer-events-none"
              >
                  <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
                      <div className="text-center drop-shadow-lg">
                          <h1 className={`text-2xl md:text-4xl font-light tracking-wider drop-shadow-xl ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                              Synesthesia Engine
                          </h1>
                          <p className={`text-sm mt-2 opacity-70 ${theme === 'light' ? 'text-gray-800' : 'text-white/70'}`}>
                              Describe a feeling, scene, or mood.
                          </p>
                      </div>

                      <form 
                          onSubmit={handleSynthesize} 
                          className="w-full relative pointer-events-auto flex items-center shadow-2xl"
                      >
                          <div className={`absolute inset-0 rounded-2xl transition-opacity duration-500 ${isGenerating ? 'opacity-100' : 'opacity-0'} ${theme === 'neon' ? 'bg-cyan-500/30' : 'bg-white/20'} animate-pulse`} style={{ filter: 'blur(10px)' }} />
                          <input
                              type="text"
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                              placeholder="e.g. A serene majestic nebula filled with life..."
                              className={`w-full px-6 py-4 rounded-2xl outline-none backdrop-blur-md transition-all duration-500 relative z-10 ${currentThemeClasses[theme]}`}
                              disabled={isGenerating}
                          />
                          <div className="absolute right-2 flex items-center gap-2 z-20">
                              <button
                                  type="submit"
                                  disabled={isGenerating || !prompt.trim()}
                                  className={`p-3 rounded-xl transition-all ${buttonThemeClasses[theme]} ${(!prompt.trim() || isGenerating) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                              </button>
                          </div>
                      </form>

                      <div className="flex gap-4 items-center pointer-events-auto">
                        <span className={`text-xs uppercase tracking-widest ${theme === 'light' ? 'text-gray-600' : 'text-white/50'}`}>Try:</span>
                        {['Thunderstorm', 'Cosmic Void', 'Liquid Gold'].map((suggestion) => (
                            <button 
                                key={suggestion}
                                onClick={() => {
                                    setPrompt(suggestion);
                                    setTimeout(() => handleSynthesize({ preventDefault: () => {} } as any), 50);
                                }}
                                className={`text-xs px-3 py-1.5 rounded-full backdrop-blur-sm transition-colors ${buttonThemeClasses[theme]}`}
                            >
                                {suggestion}
                            </button>
                        ))}
                      </div>

                      <div className="flex gap-2 items-center pointer-events-auto mt-2 flex-wrap justify-center">
                         {['Liquid Gold', 'Cosmic', 'Neon', 'Ocean', 'Volcanic', 'Cyberpunk', 'Rainbow'].map((palette) => (
                            <button 
                                key={palette}
                                onClick={() => {
                                    if (fluidApi.current) {
                                        fluidApi.current.updateConfig({ COLOR_PALETTE: palette });
                                        fluidApi.current.multipleSplats(5);
                                    }
                                }}
                                className={`text-xs px-3 py-1 rounded-md border border-white/20 hover:border-white/50 backdrop-blur-md transition-colors ${
                                    theme === 'light' ? 'bg-black/5 text-gray-800 border-black/10' : 'bg-white/5 text-white'
                                }`}
                            >
                                {palette}
                            </button>
                         ))}
                      </div>
                  </div>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}

