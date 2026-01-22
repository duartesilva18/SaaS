'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, Target, Zap, ShieldCheck, Rocket } from 'lucide-react';

const motivationalQuotes = [
  {
    icon: Sparkles,
    title: "A construir o teu futuro",
    quote: "Cada transação que registas é um passo em direção à liberdade financeira.",
    color: "from-blue-500 to-indigo-500"
  },
  {
    icon: TrendingUp,
    title: "A dominar o teu dinheiro",
    quote: "O controlo financeiro começa com a consciência de cada cêntimo.",
    color: "from-emerald-500 to-teal-500"
  },
  {
    icon: Target,
    title: "A alcançar os teus objetivos",
    quote: "Grandes sonhos são construídos com pequenas decisões diárias.",
    color: "from-purple-500 to-pink-500"
  },
  {
    icon: Zap,
    title: "A otimizar o teu fluxo",
    quote: "A velocidade da tua transformação financeira está nas tuas mãos.",
    color: "from-amber-500 to-orange-500"
  },
  {
    icon: ShieldCheck,
    title: "A proteger o teu património",
    quote: "A segurança financeira é construída com disciplina e visão clara.",
    color: "from-cyan-500 to-blue-500"
  },
  {
    icon: Rocket,
    title: "A acelerar o teu crescimento",
    quote: "O teu futuro financeiro está a ser moldado neste exato momento.",
    color: "from-rose-500 to-red-500"
  }
];

export default function LoadingScreen() {
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % motivationalQuotes.length);
    }, 3000); // Muda de frase a cada 3 segundos
    return () => clearInterval(interval);
  }, []);

  const currentQuote = motivationalQuotes[quoteIndex];
  const Icon = currentQuote.icon;

  return (
    <div className="fixed inset-0 bg-[#020617] z-[9999] flex items-center justify-center overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="relative z-10 flex flex-col items-center justify-center max-w-2xl px-8 text-center">
        {/* Logo/Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12 }}
          className="mb-12"
        >
          <div className={`w-24 h-24 bg-gradient-to-br ${currentQuote.color} rounded-[32px] flex items-center justify-center text-white shadow-2xl shadow-blue-600/30 rotate-3 ring-4 ring-blue-500/10`}>
            <Icon size={48} className="animate-pulse" />
          </div>
        </motion.div>

        {/* Loading Spinner */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-12 relative"
        >
          <div className="w-16 h-16 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-indigo-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </motion.div>

        {/* Motivational Quote */}
        <AnimatePresence mode="wait">
          <motion.div
            key={quoteIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-3xl md:text-4xl font-black tracking-tighter text-white mb-4"
            >
              {currentQuote.title.split(' ').map((word, i) => (
                <span
                  key={i}
                  className={i % 2 === 1 ? `text-transparent bg-clip-text bg-gradient-to-r ${currentQuote.color} italic` : ''}
                >
                  {word}{' '}
                </span>
              ))}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-lg md:text-xl text-slate-400 font-medium italic leading-relaxed max-w-lg mx-auto"
            >
              "{currentQuote.quote}"
            </motion.p>
          </motion.div>
        </AnimatePresence>

        {/* Progress Dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex gap-2 mt-12"
        >
          {motivationalQuotes.map((_, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0.8, opacity: 0.5 }}
              animate={{
                scale: i === quoteIndex ? 1.2 : 0.8,
                opacity: i === quoteIndex ? 1 : 0.3,
                width: i === quoteIndex ? 32 : 8
              }}
              transition={{ duration: 0.3 }}
              className={`h-2 rounded-full ${
                i === quoteIndex
                  ? `bg-gradient-to-r ${currentQuote.color}`
                  : 'bg-slate-800'
              }`}
            />
          ))}
        </motion.div>

        {/* Loading Text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 text-xs font-black uppercase tracking-[0.3em] text-slate-600"
        >
          A carregar o teu ecossistema...
        </motion.p>
      </div>

      {/* Floating Particles */}
      {typeof window !== 'undefined' && [...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-blue-500/20 rounded-full"
          initial={{
            x: Math.random() * (window.innerWidth || 1920),
            y: Math.random() * (window.innerHeight || 1080),
            opacity: 0
          }}
          animate={{
            y: [null, -100, -200],
            opacity: [0, 0.5, 0],
            scale: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
}

