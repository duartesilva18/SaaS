'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Trophy, 
  MessageSquare,
  BarChart3,
  Globe,
  Star,
  CheckCircle2,
  ChevronRight,
  Phone
} from 'lucide-react';
import { useTranslation } from '@/lib/LanguageContext';

export default function LandingPage() {
  const { t } = useTranslation();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white selection:bg-blue-500/30 overflow-x-hidden">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 py-3 px-4 text-center">
        <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em]">
          {t.banner}
        </p>
      </div>

      {/* Navbar */}
      <nav className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-blue-600/20 shadow-lg">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <span className="text-2xl font-black tracking-tighter">
            Finan<span className="text-blue-500 italic">Zen</span>
          </span>
        </div>
        
        <div className="flex items-center gap-8">
          <Link href="/auth/login" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white transition-colors hidden md:block">
            {t.nav.login}
          </Link>
          <Link href="/auth/register" className="bg-white text-black px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-50 transition-all hover:scale-105 active:scale-95 shadow-xl">
            {t.nav.register}
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-32 text-center relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-600/10 blur-[160px] -z-10 rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-[0.3em] mb-8"
        >
          <Sparkles size={14} />
          {t.hero.badge}
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9] max-w-5xl mx-auto"
        >
          {t.hero.title1}
          <span className="text-blue-500 italic block md:inline"> {t.hero.titleAccent}</span>
          {t.hero.title2}
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto italic mb-12"
        >
          {t.hero.description}
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6"
        >
          <Link href="/auth/register" className="w-full sm:w-auto bg-blue-600 text-white px-12 py-6 rounded-3xl text-xs font-black uppercase tracking-[0.3em] hover:bg-blue-500 transition-all hover:scale-105 active:scale-95 shadow-blue-600/20 shadow-2xl flex items-center justify-center gap-3">
            {t.hero.cta} <ArrowRight size={20} />
          </Link>
          <Link href="#steps" className="w-full sm:w-auto px-12 py-6 rounded-3xl text-xs font-black uppercase tracking-[0.3em] border border-slate-800 hover:bg-white/5 transition-all">
            Ver Como Funciona
          </Link>
        </motion.div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-white/5 bg-slate-950/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="text-center">
            <p className="text-4xl font-black tracking-tighter mb-2">180€</p>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{t.stats.saved}</p>
          </div>
          <div className="text-center border-y md:border-y-0 md:border-x border-white/5 py-8 md:py-0">
            <p className="text-4xl font-black tracking-tighter mb-2">3s</p>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{t.stats.time}</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-black tracking-tighter mb-2">99.9%</p>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{t.stats.success}</p>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section id="steps" className="max-w-7xl mx-auto px-6 py-32">
        <div className="text-center mb-24">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6 uppercase">
            {t.steps.title}
            <span className="text-blue-500 italic block md:inline"> {t.steps.titleAccent}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {t.steps.items.map((step: any, index: number) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="bg-slate-900/50 border border-slate-800 p-12 rounded-[48px] hover:border-blue-500/30 transition-colors group"
            >
              <div className="w-16 h-16 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center text-blue-500 mb-8 group-hover:scale-110 transition-transform">
                {index === 0 ? <Phone size={32} /> : index === 1 ? <MessageSquare size={32} /> : <Zap size={32} />}
              </div>
              <h3 className="text-xl font-black tracking-tight mb-4 uppercase">{step.t}</h3>
              <p className="text-slate-400 font-medium italic leading-relaxed">{step.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Resources Grid */}
      <section className="bg-[#03081c] py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-24">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-8">
              <Zap size={14} />
              {t.resources.badge}
            </div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6 uppercase">
              {t.resources.title}
              <span className="text-blue-500 italic block md:inline"> {t.resources.titleAccent}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {t.resources.items.map((resource: any, index: number) => (
              <div key={index} className="p-8 rounded-[32px] bg-slate-900/30 border border-slate-800/50 hover:bg-slate-900/50 transition-all cursor-default">
                <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-500 mb-6">
                  {index === 0 ? <Phone size={24} /> : index === 1 ? <BarChart3 size={24} /> : index === 2 ? <Globe size={24} /> : index === 3 ? <ShieldCheck size={24} /> : index === 4 ? <Trophy size={24} /> : <Star size={24} />}
                </div>
                <h4 className="text-sm font-black uppercase tracking-widest mb-3">{resource.t}</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed italic">{resource.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-7xl mx-auto px-6 py-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {t.testimonials.items.map((item: any) => (
            <motion.div 
              key={item.id}
              whileHover={{ y: -10 }}
              className="relative p-12 bg-slate-950 border border-slate-800 rounded-[48px]"
            >
              <div className="absolute -top-6 left-12 w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-xl font-black shadow-xl">
                {item.initial}
              </div>
              <p className="text-lg font-medium italic text-slate-300 mb-8 leading-relaxed">
                "{item.text}"
              </p>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-white">{item.name}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{item.role}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-32">
        <div className="text-center mb-24">
          <h2 className="text-4xl font-black tracking-tighter mb-6 uppercase">
            {t.faq.title}
            <span className="text-blue-500 italic block md:inline"> {t.faq.titleAccent}</span>
          </h2>
        </div>

        <div className="space-y-6">
          {t.faq.items.map((item: any, index: number) => (
            <div key={index} className="p-8 bg-slate-900/30 border border-slate-800 rounded-[32px]">
              <h4 className="text-sm font-black uppercase tracking-widest mb-4 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {item.q}
              </h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed italic ml-4">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#010413]">
        <div className="max-w-7xl mx-auto px-6 py-24 flex flex-col items-center text-center">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Sparkles size={16} />
            </div>
            <span className="text-xl font-black tracking-tighter uppercase">
              Finan<span className="text-blue-500 italic">Zen</span>
            </span>
          </div>
          
          <p className="text-xs font-black uppercase tracking-[0.5em] text-slate-700 mb-12">
            {t.footer.slogan}
          </p>

          <div className="flex flex-wrap justify-center gap-8 md:gap-16 mb-16">
            {t.footer.links.map((link: string, i: number) => (
              <Link key={i} href="#" className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 hover:text-white transition-colors">
                {link}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[8px] font-black text-slate-800 uppercase tracking-[0.4em]">
            <CheckCircle2 size={12} />
            {t.footer.badge}
          </div>
        </div>
      </footer>
    </div>
  );
}
