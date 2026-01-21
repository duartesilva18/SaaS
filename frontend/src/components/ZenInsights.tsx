'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, TrendingUp, AlertCircle, ChevronRight, BarChart3 } from 'lucide-react';
import { useTranslation } from '@/lib/LanguageContext';
import api from '@/lib/api';
import { DEMO_INSIGHTS } from '@/lib/mockData';

export default function ZenInsights() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const [profileRes, insightsRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/insights/')
        ]);
        const user = profileRes.data;
        const hasActiveSub = user.subscription_status === 'active';
        if (!hasActiveSub) {
          setData(DEMO_INSIGHTS);
        } else {
          setData(insightsRes.data);
        }
      } catch (err) {
        console.error('Erro ao procurar insights:', err);
        setData(DEMO_INSIGHTS);
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, []);

  if (loading) {
    return (
      <div className="w-full h-48 bg-slate-900/50 rounded-[32px] animate-pulse mb-8" />
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 mb-12">
      {/* Top Banner - Blue Accent */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-blue-600 rounded-[32px] p-8 md:p-10 flex flex-col md:flex-row items-center justify-between shadow-2xl shadow-blue-600/20 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
            <Sparkles size={28} className="text-white animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60 mb-2">Zen Insight</p>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight leading-tight">
              "{data.health_score > 80 ? 'EXCELENTE' : 'ATENÇÃO'}: {data.summary}"
            </h2>
          </div>
        </div>

        <div className="mt-8 md:mt-0 flex items-center gap-6 bg-white/10 backdrop-blur-md px-8 py-4 rounded-[24px] border border-white/10 relative z-10">
          <div className="relative w-16 h-14">
            <svg className="w-14 h-14 transform -rotate-90">
              <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/10" />
              <motion.circle 
                cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="6" fill="transparent" 
                strokeDasharray={150.8}
                initial={{ strokeDashoffset: 150.8 }}
                animate={{ strokeDashoffset: 150.8 - (150.8 * (data.health_score || 0)) / 100 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="text-white"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-black text-white">{data.health_score}%</span>
            </div>
          </div>
          <div className="text-left">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/50">Paz Financeira</p>
            <p className="text-xs font-black uppercase tracking-widest text-white">
              {data.health_score > 80 ? 'Harmonia Plena' : 'Necessita Foco'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Insights Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.insights?.slice(0, 3).map((insight: any, idx: number) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 + 0.2 }}
            className={`p-8 rounded-[32px] bg-slate-900/40 border border-white/5 hover:bg-slate-900/60 transition-all group relative overflow-hidden ${
              insight.type === 'expense' ? 'border-red-500/20 bg-red-500/5' : ''
            }`}
          >
            {insight.type === 'expense' && (
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-[60px] -z-10 rounded-full" />
            )}
            
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                insight.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' :
                insight.type === 'expense' ? 'bg-red-500/10 text-red-400' :
                'bg-blue-500/10 text-blue-400'
              }`}>
                {insight.type === 'income' ? <TrendingUp size={20} /> :
                 insight.type === 'expense' ? <AlertCircle size={20} /> :
                 <Zap size={20} />}
              </div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">
                {insight.title}
              </h4>
              {insight.type === 'expense' && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
              )}
            </div>

            <p className="text-sm font-medium text-slate-300 italic mb-8 leading-relaxed">
              "{insight.message}"
            </p>

            <div className="flex items-center justify-between">
              <span className={`text-[9px] font-black uppercase tracking-widest ${
                insight.type === 'expense' ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {insight.type === 'expense' ? 'Ação Requerida' : 'Zen Analytics'}
              </span>
              <ChevronRight size={14} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex justify-center pt-4">
        <button className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500 hover:text-blue-400 transition-colors flex items-center gap-2">
          Ver Análise Detalhada <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
