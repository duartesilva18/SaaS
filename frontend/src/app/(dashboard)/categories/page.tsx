'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useTranslation } from '@/lib/LanguageContext';
import { 
  Tag, Plus, Trash2, Edit2, Check, X,
  ShoppingBag, Coffee, Car, Home, 
  Smartphone, Utensils, Heart, Briefcase,
  Gamepad, Plane, Zap, Layers, PieChart,
  BarChart3, Target, Sparkles, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Toast from '@/components/Toast';
import { 
  PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, 
  Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  monthly_limit_cents: number;
  color_hex: string;
  icon: string;
  is_default: boolean;
}

interface CategoryStats {
  category_id: string;
  name: string;
  total_spent_cents: number;
  count: number;
  percentage: number;
  color: string;
  icon: string;
}

const AVAILABLE_ICONS = [
  { name: 'Tag', icon: Tag },
  { name: 'ShoppingBag', icon: ShoppingBag },
  { name: 'Coffee', icon: Coffee },
  { name: 'Car', icon: Car },
  { name: 'Home', icon: Home },
  { name: 'Smartphone', icon: Smartphone },
  { name: 'Utensils', icon: Utensils },
  { name: 'Heart', icon: Heart },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'Gamepad', icon: Gamepad },
  { name: 'Plane', icon: Plane },
  { name: 'Zap', icon: Zap },
  { name: 'Layers', icon: Layers }
];

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#14B8A6', '#6366F1'
];

