'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, ShieldCheck, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/LanguageContext';

export default function CookieBanner() {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('cookie-consent', 'all');
    setIsVisible(false);
  };

  const handleAcceptEssential = () => {
    localStorage.setItem('cookie-consent', 'essential');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-6 left-6 right-6 md:left-auto md:right-8 md:max-w-md z-[200]"
        >
          <div className="bg-[#0f172a]/80 backdrop-blur-2xl border border-slate-800 rounded-[32px] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-[50px] rounded-full -z-10" />
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center text-blue-400 shrink-0">
                <Cookie size={24} />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg leading-tight mb-1">
                  {t.cookies.title}
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {t.cookies.description}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAcceptAll}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 cursor-pointer"
              >
                <ShieldCheck size={18} />
                {t.cookies.acceptAll}
              </motion.button>
              <div className="grid grid-cols-2 gap-3">
                <motion.button
                  whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                  onClick={handleAcceptEssential}
                  className="py-3 px-4 border border-slate-800 text-slate-400 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all hover:text-white cursor-pointer"
                >
                  {t.cookies.declineAll}
                </motion.button>
                <motion.button
                  whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                  className="py-3 px-4 border border-slate-800 text-slate-400 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all hover:text-white flex items-center justify-center gap-1 cursor-pointer"
                >
                  {t.cookies.settings}
                  <ChevronRight size={14} />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

