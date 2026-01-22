'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
  LineChart, Line
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Target, Zap, 
  Activity, PieChart as PieChartIcon, Calendar,
  ArrowUpRight, ArrowDownRight, Sparkles, Brain, Info,
  ShieldCheck, Clock, History, Landmark, CheckCircle2, CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/lib/LanguageContext';
import { DEMO_TRANSACTIONS, DEMO_CATEGORIES, DEMO_INSIGHTS, DEMO_RECURRING } from '@/lib/mockData';
import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';

export default function AnalyticsPage() {
  const { t, formatCurrency } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [rawData, setRawData] = useState<{ transactions: any[], categories: any[], insights: any, recurring: any[] }>({ transactions: [], categories: [], insights: null, recurring: [] });
  const [processedData, setProcessedData] = useState<any>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('Tudo');
  const [isFlowInfoOpen, setIsFlowInfoOpen] = useState(false);
  const [isDistInfoOpen, setIsDistInfoOpen] = useState(false);
  const [isWeeklyInfoOpen, setIsWeeklyInfoOpen] = useState(false);
  const [isTopInfoOpen, setIsTopInfoOpen] = useState(false);
  const [isEvoInfoOpen, setIsEvoInfoOpen] = useState(false);
  const [isVaultInfoOpen, setIsVaultInfoOpen] = useState(false);
  const [recurringToConfirm, setRecurringToConfirm] = useState<any>(null);

  const fetchAnalytics = async (force = false) => {
    try {
      if (!force) {
        const cached = localStorage.getItem('analytics_cache');
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const isFresh = Date.now() - timestamp < 30000; // 30 segundos de cache "fresca"
          
          setRawData(data);
          // Inclui 'cancel_at_period_end' para manter acesso até ao fim do período
          setIsPro(['active', 'trialing', 'cancel_at_period_end'].includes(data.subscription_status));
          if (isFresh) {
            setLoading(false);
            return;
          }
        }
      }

      const [profileRes, analyticsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/insights/composite')
      ]);

      const user = profileRes.data;
      // Inclui 'cancel_at_period_end' para manter acesso até ao fim do período
      const hasActiveSub = ['active', 'trialing', 'cancel_at_period_end'].includes(user.subscription_status);
      
      // Se a subscrição mudou desde a última cache, ignoramos a cache e atualizamos
      const cached = localStorage.getItem('analytics_cache');
      if (cached) {
        const { data } = JSON.parse(cached);
        // Se na cache era Free e agora é Pro, limpamos a cache
        if (data.subscription_status !== user.subscription_status) {
          localStorage.removeItem('analytics_cache');
        }
      }

      setIsPro(hasActiveSub);

      let compositeData = {
        ...analyticsRes.data,
        subscription_status: user.subscription_status // Guardar o status nos dados
      };

      // Se não for Pro e não tiver dados reais, injetar Mock Data
      if (!hasActiveSub && compositeData.transactions.length === 0) {
        compositeData = {
          ...compositeData,
          transactions: DEMO_TRANSACTIONS,
          categories: DEMO_CATEGORIES,
          insights: DEMO_INSIGHTS,
          recurring: DEMO_RECURRING
        };
      }

      setRawData(compositeData);
      localStorage.setItem('analytics_cache', JSON.stringify({
        data: compositeData,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error('Erro ao carregar análise:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleConfirmRecurring = async (recurringId: string) => {
    try {
      await api.post(`/recurring/${recurringId}/confirm`);
      setRecurringToConfirm(null);
      // Forçar atualização após confirmar pagamento
      fetchAnalytics(true);
    } catch (err) {
      console.error('Erro ao confirmar pagamento:', err);
    }
  };

  useEffect(() => {
    // Processar mesmo que não haja transações se for Pro (para mostrar zeros)
    if (!rawData.transactions.length && !isPro) return;

    const now = new Date();
    let filterDate = new Date();

    if (selectedPeriod === '7D') filterDate.setDate(now.getDate() - 7);
    else if (selectedPeriod === '30D') filterDate.setDate(now.getDate() - 30);
    else if (selectedPeriod === '90D') filterDate.setDate(now.getDate() - 90);
    else if (selectedPeriod === '12M') filterDate.setFullYear(now.getFullYear() - 1);
    else filterDate = new Date(0); // Tudo

    const filteredTransactions = rawData.transactions.filter((t: any) => {
      const transDate = new Date(t.transaction_date);
      return transDate >= filterDate;
    });

    // Process data for charts
    const monthlyData: any = {};
    const catDistribution: any = {};
    const weeklyRhythm: any = { 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0, 'Dom': 0 };
    const weekMap: any = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };
    
    let periodIncome = 0;
    let periodExpenses = 0;
    let cumulativeBalance = 0;
    let investmentTotal = 0;
    let emergencyTotal = 0;
    const evolutionData: any[] = [];

    // Filter and Sort for Recent Transactions
    const recentTransactions = [...rawData.transactions]
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .slice(0, 5)
      .map(t => ({
        ...t,
        category: rawData.categories.find(c => c.id === t.category_id)
      }));

    // Detect Upcoming (Future dates + Recurring rules)
    const upcomingFromTransactions = rawData.transactions
      .filter(t => {
        const transDate = new Date(t.transaction_date);
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // Mostrar apenas transações do FUTURO (amanhã em diante)
        // As de hoje já aparecem na "Atividade Recente"
        return transDate > todayDate; 
      })
      .map(t => ({
        description: t.description,
        amount_cents: t.amount_cents,
        transaction_date: t.transaction_date,
        type: 'manual',
        id: t.id
      }));

    const upcomingFromRecurring = (rawData.recurring || []).map(r => {
      const today = now.getDate();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Verificar se já existe uma transação este mês para esta regra
      const alreadyPaidThisMonth = rawData.transactions.some(t => 
        t.description === r.description && 
        Math.abs(t.amount_cents) === Math.abs(r.amount_cents) &&
        new Date(t.transaction_date) >= currentMonthStart
      );

      let nextDate = new Date(now.getFullYear(), now.getMonth(), r.day_of_month);
      
      // Se já foi pago este mês, projetamos para o próximo mês
      if (alreadyPaidThisMonth) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      
      const isToday = today === r.day_of_month;
      const isPastDue = today > r.day_of_month && !alreadyPaidThisMonth;

      return {
        id: r.id,
        description: r.description,
        amount_cents: r.amount_cents,
        transaction_date: nextDate.toISOString().split('T')[0],
        type: 'recurring',
        process_automatically: r.process_automatically,
        canConfirm: (isToday || isPastDue) && !alreadyPaidThisMonth, // Mostrar botão se for hoje ou estiver atrasado
        alreadyPaid: alreadyPaidThisMonth
      };
    });

    // Filtrar para mostrar apenas o que ainda não foi pago este mês OU o que vem no futuro
    const upcomingPayments = [...upcomingFromTransactions, ...upcomingFromRecurring]
      .filter(p => {
        if (p.type === 'recurring' && p.alreadyPaid) {
          // Se já pagou, só mostramos se a data projetada for futura (próximo mês)
          return new Date(p.transaction_date) > now;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(a.transaction_date).getTime();
        const dateB = new Date(b.transaction_date).getTime();
        return dateA - dateB; // Ordem ascendente: mais próximo primeiro
      })
      .slice(0, 5);

    const topExpenses = filteredTransactions
      .filter((t: any) => {
        const cat = rawData.categories.find((c: any) => c.id === t.category_id);
        // Apenas despesas que não sejam de investimento/emergência
        return (!cat || cat.type === 'expense') && (!cat || cat.vault_type === 'none');
      })
      .sort((a: any, b: any) => Math.abs(a.amount_cents) - Math.abs(b.amount_cents)) // Ordenar por valor absoluto (maiores primeiro)
      .reverse()
      .slice(0, 5)
      .map((t: any) => ({
        name: t.description || 'Sem descrição',
        value: Math.abs(t.amount_cents) / 100 // Mostrar valor absoluto (positivo)
      }));

    // Process all transactions for Evolution (Historical)
    const sortedAll = [...rawData.transactions].sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
    sortedAll.forEach((t: any) => {
      const cat = rawData.categories.find((c: any) => c.id === t.category_id);
      const amount = t.amount_cents / 100;
      
      // Calculate Vault totals (all time)
      if (cat?.vault_type === 'investment') {
        if (cat.type === 'expense') investmentTotal += amount;
        else investmentTotal -= amount; // Resgate de investimento
      }
      if (cat?.vault_type === 'emergency') {
        if (cat.type === 'expense') emergencyTotal += amount;
        else emergencyTotal -= amount; // Resgate de emergência
      }

      // Património Acumulado: Não subtrair investimentos (pois o dinheiro ainda é seu)
      if (cat?.type === 'income') {
        cumulativeBalance += amount;
      } else if (cat?.vault_type === 'none') {
        // Apenas subtrair despesas de consumo
        cumulativeBalance -= amount;
      }
      // Se for despesa de investimento/emergência, o saldo acumulado (património) não desce
      
      evolutionData.push({
        date: t.transaction_date,
        balance: cumulativeBalance
      });
    });

    filteredTransactions.forEach((t: any) => {
      const date = new Date(t.transaction_date);
      const monthYear = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
      const dayName = weekMap[date.getDay()];
      
      const cat = rawData.categories.find((c: any) => c.id === t.category_id);
      
      // Excluir categorias de Investimento ou Emergência dos gráficos de FLUXO e GASTOS
      if (cat && cat.vault_type !== 'none') return;

      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { name: monthYear, income: 0, expenses: 0 };
      }
      
      const amount = t.amount_cents / 100;
      
      if (cat) {
        if (cat.type === 'income') {
          monthlyData[monthYear].income += amount;
          periodIncome += amount;
        } else {
          const absAmount = Math.abs(amount); // Usar valor absoluto para despesas
          monthlyData[monthYear].expenses += absAmount;
          periodExpenses += absAmount;
          catDistribution[cat.name] = (catDistribution[cat.name] || 0) + absAmount;
          weeklyRhythm[dayName] += absAmount;
        }
      } else {
        const absAmount = Math.abs(amount); // Usar valor absoluto para despesas
        monthlyData[monthYear].expenses += absAmount;
        periodExpenses += absAmount;
        catDistribution['Outros'] = (catDistribution['Outros'] || 0) + absAmount;
        weeklyRhythm[dayName] += absAmount;
      }
    });

    // Calcular Saving Rate para o período selecionado
    const savingRate = periodIncome > 0 ? ((periodIncome - periodExpenses) / periodIncome) * 100 : 0;

    // Calcular um Health Score dinâmico simplificado para o período
    let dynamicScore = 70;
    if (periodIncome > 0) {
      if (periodExpenses > periodIncome) dynamicScore = 30;
      else if (savingRate > 20) dynamicScore = 90;
      else if (savingRate > 10) dynamicScore = 75;
    }

    setProcessedData({
      flow: Object.values(monthlyData).reverse(),
      distribution: Object.entries(catDistribution).map(([name, value]) => ({ name, value })),
      weekly: Object.entries(weeklyRhythm).map(([name, value]) => ({ name, value })),
      evolution: evolutionData.slice(-20), // Last 20 points for smoothness
      recentTransactions,
      upcomingPayments,
      topExpenses,
      healthScore: dynamicScore,
      savingRate: savingRate.toFixed(1),
      summary: rawData.insights?.summary || t.dashboard.analytics.subtitle,
      insights: rawData.insights?.insights || [],
      investmentTotal,
      emergencyTotal
    });
  }, [selectedPeriod, rawData]);

  const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];

  if (loading || !processedData) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-6 text-white">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 blur-[40px] opacity-20 animate-pulse" />
          <Brain size={64} className="text-blue-500 animate-bounce relative z-10" />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.4em] animate-pulse opacity-50">Processando Ecossistema...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-10 pb-20 relative"
    >
      {!isPro && (
        <div className="sticky top-20 z-[100] w-full bg-amber-500/90 backdrop-blur-md p-4 rounded-3xl border border-amber-400 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-black/20 rounded-2xl flex items-center justify-center text-black">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase text-black leading-none mb-1">Modo de Demonstração</h3>
              <p className="text-[10px] font-bold text-black/70 uppercase tracking-widest">Estás a ver dados mock. Ativa o plano Pro para veres os teus dados reais.</p>
            </div>
          </div>
          <Link href="/pricing" className="bg-black text-white px-8 py-3 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:scale-105 transition-all shadow-xl">
            Ativar Plano Pro Agora
          </Link>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white mb-2">
            {t.dashboard.analytics.title}
          </h1>
          <p className="text-slate-500 font-medium italic">
            {t.dashboard.analytics.subtitle}
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-slate-900/50 border border-slate-800 p-2 rounded-2xl">
          <div className="flex -space-x-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-slate-950 bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400">
                AI
              </div>
            ))}
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 pr-2 border-r border-slate-800">Zen Engine v2.0</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Live</span>
        </div>
      </header>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 p-6 rounded-[32px] group hover:border-blue-500/30 transition-all">
          <div className="flex items-center justify-between mb-4">
            <Activity className="text-blue-500" size={20} />
            <div className="px-2 py-1 bg-blue-500/10 rounded-lg text-[9px] font-black text-blue-400 uppercase">Saúde</div>
          </div>
          <p className="text-3xl font-black text-white mb-1">{processedData.healthScore}%</p>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Score Financeiro</p>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 p-6 rounded-[32px] group hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between mb-4">
            <Target className="text-emerald-500" size={20} />
            <div className="px-2 py-1 bg-emerald-500/10 rounded-lg text-[9px] font-black text-emerald-400 uppercase">Meta</div>
          </div>
          <p className="text-3xl font-black text-white mb-1">{processedData.savingRate}%</p>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Taxa de Poupança</p>
        </div>

        <div className="md:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-[32px] relative overflow-hidden shadow-2xl shadow-blue-600/20">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-[40px] rounded-full" />
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={18} className="text-white animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Zen Insight</span>
            </div>
            <p className="text-xl font-bold text-white leading-tight italic">
              "{processedData.summary}"
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-900/40 backdrop-blur-xl border border-slate-800 p-4 rounded-[24px]">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <Calendar size={14} className="text-blue-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Filtros de Período</span>
        </div>
        
        <div className="flex items-center gap-2">
          {['7D', '30D', '90D', '12M', 'Tudo'].map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${
                selectedPeriod === period 
                ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]' 
                : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {period}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-slate-800 mx-2" />

        <div className="flex items-center gap-2">
          <button className="px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-900/50 border border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300 transition-all cursor-pointer flex items-center gap-2">
            <PieChartIcon size={12} />
            Todas as Categorias
          </button>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Main Flow Chart */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white opacity-50 mb-1">{t.dashboard.analytics.spendingOverTime}</h3>
                <p className="text-xs text-slate-500 font-medium italic">Histórico de Fluxo de Caixa</p>
              </div>
              
              <div 
                className="relative"
                onMouseEnter={() => setIsFlowInfoOpen(true)}
                onMouseLeave={() => setIsFlowInfoOpen(false)}
              >
                <button className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-500 hover:text-white hover:bg-white/10 transition-all cursor-help">
                  <Info size={12} />
                </button>
                
                <AnimatePresence>
                  {isFlowInfoOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="absolute top-full left-0 mt-3 w-64 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl pointer-events-none z-20"
                    >
                      <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
                        Este gráfico compara as tuas <span className="text-emerald-400">Receitas</span> (verde) com as tuas <span className="text-red-400">Despesas</span> (vermelho) ao longo do tempo. 
                        Ajuda a visualizar meses de poupança positiva vs. meses de défice.
                      </p>
                      <div className="absolute bottom-full left-4 border-[6px] border-transparent border-b-slate-800" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <Calendar size={20} className="text-slate-700" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={processedData.flow}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#475569" fontSize={10} font-weight="900" />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" strokeWidth={3} />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpenses)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Distribution Chart */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white opacity-50 mb-1">{t.dashboard.analytics.categoryDistribution}</h3>
                <p className="text-xs text-slate-500 font-medium italic">Onde aplicas a tua energia financeira</p>
              </div>

              <div 
                className="relative"
                onMouseEnter={() => setIsDistInfoOpen(true)}
                onMouseLeave={() => setIsDistInfoOpen(false)}
              >
                <button className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-500 hover:text-white hover:bg-white/10 transition-all cursor-help">
                  <Info size={12} />
                </button>
                
                <AnimatePresence>
                  {isDistInfoOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="absolute top-full left-0 mt-3 w-64 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl pointer-events-none z-20"
                    >
                      <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
                        Este gráfico de donut mostra a percentagem de despesas em cada categoria. 
                        Cores diferentes ajudam a identificar rapidamente quais as áreas que consomem mais recursos do teu orçamento.
                      </p>
                      <div className="absolute bottom-full left-4 border-[6px] border-transparent border-b-slate-800" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <PieChartIcon size={20} className="text-slate-700" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={processedData.distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {processedData.distribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* New Row: Weekly Rhythm & Top Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Weekly Rhythm Chart */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white opacity-50 mb-1">Ritmo Semanal</h3>
                <p className="text-xs text-slate-500 font-medium italic">Distribuição de gastos por dia da semana</p>
              </div>

              <div 
                className="relative"
                onMouseEnter={() => setIsWeeklyInfoOpen(true)}
                onMouseLeave={() => setIsWeeklyInfoOpen(false)}
              >
                <button className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-500 hover:text-white hover:bg-white/10 transition-all cursor-help">
                  <Info size={12} />
                </button>
                
                <AnimatePresence>
                  {isWeeklyInfoOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="absolute top-full left-0 mt-3 w-64 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl pointer-events-none z-20"
                    >
                      <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
                        Identifica em que dias da semana o teu dinheiro "foge" mais depressa. 
                        Ajuda a detetar padrões de gastos excessivos em fins de semana ou dias específicos de rotina.
                      </p>
                      <div className="absolute bottom-full left-4 border-[6px] border-transparent border-b-slate-800" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <Activity size={20} className="text-slate-700" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processedData.weekly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#475569" fontSize={10} font-weight="900" />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: 'rgba(59, 130, 246, 0.03)' }}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={30}>
                  {processedData.weekly.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#3b82f6' : '#1e293b'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Top Expenses List/Chart */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white opacity-50 mb-1">Pesos Pesados</h3>
                <p className="text-xs text-slate-500 font-medium italic">As tuas 5 maiores despesas do período</p>
              </div>

              <div 
                className="relative"
                onMouseEnter={() => setIsTopInfoOpen(true)}
                onMouseLeave={() => setIsTopInfoOpen(false)}
              >
                <button className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-500 hover:text-white hover:bg-white/10 transition-all cursor-help">
                  <Info size={12} />
                </button>
                
                <AnimatePresence>
                  {isTopInfoOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="absolute top-full left-0 mt-3 w-64 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl pointer-events-none z-20"
                    >
                      <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
                        Um olhar direto sobre as transações que mais impacto tiveram no teu saldo este mês. 
                        Estes são os teus principais alvos para otimização.
                      </p>
                      <div className="absolute bottom-full left-4 border-[6px] border-transparent border-b-slate-800" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <TrendingDown size={20} className="text-red-900/40" />
          </div>
          <div className="space-y-4">
            {processedData.topExpenses.map((expense: any, index: number) => (
              <div key={index} className="flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 truncate max-w-[70%]">{expense.name}</span>
                  <span className="text-xs font-black text-white">{formatCurrency(expense.value)}</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(expense.value / processedData.topExpenses[0].value) * 100}%` }}
                    transition={{ duration: 1, delay: index * 0.1 }}
                    className="h-full bg-gradient-to-r from-red-600 to-rose-400"
                  />
                </div>
              </div>
            ))}
            {processedData.topExpenses.length === 0 && (
              <p className="text-center text-slate-500 text-xs italic py-10">Sem despesas registadas no período.</p>
            )}
          </div>
        </section>
      </div>

      {/* Row: Evolução Financeira & Zen Vault (Investimentos) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Evolution Chart */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[60px] rounded-full" />
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white opacity-50 mb-1">Evolução de Património</h3>
                <p className="text-xs text-slate-500 font-medium italic">Crescimento acumulado ao longo do tempo</p>
              </div>
              <div 
                className="relative"
                onMouseEnter={() => setIsEvoInfoOpen(true)}
                onMouseLeave={() => setIsEvoInfoOpen(false)}
              >
                <button className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-500 hover:text-white transition-all">
                  <Info size={12} />
                </button>
                <AnimatePresence>
                  {isEvoInfoOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 mt-3 w-64 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-20 pointer-events-none"
                    >
                      <p className="text-[10px] text-slate-400">Este gráfico mostra o saldo acumulado total. É a métrica definitiva do teu progresso financeiro a longo prazo.</p>
                      <div className="absolute bottom-full left-4 border-[6px] border-transparent border-b-slate-800" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <TrendingUp size={20} className="text-emerald-500/30" />
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={processedData.evolution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Line 
                  type="monotone" 
                  dataKey="balance" 
                  stroke="#10b981" 
                  strokeWidth={4} 
                  dot={false}
                  activeDot={{ r: 6, fill: '#10b981', stroke: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Zen Vault (Reservas e Investimentos) */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8 relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/10 blur-[80px] rounded-full group-hover:bg-blue-600/20 transition-all" />
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                <Landmark size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white opacity-50 mb-1">Cofre de Reservas</h3>
                <p className="text-xs text-slate-500 font-medium italic">Segurança e Investimento</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/5 border border-white/5 p-4 rounded-3xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 text-center">Fundo de Emergência</p>
              <p className="text-lg font-black text-white text-center">{formatCurrency(processedData.emergencyTotal)}</p>
              <div className="w-full h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                <div 
                  className="h-full bg-blue-500" 
                  style={{ width: `${Math.min(100, (processedData.emergencyTotal / (processedData.evolution.slice(-1)[0]?.balance || 1)) * 100)}%` }} 
                />
              </div>
            </div>
            <div className="bg-white/5 border border-white/5 p-4 rounded-3xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 text-center">Investimentos Zen</p>
              <p className="text-lg font-black text-emerald-400 text-center">{formatCurrency(processedData.investmentTotal)}</p>
              <div className="w-full h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                <div 
                  className="h-full bg-emerald-500" 
                  style={{ width: `${Math.min(100, (processedData.investmentTotal / (processedData.evolution.slice(-1)[0]?.balance || 1)) * 100)}%` }} 
                />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck size={18} className="text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white">Taxa de Liberdade</span>
            </div>
            <span className="text-sm font-black text-blue-400">{(parseFloat(processedData.savingRate) * 1.2).toFixed(1)}%</span>
          </div>
        </section>
      </div>

      {/* Row: Próximos Vencimentos & Transações Recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Payments */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8">
          <div className="flex items-center gap-3 mb-8">
            <Clock className="text-orange-500" size={20} />
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white opacity-50">Próximos Vencimentos</h3>
          </div>
          <div className="space-y-4">
            {processedData.upcomingPayments.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.05] rounded-2xl group hover:bg-white/[0.06] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex flex-col items-center justify-center">
                    <span className="text-[8px] font-black text-orange-500 uppercase">{new Date(p.transaction_date).toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-sm font-black text-white">{new Date(p.transaction_date).getDate()}</span>
                  </div>
                  <div>
                    <p className="text-xs font-black text-white">{p.description || 'Sem descrição'}</p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      {p.type === 'recurring' ? 'Recorrente' : 'Agendado'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-black text-white">-{formatCurrency(p.amount_cents / 100)}</span>
                  {p.type === 'recurring' && (
                    p.process_automatically ? (
                      <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl" title="Processamento Automático">
                        <Zap size={16} className="animate-pulse" />
                      </div>
                    ) : (
                      p.canConfirm && (
                        <button 
                          onClick={() => setRecurringToConfirm(p)}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 rounded-xl transition-all cursor-pointer group/pay"
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest">{t.dashboard.analytics.confirmPayment}</span>
                          <CheckCircle2 size={16} className="group-hover/pay:scale-110 transition-transform" />
                        </button>
                      )
                    )
                  )}
                </div>
              </div>
            ))}
            {processedData.upcomingPayments.length === 0 && (
              <p className="text-center text-slate-500 text-xs italic py-10">Sem vencimentos futuros detetados.</p>
            )}
          </div>
        </section>

        {/* Recent Transactions Feed */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8">
          <div className="flex items-center gap-3 mb-8">
            <History className="text-blue-500" size={20} />
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white opacity-50">Atividade Recente</h3>
          </div>
          <div className="space-y-4">
            {processedData.recentTransactions.map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-transparent hover:border-white/[0.05] transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.category?.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                    {t.category?.type === 'income' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  </div>
                  <div>
                    <p className="text-xs font-black text-white truncate max-w-[120px]">{t.description || 'Sem descrição'}</p>
                    <p className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter">{new Date(t.transaction_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className={`text-sm font-black ${t.category?.type === 'income' ? 'text-emerald-400' : 'text-white'}`}>
                  {t.category?.type === 'income' ? '+' : '-'}{formatCurrency(t.amount_cents / 100)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* AI Deep Dive Cards */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Zap className="text-blue-500 fill-blue-500/20" size={24} />
          <h2 className="text-xl font-black text-white tracking-tighter uppercase tracking-widest text-[11px] opacity-60">
            {t.dashboard.analytics.aiInsights}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {processedData.insights.map((insight: any, index: number) => (
            <motion.div
              key={index}
              whileHover={{ y: -5 }}
              className={`bg-slate-900/40 backdrop-blur-xl border rounded-[32px] p-8 flex flex-col gap-6 relative overflow-hidden ${
                insight.type === 'warning' ? 'border-red-500/20 shadow-red-500/5 shadow-2xl' : 'border-slate-800'
              }`}
            >
              {insight.type === 'warning' && (
                <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-[40px] rounded-full" />
              )}
              
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  insight.type === 'warning' ? 'bg-red-500/10 text-red-500' : 
                  insight.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'
                }`}>
                  <Activity size={24} />
                </div>
                <h4 className="font-black text-white text-sm tracking-tight leading-tight">{insight.title}</h4>
              </div>
              
            <p className="text-slate-200 text-sm leading-relaxed italic font-semibold">
              "{insight.message}"
            </p>

              <button className="mt-auto flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors cursor-pointer">
                Aplicar Correção <ArrowUpRight size={12} />
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Confirmation Modal for Payment */}
      <AnimatePresence>
        {recurringToConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRecurringToConfirm(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/10 blur-[80px] rounded-full -z-10" />
              
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-3xl flex items-center justify-center text-emerald-500">
                  <CreditCard size={32} />
                </div>
                
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tighter mb-2">
                    {t.dashboard.analytics.confirmPaymentTitle}
                  </h2>
                  <p className="text-slate-500 text-sm font-medium italic">
                    {t.dashboard.analytics.confirmPaymentText}
                  </p>
                </div>

                <div className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t.dashboard.recurring.description}</span>
                    <span className="text-sm font-black text-white">{recurringToConfirm.description}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t.dashboard.recurring.amount}</span>
                    <span className="text-sm font-black text-emerald-400">{formatCurrency(recurringToConfirm.amount_cents / 100)}</span>
                  </div>
                </div>

                <div className="w-full grid grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={() => setRecurringToConfirm(null)}
                    className="px-6 py-4 border border-slate-800 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-white/5 transition-all cursor-pointer"
                  >
                    {t.dashboard.analytics.cancel}
                  </button>
                  <button
                    onClick={() => handleConfirmRecurring(recurringToConfirm.id)}
                    className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
                  >
                    {t.dashboard.analytics.confirmPaymentBtn}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