export default function CategoriesPage() {
  const { t, currency, formatCurrency } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense',
    monthly_limit: '',
    color_hex: COLORS[0],
    icon: 'Tag'
  });

  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catsRes, statsRes] = await Promise.all([
        api.get('/categories/'),
        api.get('/categories/stats')
      ]);
      setCategories(catsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Erro ao carregar categorias:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        monthly_limit_cents: formData.monthly_limit ? Math.round(parseFloat(formData.monthly_limit) * 100) : 0
      };

      if (editingCategory) {
        await api.patch(`/categories/${editingCategory.id}`, payload);
        setToastMsg(t.dashboard.categories.successEdit);
      } else {
        await api.post('/categories/', payload);
        setToastMsg(t.dashboard.categories.successAdd);
      }

      setToastType('success');
      setShowToast(true);
      setShowAddModal(false);
      setEditingCategory(null);
      setFormData({ name: '', type: 'expense', monthly_limit: '', color_hex: COLORS[0], icon: 'Tag' });
      fetchData();
    } catch (err) {
      setToastMsg("Erro ao guardar categoria.");
      setToastType('error');
      setShowToast(true);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Tens a certeza? Transações desta categoria podem ser afetadas.")) return;
    try {
      await api.delete(`/categories/${id}`);
      setToastMsg(t.dashboard.categories.successDelete);
      setToastType('success');
      setShowToast(true);
      fetchData();
    } catch (err: any) {
      setToastMsg(err.response?.data?.detail || "Erro ao eliminar.");
      setToastType('error');
      setShowToast(true);
    }
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      type: cat.type,
      monthly_limit: cat.monthly_limit_cents ? (cat.monthly_limit_cents / 100).toString() : '',
      color_hex: cat.color_hex,
      icon: cat.icon || 'Tag'
    });
    setShowAddModal(true);
  };

  const getIconComponent = (iconName: string) => {
    const found = AVAILABLE_ICONS.find(i => i.name === iconName);
    return found ? found.icon : Tag;
  };

  if (loading && categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full mb-4"
        />
        <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">A harmonizar categorias...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-10 pb-20">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-[40px] bg-slate-900 border border-slate-800 p-8 md:p-12">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[100px] -z-10" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <Layers size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">
                Gestão de Identidade
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-4">
              {t.dashboard.categories.title}
            </h1>
            <p className="text-slate-400 font-medium max-w-xl italic">
              {t.dashboard.categories.subtitle}
            </p>
          </div>
          
          <button
            onClick={() => {
              setEditingCategory(null);
              setFormData({ name: '', type: 'expense', monthly_limit: '', color_hex: COLORS[0], icon: 'Tag' });
              setShowAddModal(true);
            }}
            className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-lg shadow-blue-600/20 cursor-pointer"
          >
            <Plus size={18} />
            {t.dashboard.categories.addNew}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Charts & Stats */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[32px] p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <PieChart size={18} />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">
                  {t.dashboard.categories.statsTitle}
                </h3>
              </div>
            </div>

            {stats.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={stats}
                        dataKey="total_spent_cents"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        stroke="none"
                      >
                        {stats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                        formatter={(value: number) => formatCurrency(value / 100)}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-4">
                  {stats.slice(0, 5).map((stat) => (
                    <div key={stat.category_id} className="group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: stat.color }}
                          />
                          <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">
                            {stat.name}
                          </span>
                        </div>
                        <span className="text-xs font-black text-white">
                          {stat.percentage}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${stat.percentage}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: stat.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-slate-600">
                <Filter size={48} className="mb-4 opacity-20" />
                <p className="text-[10px] font-black uppercase tracking-widest">Sem dados este mês</p>
              </div>
            )}
          </div>

          {/* Detailed Category Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {categories.map((cat) => {
              const stat = stats.find(s => s.category_id === cat.id);
              const Icon = getIconComponent(cat.icon);
              const progress = cat.monthly_limit_cents > 0 
                ? (stat?.total_spent_cents || 0) / cat.monthly_limit_cents * 100 
                : 0;

              return (
                <motion.div
                  key={cat.id}
                  layout
                  className="group relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 hover:border-blue-500/30 rounded-[32px] p-6 transition-all"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110"
                        style={{ backgroundColor: cat.color_hex }}
                      >
                        <Icon size={24} />
                      </div>
                      <div>
                        <h4 className="font-black text-white uppercase tracking-tighter group-hover:text-blue-400 transition-colors">
                          {cat.name}
                        </h4>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${cat.type === 'expense' ? 'text-red-400' : 'text-emerald-400'}`}>
                          {cat.type === 'expense' ? t.dashboard.categories.expense : t.dashboard.categories.income}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => openEdit(cat)}
                        className="p-2 hover:bg-blue-500/10 text-blue-400 rounded-xl transition-colors cursor-pointer"
                      >
                        <Edit2 size={16} />
                      </button>
                      {!cat.is_default && (
                        <button 
                          onClick={() => handleDelete(cat.id)}
                          className="p-2 hover:bg-red-500/10 text-red-400 rounded-xl transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {cat.type === 'expense' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{t.dashboard.categories.spent}</span>
                        <span className="text-white">{formatCurrency((stat?.total_spent_cents || 0) / 100)}</span>
                      </div>
                      
                      {cat.monthly_limit_cents > 0 && (
                        <>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(progress, 100)}%` }}
                              className={`h-full rounded-full ${progress > 100 ? 'bg-red-500' : progress > 80 ? 'bg-orange-500' : 'bg-blue-500'}`}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                            <span className={progress > 100 ? 'text-red-400' : 'text-slate-600'}>
                              {Math.round(progress)}% {t.dashboard.categories.ofLimit}
                            </span>
                            <span className="text-slate-400">{formatCurrency(cat.monthly_limit_cents / 100)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Right: Zen Tips & Legend */}
        <div className="space-y-8">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[32px] p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-2xl rounded-full translate-x-10 -translate-y-10" />
            <Sparkles className="mb-6 opacity-80" size={32} />
            <h3 className="text-2xl font-black tracking-tighter mb-4 leading-none uppercase">Dica do Mestre</h3>
            <p className="text-blue-100 font-medium italic text-sm leading-relaxed">
              "Categorias são as gavetas da tua mente financeira. Quanto mais organizadas estiverem, mais clareza terás para tomar decisões zen."
            </p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[32px] p-8">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center gap-2">
              <Target size={14} />
              Alvos este Mês
            </h4>
            <div className="space-y-6">
              {stats.slice(0, 3).map((s) => (
                <div key={s.category_id} className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${s.color}20`, color: s.color }}
                  >
                    {(() => {
                      const Icon = getIconComponent(s.icon);
                      return <Icon size={20} />;
                    })()}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black text-white uppercase tracking-tighter">{s.name}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase">{s.count} {t.dashboard.categories.transactions}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 md:p-12">
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tighter uppercase mb-1">
                      {editingCategory ? t.dashboard.categories.edit : t.dashboard.categories.addNew}
                    </h2>
                    <p className="text-slate-500 text-xs font-medium italic">Define as regras da tua harmonia.</p>
                  </div>
                  <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 transition-colors cursor-pointer">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                  {/* Icon Selection */}
                  <div className="grid grid-cols-6 gap-3 mb-4">
                    {AVAILABLE_ICONS.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: item.name })}
                        className={`p-3 rounded-2xl transition-all cursor-pointer ${
                          formData.icon === item.name 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 scale-110' 
                            : 'bg-slate-800/50 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                        }`}
                      >
                        <item.icon size={20} />
                      </button>
                    ))}
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-2 block">
                        {t.dashboard.categories.name}
                      </label>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-600"
                        placeholder="Ex: Refeições, Lazer..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-2 block">
                          {t.dashboard.categories.type}
                        </label>
                        <select
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value as 'income' | 'expense' })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-blue-500 transition-all"
                        >
                          <option value="expense">{t.dashboard.categories.expense}</option>
                          <option value="income">{t.dashboard.categories.income}</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-2 block">
                          {t.dashboard.categories.limit}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            value={formData.monthly_limit}
                            onChange={(e) => setFormData({ ...formData, monthly_limit: e.target.value })}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-blue-500 transition-all pl-12"
                            placeholder="0.00"
                          />
                          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                            {currency === 'EUR' ? '€' : currency === 'BRL' ? 'R$' : '$'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Color Selection */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-3 block">
                        {t.dashboard.categories.color}
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setFormData({ ...formData, color_hex: c })}
                            className={`w-10 h-10 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                              formData.color_hex === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'
                            }`}
                            style={{ backgroundColor: c }}
                          >
                            {formData.color_hex === c && <Check size={16} className="text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-xs transition-all active:scale-95 shadow-xl shadow-blue-600/20 mt-10"
                  >
                    {editingCategory ? t.dashboard.categories.edit : t.dashboard.categories.addNew}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toast 
        message={toastMsg} 
        onClose={() => setShowToast(false)} 
        type={toastType} 
        isVisible={showToast}
      />
    </div>
  );
}
