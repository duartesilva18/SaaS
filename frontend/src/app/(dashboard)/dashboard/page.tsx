'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ArrowUpCircle, ArrowDownCircle, Wallet, Info, Lock, ArrowRight, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/lib/LanguageContext';
import ZenInsights from '@/components/ZenInsights';
import { DEMO_TRANSACTIONS, DEMO_CATEGORIES } from '@/lib/mockData';
import Link from 'next/link';

export default function DashboardPage() {
  const { t, formatCurrency } = useTranslation();
  const [isPro, setIsPro] = useState(false);
  const [stats, setStats] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
  });
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, transRes, catRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/transactions/'),
          api.get('/categories/')
        ]);
        
        const user = profileRes.data;
        const hasActiveSub = user.subscription_status === 'active';
        setIsPro(hasActiveSub);

        let transactions = [...transRes.data].sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
        let categories = catRes.data;

        if (!hasActiveSub && transactions.length === 0) {
          transactions = DEMO_TRANSACTIONS;
          categories = DEMO_CATEGORIES;
        }

        let income = 0;
        let expenses = 0;
        
        const categoryMap = categories.reduce((acc: any, cat: any) => {
          acc[cat.id] = { name: cat.name, type: cat.type, total: 0 };
          return acc;
        }, {});

        transactions.forEach((t: any) => {
          const cat = categoryMap[t.category_id];
          if (cat) {
            cat.total += Math.abs(t.amount_cents / 100);
            if (cat.type === 'income') income += t.amount_cents / 100;
            else expenses += Math.abs(t.amount_cents / 100);
          }
        });

        setStats({ income, expenses, balance: income - expenses });
        setChartData(Object.values(categoryMap).filter((c: any) => c.total > 0) as any);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 animate-pulse">A carregar dashboard...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="text-white pb-20"
    >
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-4xl font-black tracking-tighter text-white">Dashboard</h1>
        
        {!isPro && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-2xl"
          >
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Modo Demo Ativo</span>
            <Link 
              href="/pricing"
              className="ml-2 bg-amber-500 hover:bg-amber-400 text-black px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-colors"
            >
              Upgrade Pro
            </Link>
          </motion.div>
        )}
      </div>
      
      <div className="relative mb-12">
        <ZenInsights />
        {!isPro && (
          <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-[32px] border border-white/5 pointer-events-none">
            {/* Overlay contents are handled within components or removed for cleaner look if preferred */}
          </div>
        )}
      </div>

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-slate-900/40 backdrop-blur-xl p-8 rounded-[32px] border border-white/5 shadow-xl relative overflow-hidden group"
        >
          <div className="flex items-center space-x-6">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowUpCircle size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Receitas</p>
              <p className="text-3xl font-black text-white tracking-tighter">
                {formatCurrency(stats.income)}
                <span className="text-emerald-400 ml-2">↑</span>
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-slate-900/40 backdrop-blur-xl p-8 rounded-[32px] border border-white/5 shadow-xl relative overflow-hidden group"
        >
          <div className="flex items-center space-x-6">
            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowDownCircle size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Despesas</p>
              <p className="text-3xl font-black text-white tracking-tighter">
                {formatCurrency(stats.expenses)}
                <span className="text-red-400 ml-2">↓</span>
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-slate-900/40 backdrop-blur-xl p-8 rounded-[32px] border border-white/5 shadow-xl relative overflow-hidden group"
        >
          <div className="flex items-center space-x-6">
            <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wallet size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Saldo</p>
              <p className="text-3xl font-black text-white tracking-tighter">
                {formatCurrency(stats.balance)}
                <span className="text-blue-400 ml-2">€</span>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="bg-slate-900/30 backdrop-blur-sm p-10 rounded-[48px] border border-white/5 shadow-2xl relative overflow-hidden group/chart">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-[10px] font-black tracking-[0.4em] text-slate-500 uppercase">Gastos por Categoria</h2>
          
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-500 hover:text-white transition-all">
              <Info size={14} />
            </button>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" vertical={false} stroke="rgba(255,255,255,0.03)" />
              <XAxis 
                dataKey="name" 
                stroke="#475569" 
                fontSize={10} 
                tick={{ fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                axisLine={false}
                tickLine={false}
                dy={20}
              />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: 'rgba(255, 255, 255, 0.02)' }}
                contentStyle={{ 
                  backgroundColor: '#020617', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '24px',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                  padding: '16px 24px'
                }}
                itemStyle={{ color: '#fff', fontWeight: '900', fontSize: '12px', textTransform: 'uppercase' }}
                formatter={(value: number) => formatCurrency(value)} 
              />
              <Bar dataKey="total" radius={[12, 12, 0, 0]} barSize={60}>
                {chartData.map((entry: any, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.type === 'income' ? '#10b981' : '#ef4444'} 
                    fillOpacity={0.9} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}
