'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { 
  Plus, Search, ArrowUpRight, ArrowDownRight, 
  Calendar, Tag, History, Check, X, Wallet, 
  ChevronDown, Sparkles, Activity, CreditCard,
  Edit2, Trash2, Info, Filter, SearchX
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/lib/LanguageContext';
import { useRouter } from 'next/navigation';
import Toast from '@/components/Toast';

interface Transaction {
  id: string;
  amount_cents: number;
  description: string;
  category_id: string;
  transaction_date: string;
  is_installment: boolean;
}

interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color_hex: string;
}

export default function TransactionsPage() {
  const { t, formatCurrency, currency } = useTranslation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null); // NEW: For confirm delete modal
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [toastInfo, setToastInfo] = useState<{ message: string; type: 'success' | 'error'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    category_id: '',
    transaction_date: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    try {
      const [transRes, catRes] = await Promise.all([
        api.get('/transactions/'),
        api.get('/categories/')
      ]);
      // Filtrar transações de seed (1 cêntimo) - não devem aparecer nem ser contabilizadas
      setTransactions(transRes.data.filter((t: any) => Math.abs(t.amount_cents) !== 1));
      setCategories(catRes.data);
    } catch (err: any) {
      console.error('Erro ao carregar dados:', err);
      
      // Se for erro de rede, mostrar mensagem mais útil
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        console.error('Erro de rede: O servidor backend pode não estar a correr. Verifica se o servidor está ativo em', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Atualizar dados automaticamente a cada 30 segundos
    const interval = setInterval(() => {
      fetchData();
    }, 30000); // 30 segundos
    
    return () => clearInterval(interval);
  }, []);

  const filteredTransactions = useMemo(() => {
    return [...transactions]
      .filter(t => {
        const cat = categories.find(c => c.id === t.category_id);
        const matchesSearch = t.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTab = activeTab === 'all' || cat?.type === activeTab;
        const matchesCategory = selectedCategory === 'all' || t.category_id === selectedCategory;
        return matchesSearch && matchesTab && matchesCategory;
      });
  }, [transactions, categories, searchTerm, activeTab, selectedCategory]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, selectedCategory]);

  const stats = useMemo(() => {
    const income = transactions
      .filter(t => categories.find(c => c.id === t.category_id)?.type === 'income')
      .reduce((acc, curr) => acc + curr.amount_cents, 0);
    const expenses = transactions
      .filter(t => categories.find(c => c.id === t.category_id)?.type === 'expense')
      .reduce((acc, curr) => acc + curr.amount_cents, 0);
    return { income, expenses, balance: income - expenses };
  }, [transactions, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Validar que uma categoria foi selecionada
      if (!formData.category_id || formData.category_id === '') {
        setToastInfo({ message: "Por favor, seleciona uma categoria.", type: 'error', isVisible: true });
        return;
      }

      const selectedDate = new Date(formData.transaction_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (selectedDate > today) {
        setToastInfo({ message: "A jornada Zen só regista o presente ou o passado. Escolha uma data válida.", type: 'error', isVisible: true });
        return;
      }

      // Verificar se a categoria selecionada existe
      const selectedCategory = categories.find(c => c.id === formData.category_id);
      if (!selectedCategory) {
        setToastInfo({ message: "Categoria inválida. Por favor, seleciona novamente.", type: 'error', isVisible: true });
        return;
      }

      // Debug: verificar categoria selecionada
      console.log('Categoria selecionada:', selectedCategory.name, 'Tipo:', selectedCategory.type, 'ID:', formData.category_id);

      const payload = {
        amount_cents: Math.round(parseFloat(formData.amount) * 100),
        description: formData.description,
        category_id: formData.category_id, // Garantir que não é null
        transaction_date: formData.transaction_date
      };

      console.log('Payload enviado:', payload);

      if (editingTransaction) {
        await api.patch(`/transactions/${editingTransaction.id}`, payload);
        setToastInfo({ message: "Transação atualizada!", type: 'success', isVisible: true });
      } else {
        await api.post('/transactions/', payload);
        setToastInfo({ message: "Transação registada com sucesso!", type: 'success', isVisible: true });
      }

      setShowAddModal(false);
      setEditingTransaction(null);
      setSelectedTransaction(null); // Reset selection
      setFormData({
        amount: '',
        description: '',
        category_id: '',
        transaction_date: new Date().toISOString().split('T')[0]
      });
      // Atualizar dados imediatamente após criar/editar
      await fetchData();
    } catch (err) {
      console.error(err);
      setToastInfo({ message: "Erro ao processar transação.", type: 'error', isVisible: true });
    }
  };

  const handleDelete = async () => {
    if (!transactionToDelete) return;
    try {
      // Garantir que o ID está no formato correto
      const transactionId = String(transactionToDelete).trim();
      console.log('Eliminando transação com ID:', transactionId);
      
      await api.delete(`/transactions/${transactionId}`);
      setToastInfo({ message: "Transação eliminada.", type: 'success', isVisible: true });
      setTransactionToDelete(null);
      setSelectedTransaction(null);
      // Atualizar dados imediatamente após eliminar
      await fetchData();
    } catch (err: any) {
      console.error('Erro ao eliminar transação:', err);
      console.error('ID da transação:', transactionToDelete);
      console.error('Resposta do erro:', err.response?.data);
      const errorMessage = err.response?.data?.detail || err.message || 'Erro ao eliminar transação.';
      setToastInfo({ message: errorMessage, type: 'error', isVisible: true });
      setTransactionToDelete(null);
    }
  };

  const handleEdit = (t: Transaction) => {
    setEditingTransaction(t);
    setFormData({
      amount: (t.amount_cents / 100).toString(),
      description: t.description,
      category_id: t.category_id,
      transaction_date: t.transaction_date
    });
    setSelectedTransaction(null); // FECHAR O MODAL DE DETALHES
    setShowAddModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 blur-[40px] opacity-20 animate-pulse" />
          <History size={64} className="text-blue-500 animate-spin relative z-10" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 animate-pulse">A carregar o teu histórico...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="max-w-[1400px] mx-auto space-y-12 pb-20 px-2 md:px-0"
    >
      {/* Hero Header */}
      <section className="relative">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 rounded-full mb-6">
              <Sparkles size={14} className="text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Teu Diário de Abundância</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white leading-none">
              Registo de <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 italic">Atividade</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-6 rounded-[32px] min-w-[200px] shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-[40px] rounded-full" />
              <div className="flex items-center gap-3 mb-2 text-slate-500">
                <ArrowUpRight size={16} className="text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Receitas Totais</span>
              </div>
              <p className="text-3xl font-black text-white">{formatCurrency(stats.income / 100)}</p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-6 rounded-[32px] min-w-[200px] shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-[40px] rounded-full" />
              <div className="flex items-center gap-3 mb-2 text-slate-500">
                <ArrowDownRight size={16} className="text-red-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Despesas Totais</span>
              </div>
              <p className="text-3xl font-black text-white">{formatCurrency(stats.expenses / 100)}</p>
            </div>
            
            <button
              onClick={() => {
                setEditingTransaction(null);
                // Não pré-selecionar categoria - deixar o utilizador escolher
                setFormData({ amount: '', description: '', category_id: '', transaction_date: new Date().toISOString().split('T')[0] });
                setShowAddModal(true);
              }}
              className="flex items-center gap-3 px-8 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-[24px] font-black uppercase tracking-widest text-xs transition-all shadow-2xl shadow-blue-600/30 group active:scale-95 cursor-pointer h-full"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform" />
              Nova Transação
            </button>
          </div>
        </div>
      </section>

      {/* Filters & Search */}
      <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] p-8">
        <div className="flex flex-col lg:flex-row gap-8 items-center justify-between mb-6">
          <div className="flex items-center gap-4 bg-slate-950/50 border border-slate-800 rounded-3xl p-1.5 w-full lg:w-auto">
            {['all', 'income', 'expense'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                  activeTab === tab 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                  : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab === 'all' ? 'Tudo' : tab === 'income' ? 'Receitas' : 'Despesas'}
              </button>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row gap-4 w-full lg:w-auto flex-1 max-w-3xl">
            <div className="relative flex-1 group">
              <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Pesquisar por descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-3xl py-4 pl-14 pr-5 text-white placeholder:text-slate-800 focus:border-blue-500/50 transition-all outline-none font-medium"
              />
            </div>

            <div className="relative group min-w-[200px]">
              <Tag size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-3xl py-4 pl-14 pr-10 text-white appearance-none focus:border-blue-500/50 transition-all outline-none font-medium cursor-pointer"
              >
                <option value="all">Todas as Categorias</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>
                ))}
              </select>
              <ChevronDown size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-blue-500/5 border border-blue-500/10 rounded-2xl w-fit">
          <Info size={14} className="text-blue-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Dica Zen: <span className="text-blue-400">Clica em qualquer linha</span> da tabela para editar ou eliminar um registo.
          </p>
        </div>
      </section>

      {/* Transactions List */}
      <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-[40px] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/50">
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Data</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Descrição</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Categoria</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              <AnimatePresence mode="popLayout">
                {paginatedTransactions.map((t, index) => {
                  const cat = categories.find(c => c.id === t.category_id);
                  return (
                    <motion.tr 
                      key={t.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => setSelectedTransaction(t)}
                      className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
                    >
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-white">{new Date(t.transaction_date).getDate()}</span>
                          <span className="text-[9px] font-black uppercase text-slate-600 tracking-tighter">
                            {new Date(t.transaction_date).toLocaleString('default', { month: 'short' })} {new Date(t.transaction_date).getFullYear()}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-sm font-black text-white group-hover:text-blue-400 transition-colors">{t.description}</p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat?.color_hex || '#3b82f6' }} />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{cat?.name || 'Sem Categoria'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <span className={`text-sm font-black ${cat?.type === 'income' ? 'text-emerald-400' : 'text-white'}`}>
                          {cat?.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(t.amount_cents) / 100)}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          
          {filteredTransactions.length === 0 && (
            <div className="py-32 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-8 border border-slate-800 shadow-2xl">
                <SearchX size={32} className="text-slate-700 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">Nenhuma transação encontrada</h3>
              <p className="text-slate-500 text-sm font-medium italic max-w-xs mx-auto">
                Tenta ajustar os teus filtros ou pesquisa por algo diferente.
              </p>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {filteredTransactions.length > itemsPerPage && (
          <div className="px-8 py-6 border-t border-slate-800/50 flex items-center justify-between bg-slate-900/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Mostrando <span className="text-white">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="text-white">{Math.min(currentPage * itemsPerPage, filteredTransactions.length)}</span> de <span className="text-white">{filteredTransactions.length}</span>
            </p>
            
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-2 rounded-xl border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronDown size={18} className="rotate-90" />
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    // Mostrar primeira, última, e páginas ao redor da atual
                    return page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1);
                  })
                  .map((page, index, array) => (
                    <div key={page} className="flex items-center gap-1">
                      {index > 0 && array[index - 1] !== page - 1 && (
                        <span className="text-slate-700 px-1">...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                          currentPage === page 
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                          : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  ))}
              </div>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-2 rounded-xl border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronDown size={18} className="-rotate-90" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-[48px] overflow-hidden shadow-2xl"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[80px] rounded-full -z-10" />
              
              <div className="p-8 lg:p-12">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-3xl font-black text-white tracking-tighter">
                    {editingTransaction ? 'Editar Registo' : 'Novo Registo'}
                  </h2>
                  <button onClick={() => {
                    setShowAddModal(false);
                    setEditingTransaction(null);
                  }} className="p-2 text-slate-500 hover:text-white transition-colors cursor-pointer">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} noValidate className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Descrição</label>
                    <div className="relative group">
                      <Activity size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                      <input
                        required
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Onde fluiu o dinheiro?"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-5 pl-14 pr-5 text-white placeholder:text-slate-800 focus:border-blue-500/50 transition-all outline-none font-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Valor</label>
                      <div className="relative group">
                        <Wallet size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                        <input
                          required
                          type="number"
                          step="0.01"
                          value={formData.amount}
                          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                          placeholder="0.00"
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-5 pl-14 pr-5 text-white focus:border-blue-500/50 transition-all outline-none font-medium"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Data</label>
                      <div className="relative group">
                        <Calendar size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                        <input
                          required
                          type="date"
                          max={new Date().toISOString().split('T')[0]}
                          value={formData.transaction_date}
                          onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-5 pl-14 pr-5 text-white focus:border-blue-500/50 transition-all outline-none font-medium cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Categoria</label>
                    <div className="relative group">
                      <Tag size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
                      <select
                        required
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-5 pl-14 pr-10 text-white appearance-none focus:border-blue-500/50 transition-all outline-none font-medium cursor-pointer"
                      >
                        <option value="">Selecionar Categoria</option>
                        {/* Separar receitas e despesas para facilitar seleção */}
                        <optgroup label="Receitas" className="bg-slate-900">
                          {categories.filter(c => c.type === 'income').map((c) => (
                            <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Despesas" className="bg-slate-900">
                          {categories.filter(c => c.type === 'expense' && c.vault_type === 'none').map((c) => (
                            <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Investimentos e Poupança" className="bg-slate-900">
                          {categories.filter(c => c.type === 'expense' && c.vault_type !== 'none').map((c) => (
                            <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>
                          ))}
                        </optgroup>
                      </select>
                      <ChevronDown size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                    {/* Mostrar tipo da categoria selecionada para confirmação */}
                    {formData.category_id && (
                      <div className="flex items-center gap-2 text-xs">
                        {(() => {
                          const selectedCat = categories.find(c => c.id === formData.category_id);
                          if (selectedCat) {
                            return (
                              <>
                                <span className="text-slate-500">Tipo:</span>
                                <span className={`font-black uppercase tracking-widest ${
                                  selectedCat.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  {selectedCat.type === 'income' ? 'Receita' : 'Despesa'}
                                </span>
                                {selectedCat.vault_type !== 'none' && (
                                  <>
                                    <span className="text-slate-500">•</span>
                                    <span className="text-amber-400 font-black uppercase tracking-widest">
                                      {selectedCat.vault_type === 'investment' ? 'Investimento' : 'Emergência'}
                                    </span>
                                  </>
                                )}
                              </>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-3xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-2xl shadow-blue-600/30 active:scale-[0.98] cursor-pointer"
                  >
                    {editingTransaction ? 'Guardar Alterações' : 'Registar Transação'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Details Modal */}
      <AnimatePresence>
        {selectedTransaction && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTransaction(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[80px] rounded-full -z-10" />
              
              <div className="flex flex-col items-center text-center gap-6">
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${
                  categories.find(c => c.id === selectedTransaction.category_id)?.type === 'income' 
                  ? 'bg-emerald-500/10 text-emerald-500' 
                  : 'bg-blue-500/10 text-blue-500'
                }`}>
                  <CreditCard size={32} />
                </div>
                
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tighter mb-1">
                    {selectedTransaction.description}
                  </h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Detalhes do Registo
                  </p>
                </div>

                <div className="w-full bg-white/5 border border-white/5 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Valor</span>
                    <span className={`text-xl font-black ${
                      categories.find(c => c.id === selectedTransaction.category_id)?.type === 'income' 
                      ? 'text-emerald-400' 
                      : 'text-white'
                    }`}>
                      {formatCurrency(Math.abs(selectedTransaction.amount_cents) / 100)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Data</span>
                    <span className="text-sm font-bold text-white">
                      {new Date(selectedTransaction.transaction_date).toLocaleDateString('pt-PT')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Categoria</span>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: categories.find(c => c.id === selectedTransaction.category_id)?.color_hex || '#3b82f6' }} />
                      <span className="text-sm font-bold text-white">
                        {categories.find(c => c.id === selectedTransaction.category_id)?.name || 'Sem Categoria'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleEdit(selectedTransaction)}
                    className="px-6 py-4 bg-white/5 border border-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Edit2 size={14} /> Editar
                  </button>
                  <button
                    onClick={() => setTransactionToDelete(selectedTransaction.id)}
                    className="px-6 py-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>

                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-white transition-colors"
                >
                  Fechar Detalhes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Delete Modal */}
      <AnimatePresence>
        {transactionToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTransactionToDelete(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[40px] p-8 shadow-2xl overflow-hidden text-center"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 blur-[40px] rounded-full -z-10" />
              
              <div className="w-16 h-16 bg-red-500/10 rounded-3xl flex items-center justify-center text-red-500 mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              
              <h3 className="text-2xl font-black text-white tracking-tighter mb-2">Eliminar Registo?</h3>
              <p className="text-slate-500 text-sm font-medium italic mb-8">
                Esta ação não pode ser desfeita. O registo será removido permanentemente.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTransactionToDelete(null)}
                  className="px-6 py-4 border border-slate-800 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-white/5 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="px-6 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-600/20 transition-all cursor-pointer"
                >
                  Sim, Eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toast 
        message={toastInfo.message}
        type={toastInfo.type}
        isVisible={toastInfo.isVisible}
        onClose={() => setToastInfo({ ...toastInfo, isVisible: false })}
      />
    </motion.div>
  );
}
