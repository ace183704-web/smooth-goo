/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { initFluid } from './lib/fluid';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidApi = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
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
        setUiVisible(false);
    }, 4000);
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
                              Fluid Visualization Engine
                          </h1>
                          <p className={`text-sm mt-2 opacity-70 ${theme === 'light' ? 'text-gray-800' : 'text-white/70'}`}>
                              Interact with the canvas or choose a palette.
                          </p>
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

