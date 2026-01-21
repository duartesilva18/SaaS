'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, ReferenceLine } from 'recharts';
import { ArrowUpCircle, ArrowDownCircle, Wallet, Info, Lock, ArrowRight, ChevronRight, AlertCircle, Zap, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/lib/LanguageContext';
import ZenInsights from '@/components/ZenInsights';
import PricingModal from '@/components/PricingModal';
import { DEMO_TRANSACTIONS, DEMO_CATEGORIES } from '@/lib/mockData';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Toast from '@/components/Toast';
import confetti from 'canvas-confetti';
import { Crown, Star, Check, Sparkles as SparklesIcon, Zap as ZapIcon, ArrowRightCircle, X, Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { t, formatCurrency } = useTranslation();
  const searchParams = useSearchParams();
  const [isPro, setIsPro] = useState(false);
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' as 'success' | 'error' });
  const [stats, setStats] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
    vault: 0,
    totalLimits: 0,
    dailyAllowance: 0,
    efficiencyScore: 0
  });
  const [chartData, setChartData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      setIsProcessingUpgrade(true);
      
      // Delay de 2s para garantir que o browser carregou tudo e o Stripe processou
      setTimeout(() => {
        setIsProcessingUpgrade(false);
        setShowUpgradeSuccess(true);
        confetti({
          particleCount: 200,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#fbbf24', '#ffffff']
        });
      }, 2000);

      // Limpar a URL sem recarregar a página
      window.history.replaceState({}, '', '/dashboard');
    }

    const fetchData = async () => {
      try {
        const [profileRes, transRes, catRes, invoicesRes] = await Promise.all([
          api.get('/auth/me'),
          api.get('/transactions/'),
          api.get('/categories/'),
          api.get('/stripe/invoices')
        ]);
        
        const user = profileRes.data;
        const invoices = invoicesRes.data;

        // Verificar se há faturas não pagas
        const hasUnpaid = invoices.some((inv: any) => 
          inv.status.toLowerCase() === 'unpaid' || 
          (inv.status.toLowerCase() === 'open' && inv.amount_due > 0)
        );

        if (hasUnpaid) {
          setToast({
            show: true,
            message: 'Atenção: Tens pagamentos em atraso. Verifica a tua faturação.',
            type: 'error'
          });
        }
        const hasActiveSub = ['active', 'trialing'].includes(user.subscription_status);
        setIsPro(hasActiveSub);
        
        // Só mostrar o Paywall se não for Pro E não estivermos a voltar de um pagamento (session_id)
        if (!hasActiveSub && !searchParams.get('session_id')) {
          setShowPaywall(true);
        }

        let transactions = [...transRes.data];
        let categories = catRes.data;

        if (!hasActiveSub && transactions.length === 0) {
          transactions = DEMO_TRANSACTIONS;
          categories = DEMO_CATEGORIES;
        }

        let income = 0;
        let expenses = 0;
        let vault = 0;
        
        const categoryMap = categories.reduce((acc: any, cat: any) => {
          acc[cat.id] = { ...cat, total: 0 };
          return acc;
        }, {});

        transactions.forEach((t: any) => {
          const cat = categoryMap[t.category_id];
          if (cat) {
            const amount = Math.abs(Number(t.amount_cents || 0) / 100);
            cat.total += amount;
            
            if (cat.type === 'income') {
              income += amount;
            } else {
              // Se for investimento ou emergência, somar ao cofre, não às despesas
              if (cat.nature === 'investment' || cat.nature === 'emergency' || cat.vault_type !== 'none') {
                vault += amount;
              } else {
                expenses += amount;
              }
            }
          }
        });

        // Calcular Alertas
        const newAlerts = categories
          .filter((cat: any) => cat.type === 'expense' && cat.monthly_limit_cents > 0)
          .map((cat: any) => {
            const currentSpent = categoryMap[cat.id]?.total || 0;
            const limit = cat.monthly_limit_cents / 100;
            const progress = (currentSpent / limit) * 100;
            
            if (progress >= 100) {
              const overAmount = currentSpent - limit;
              return {
                type: 'danger',
                title: overAmount > 0 ? 'Limite Excedido!' : 'Limite Atingido!',
                message: overAmount > 0 
                  ? `Gastaste mais ${formatCurrency(overAmount)} em ${cat.name} do que o planeado.`
                  : `Atingiste o teu limite planeado de ${formatCurrency(limit)} em ${cat.name}.`,
                category: cat.name,
                icon: 'AlertCircle'
              };
            } else if (progress >= 80) {
              return {
                type: 'warning',
                title: 'Atenção ao Limite',
                message: `Estás a ${Math.max(1, Math.round(100 - progress))}% de atingir o limite em ${cat.name}.`,
                category: cat.name,
                icon: 'Zap'
              };
            }
            return null;
          })
          .filter(Boolean);

        setAlerts(newAlerts);
        
        // Cálculos de Projeção e Eficiência (Exclusivos da Dashboard)
        const totalLimits = (categories || [])
          .filter((c: any) => c.type === 'expense')
          .reduce((sum: number, c: any) => sum + (Number(c.monthly_limit_cents || 0) / 100), 0);
        
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysPassed = now.getDate();
        const daysLeft = Math.max(1, daysInMonth - daysPassed);
        
        // Agora o Orçamento Global é baseado na Receita (o que tens para gastar)
        // Se não houver receita este mês, usamos os limites como fallback
        const totalBudget = income > 0 ? income : totalLimits;
        
        // O dinheiro que sobra para gastar por dia é: 
        // Orçamento Total - O que já consumiste - O que já guardaste (investimento)
        const remainingMoney = Math.max(0, totalBudget - expenses - vault);
        const dailyAllowance = remainingMoney / daysLeft;
        
        const efficiencyScore = (income > 0) ? ((income - expenses) / income) * 100 : 0;

        // Processamento para o novo gráfico de Ritmo Diário
        const dailySpending: any = {};
        const daysInMonthTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= daysInMonthTotal; i++) {
          dailySpending[i] = 0;
        }

        transactions.forEach((t: any) => {
          const tDate = new Date(t.transaction_date);
          if (tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear()) {
            const cat = categoryMap[t.category_id];
            if (cat && cat.type === 'expense' && cat.vault_type === 'none') {
              dailySpending[tDate.getDate()] += Math.abs(Number(t.amount_cents || 0) / 100);
            }
          }
        });

        const formattedTrendData = Object.entries(dailySpending).map(([day, amount]) => ({
          day: `${day}`,
          amount: Number(amount),
          limit: dailyAllowance > 0 ? dailyAllowance : null
        }));

        setTrendData(formattedTrendData as any);

        // O Saldo representa a saúde financeira real: tudo o que entrou menos o que foi consumido
        setStats({ 
          income: Number(income || 0), 
          expenses: Number(expenses || 0), 
          balance: Number((income - expenses) || 0), 
          vault: Number(vault || 0),
          totalLimits: Number(totalBudget || 0), // Agora reflete o Budget Real (Receita ou Plan)
          dailyAllowance: Number(dailyAllowance || 0),
          efficiencyScore: Number(efficiencyScore || 0)
        });
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
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
                <span className="text-emerald-400 ml-2 text-2xl">↑</span>
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
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Consumo</p>
              <p className="text-3xl font-black text-white tracking-tighter">
                {formatCurrency(stats.expenses)}
                <span className="text-red-400 ml-2 text-2xl">↓</span>
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
              <Target size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Investido</p>
              <p className="text-3xl font-black text-white tracking-tighter">
                {formatCurrency(stats.vault)}
                <span className="text-blue-400 ml-2 text-2xl">💎</span>
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-slate-900/40 backdrop-blur-xl p-8 rounded-[32px] border border-white/5 shadow-xl relative overflow-hidden group"
        >
          <div className="flex items-center space-x-6">
            <div className="w-12 h-12 bg-slate-800/50 text-slate-400 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wallet size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Saldo Global</p>
              <p className="text-3xl font-black text-white tracking-tighter">
                {formatCurrency(stats.balance)}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Zen Projections & Unique Dashboard Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-slate-950 p-10 rounded-[48px] border border-white/5 shadow-2xl relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[80px] rounded-full" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
            <div className="space-y-6 flex-1">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-blue-500 mb-2">Fluxo de Caixa Mensal</h3>
                <p className="text-3xl font-black text-white tracking-tighter">
                  {formatCurrency(stats.expenses)} <span className="text-slate-600 text-xl font-medium">/ {formatCurrency(stats.totalLimits || 0)}</span>
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <span>Consumo vs Receita</span>
                  <span>{stats.totalLimits > 0 ? Math.round((stats.expenses / stats.totalLimits) * 100) : 0}% Utilizado</span>
                </div>
                <div className="h-4 w-full bg-white/5 rounded-2xl p-1 border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, stats.totalLimits > 0 ? (stats.expenses / stats.totalLimits) * 100 : 0)}%` }}
                    className={`h-full rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-colors duration-500 ${
                      (stats.expenses / stats.totalLimits) > 0.9 ? 'bg-red-500' : 
                      (stats.expenses / stats.totalLimits) > 0.7 ? 'bg-amber-500' : 'bg-blue-600'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="w-px h-24 bg-white/5 hidden md:block" />

            <div className="space-y-2 text-center md:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Margem Diária</p>
              <p className={`text-4xl font-black tracking-tighter ${stats.dailyAllowance > 20 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatCurrency(stats.dailyAllowance || 0)}
              </p>
              <p className="text-[9px] font-bold text-slate-600 uppercase italic">Podes gastar por dia até ao fim do mês</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-slate-900/40 backdrop-blur-xl p-10 rounded-[48px] border border-white/5 shadow-2xl flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 text-center">Eficiência Zen</h3>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Zap size={16} />
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="relative flex items-center justify-center">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-white/5"
                />
                <motion.circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={364.4}
                  initial={{ strokeDashoffset: 364.4 }}
                  animate={{ strokeDashoffset: 364.4 - (364.4 * Math.max(0, Math.min(100, stats.efficiencyScore))) / 100 }}
                  className="text-emerald-500"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white leading-none">{Math.round(stats.efficiencyScore || 0)}%</span>
                <span className="text-[8px] font-black uppercase text-slate-500 mt-1">Score</span>
              </div>
            </div>
            
            <p className="text-center text-xs text-slate-400 font-medium italic mt-2 px-4 leading-relaxed">
              {stats.efficiencyScore > 30 ? 'Excelente! Estás a transformar receita em património com mestria.' : 
               stats.efficiencyScore > 10 ? 'Bom ritmo. Continua a focar-te em reduzir o consumo supérfluo.' :
               'Foco total: O teu consumo está a absorver quase toda a tua receita.'}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Telegram Promo Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-[40px] p-8 relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
          <ArrowRightCircle size={80} className="text-blue-500 -rotate-45" />
        </div>
        <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
          <div className="w-16 h-16 bg-blue-500 rounded-[24px] flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <ZapIcon size={32} className="text-white fill-white" />
          </div>
          <div className="flex-1 text-center md:text-left space-y-2">
            <h3 className="text-xl font-black uppercase tracking-tight text-white">Bot Telegram: Registo Ultra-Rápido</h3>
            <p className="text-sm text-slate-400 font-medium italic">Regista despesas por texto ou fotos de recibos em 2 segundos sem abrir a app.</p>
          </div>
          <a 
            href="https://t.me/FinanZenApp_bot" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98] whitespace-nowrap"
          >
            Associar com Telegram
          </a>
        </div>
      </motion.div>

      {/* Financial Health Alerts */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.section 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-12 space-y-4"
          >
            <div className="flex items-center gap-3 px-2 mb-4">
              <AlertCircle size={18} className="text-red-500" />
              <h2 className="text-[10px] font-black tracking-[0.4em] text-slate-500 uppercase">Alertas Críticos</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alerts.map((alert, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`relative overflow-hidden p-6 rounded-[32px] border flex items-center gap-6 transition-all group ${
                    alert.type === 'danger' 
                      ? 'bg-red-500/[0.03] border-red-500/20 hover:border-red-500/40 shadow-[0_0_30px_-10px_rgba(239,68,68,0.1)]' 
                      : 'bg-amber-500/[0.03] border-amber-500/20 hover:border-amber-500/40 shadow-[0_0_30px_-10px_rgba(245,158,11,0.1)]'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                    alert.type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                  }`}>
                    {alert.icon === 'AlertCircle' ? <AlertCircle size={28} /> : <Zap size={28} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-black uppercase tracking-tight mb-1 ${
                      alert.type === 'danger' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {alert.title}
                    </h4>
                    <p className="text-xs text-slate-400 font-medium italic truncate">
                      {alert.message}
                    </p>
                  </div>
                  <Link 
                    href="/categories" 
                    className={`p-3 rounded-xl transition-all ${
                      alert.type === 'danger' ? 'hover:bg-red-500/10 text-red-500' : 'hover:bg-amber-500/10 text-amber-500'
                    }`}
                  >
                    <ChevronRight size={20} />
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="bg-slate-900/30 backdrop-blur-sm p-10 rounded-[48px] border border-white/5 shadow-2xl relative overflow-hidden group/chart">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-4">
          <div>
            <h2 className="text-[10px] font-black tracking-[0.4em] text-slate-500 uppercase mb-1">Ritmo de Consumo Diário</h2>
            <p className="text-xs text-slate-400 font-medium italic">Monitorização de picos vs. Margem de Segurança</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Gastos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-px border-t border-dashed border-red-500/50" />
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Limite Diário</span>
            </div>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 40 }}>
              <defs>
                <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" vertical={false} stroke="rgba(255,255,255,0.03)" />
              <XAxis 
                dataKey="day" 
                stroke="#475569" 
                fontSize={9} 
                tick={{ fontWeight: '900', letterSpacing: '0.05em' }}
                axisLine={false}
                tickLine={false}
                dy={15}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis hide domain={[0, (dataMax) => Math.max(dataMax, stats.dailyAllowance * 1.2)]} />
              <Tooltip 
                cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '5 5' }}
                contentStyle={{ 
                  backgroundColor: '#020617', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '24px',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                  padding: '16px 24px'
                }}
                itemStyle={{ color: '#fff', fontWeight: '900', fontSize: '12px', textTransform: 'uppercase' }}
                formatter={(value: number) => [formatCurrency(value), 'Gasto']}
                labelFormatter={(label) => `Dia ${label}`}
              />
              <Area 
                type="monotone" 
                dataKey="amount" 
                stroke="#3b82f6" 
                strokeWidth={4}
                fillOpacity={1} 
                fill="url(#colorSpend)" 
                animationDuration={2000}
              />
              {stats.dailyAllowance > 0 && (
                <ReferenceLine 
                  y={stats.dailyAllowance} 
                  stroke="#ef4444" 
                  strokeDasharray="5 5" 
                  strokeOpacity={0.8}
                  strokeWidth={2}
                  label={{ 
                    position: 'top', 
                    value: `LIMITE: ${formatCurrency(stats.dailyAllowance)}`, 
                    fill: '#ef4444', 
                    fontSize: 9, 
                    fontWeight: '900',
                    textTransform: 'uppercase'
                  }} 
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Overlay de Transição do Stripe */}
      <AnimatePresence>
        {isProcessingUpgrade && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-[#020617] flex flex-col items-center justify-center gap-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse" />
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin relative z-10" />
            </div>
            <div className="text-center space-y-2 relative z-10">
              <h2 className="text-xl font-black text-white uppercase tracking-[0.3em] animate-pulse">
                A processar <span className="text-blue-500">Upgrade</span>...
              </h2>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest italic">
                Preparamos o teu novo ecossistema Zen
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Sucesso Pro */}
      <AnimatePresence>
        {showUpgradeSuccess && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUpgradeSuccess(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-2xl transition-all duration-300"
              style={{ willChange: 'backdrop-filter' }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-2xl bg-[#020617] border border-amber-500/20 rounded-[64px] p-12 md:p-16 shadow-[0_0_150px_-20px_rgba(245,158,11,0.4)] overflow-hidden text-center z-10"
            >
              <button 
                onClick={() => setShowUpgradeSuccess(false)}
                className="absolute top-8 right-8 p-3 hover:bg-white/5 rounded-full text-slate-500 transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>

              <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 blur-3xl rounded-full -z-10" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 blur-3xl rounded-full -z-10" />
              
              <motion.div 
                animate={{ 
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.05, 1]
                }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="w-32 h-32 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 rounded-[40px] flex items-center justify-center mx-auto mb-10 shadow-[0_20px_60px_-10px_rgba(245,158,11,0.6)] border border-amber-300/30"
              >
                <Crown size={64} className="text-black" />
              </motion.div>

              <h2 className="text-5xl font-black text-white tracking-tighter mb-6 uppercase">
                Bem-vindo à <br />
                <span className="text-amber-500 italic">Elite FinanZen</span>
              </h2>
              
              <div className="flex items-center justify-center gap-3 mb-10 text-amber-500/60 bg-amber-500/5 py-2 px-6 rounded-full w-fit mx-auto border border-amber-500/10">
                <Star size={14} fill="currentColor" />
                <span className="text-xs font-black uppercase tracking-[0.5em]">Mestre Zen Pro</span>
                <Star size={14} fill="currentColor" />
              </div>

              <p className="text-slate-400 font-medium italic text-xl leading-relaxed mb-12 max-w-md mx-auto">
                Parabéns! Acabas de desbloquear o poder máximo. IA ilimitada e suporte 24/7 agora ao teu serviço.
              </p>

              <button
                onClick={() => setShowUpgradeSuccess(false)}
                className="w-full py-7 bg-amber-500 hover:bg-amber-400 text-black rounded-[32px] font-black uppercase tracking-[0.4em] text-sm transition-all shadow-[0_20px_40px_-10px_rgba(245,158,11,0.4)] active:scale-[0.98] cursor-pointer"
              >
                Explorar Funções Pro
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PricingModal 
        isVisible={showPaywall} 
        onClose={() => setShowPaywall(false)} 
      />

      <Toast 
        isVisible={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, show: false })}
      />
    </motion.div>
  );
}
