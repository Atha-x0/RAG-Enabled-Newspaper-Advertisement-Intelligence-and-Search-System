'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Upload, Database, FileText, BarChart3, HelpCircle, 
  MapPin, Tag, Calendar, User, Phone, Globe, Mail, ExternalLink, Layers, AlertCircle,
  Loader2, RefreshCw, Send, CheckCircle2, ChevronRight, Sparkles,
  ArrowRightLeft, ShieldAlert, ShoppingBag, ShieldCheck, Star, 
  Clock, Truck, Check, Plus, Trash2, Edit3, Hexagon, Bell, Sun, Moon, Menu, X, ChevronDown, CheckCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getAutocomplete, getTrending } from '../lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const formatCurrencySymbol = (currency) => {
  if (!currency) return '₹';
  const norm = currency.trim().toUpperCase();
  const map = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
  };
  return map[norm] || (norm + ' ');
};

const formatPriceDisplay = (price, currency) => {
  if (price === undefined || price === null || price === 0) {
    return 'Price: Not Available';
  }
  const symbol = formatCurrencySymbol(currency);
  return `${symbol}${price.toLocaleString()}`;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

function Dashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('search'); // 'search', 'compare', 'chat', 'admin', 'analytics'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);

  // Search & Filtering State (Applied parameters for Query)
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [sortBy, setSortBy] = useState('Relevance');

  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [trending, setTrending] = useState([]);
  const searchInputRef = useRef(null);



  // Sidebar Filter Form State (Local until applied)
  const [localCategory, setLocalCategory] = useState('');
  const [localBrand, setLocalBrand] = useState('');
  const [localPrice, setLocalPrice] = useState(100000);
  const [localLocation, setLocalLocation] = useState('');

  // Applied Filters State passed to the React Query
  const [appliedCategory, setAppliedCategory] = useState('');
  const [appliedBrand, setAppliedBrand] = useState('');
  const [appliedPrice, setAppliedPrice] = useState(100000);
  const [appliedLocation, setAppliedLocation] = useState('');

  // Compare List state (Product IDs)
  const [compareList, setCompareList] = useState([]);

  // Detail Modal State
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedAd, setSelectedAd] = useState(null);
  const [showAdModal, setShowAdModal] = useState(false);

  // Admin edit product modal
  const [editingProduct, setEditingProduct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Admin create product modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProductData, setNewProductData] = useState({
    name: '', brand: '', category: '', model_number: '', description: '',
    specifications: { Power: '', Voltage: '', Frequency: '', Efficiency: '' }
  });

  // Debouncing Search Input (500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Autocomplete: fetch suggestions on partial input
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await getAutocomplete(searchQuery);
        setSuggestions(res.data.suggestions || []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load trending on mount
  useEffect(() => {
    getTrending().then(res => setTrending(res.data || [])).catch(() => {});
  }, []);

  // Dynamic Lookup Queries for filters
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories');
      return res.data;
    }
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const res = await api.get('/brands');
      return res.data;
    }
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await api.get('/locations');
      return res.data;
    }
  });

  // Main Products Search & Filter query
  const { 
    data: searchData = { results: [], web_results: [], all_results: [], search_meta: {} }, 
    isLoading: isProductsLoading, 
    isError: isProductsError, 
    refetch: refetchProducts 
  } = useQuery({
    queryKey: ['products', appliedQuery, appliedCategory, appliedBrand, appliedLocation, appliedPrice, sortBy],
    queryFn: async () => {
      // If we have a query, use /search (includes web). Otherwise use /products.
      const url = appliedQuery ? "/search" : "/products";
      const res = await api.get(url, {
        params: {
          q: appliedQuery || undefined,
          brand: appliedBrand || undefined,
          category: appliedCategory || undefined,
          location: appliedLocation || undefined,
          include_web: true,
        }
      });

      // Handle unified search response (has results + web_results)
      if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        let localResults = res.data.results || [];
        let webResults = res.data.web_results || [];
        let allResults = res.data.all_results || [...localResults, ...webResults];

        // If plain /products endpoint (array response)
        if (Array.isArray(res.data)) {
          localResults = res.data;
          allResults = res.data;
        }

        // Filter by location (local filter for local results)
        if (appliedLocation) {
          localResults = localResults.filter(p => {
            return p.offers && p.offers.some(o =>
              o.dealer_location && o.dealer_location.toLowerCase().includes(appliedLocation.toLowerCase())
            );
          });
        }

        // Filter by price
        if (appliedPrice < 100000) {
          localResults = localResults.filter(p => !p.min_price || p.min_price <= appliedPrice);
        }

        // Sort local results
        if (sortBy === 'Price Low to High') {
          localResults.sort((a, b) => (a.min_price || 0) - (b.min_price || 0));
        } else if (sortBy === 'Price High to Low') {
          localResults.sort((a, b) => (b.min_price || 0) - (a.min_price || 0));
        } else if (sortBy === 'Delivery Time') {
          localResults.sort((a, b) => {
            const aDays = a.offers?.length ? Math.min(...a.offers.map(o => o.delivery_time_days || 3)) : 3;
            const bDays = b.offers?.length ? Math.min(...b.offers.map(o => o.delivery_time_days || 3)) : 3;
            return aDays - bDays;
          });
        } else if (sortBy === 'Newest') {
          localResults.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
        }

        // Sort web results by relevance_score then source_priority
        webResults.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0) || (a.source_priority || 4) - (b.source_priority || 4));

        // Sort allResults
        const getPrice = (r) => {
          if (r.result_type === 'web_scraped') {
            return r.price || 0;
          }
          return r.min_price || 0;
        };

        const getDeliveryTime = (r) => {
          if (r.result_type === 'web_scraped') {
            const dt = r.specifications?.["Delivery Time"] || r.specifications?.["delivery"] || 3;
            return parseInt(dt) || 3;
          }
          return r.offers?.length ? Math.min(...r.offers.map(o => o.delivery_time_days || 3)) : 3;
        };

        const getRankKey = (r) => {
          const matchScore = parseFloat(r.score !== undefined && r.score !== null ? r.score : r.relevance_score || 0);
          const sourceRelevance = parseFloat(r.relevance_score || 0);
          const sourcePriority = parseInt(r.source_priority !== undefined && r.source_priority !== null ? r.source_priority : 4);
          
          let dateNum = 0;
          const pubDate = r.publication_date || "";
          if (pubDate && pubDate !== "Not Available") {
            dateNum = parseInt(pubDate.replace(/[-/]/g, "")) || 0;
          }
          
          const verificationConfidence = parseFloat(
            r.detection_confidence !== undefined && r.detection_confidence !== null ? r.detection_confidence :
            r.ad_confidence !== undefined && r.ad_confidence !== null ? r.ad_confidence : 1.0
          );
          
          return { matchScore, sourceRelevance, sourcePriority, dateNum, verificationConfidence };
        };

        if (sortBy === 'Price Low to High') {
          allResults.sort((a, b) => getPrice(a) - getPrice(b));
        } else if (sortBy === 'Price High to Low') {
          allResults.sort((a, b) => getPrice(b) - getPrice(a));
        } else if (sortBy === 'Delivery Time') {
          allResults.sort((a, b) => getDeliveryTime(a) - getDeliveryTime(b));
        } else if (sortBy === 'Newest') {
          allResults.sort((a, b) => (b.publication_date || '').localeCompare(a.publication_date || ''));
        } else {
          // Relevance ranking
          allResults.sort((a, b) => {
            const ka = getRankKey(a);
            const kb = getRankKey(b);
            if (kb.matchScore !== ka.matchScore) return kb.matchScore - ka.matchScore;
            if (kb.sourceRelevance !== ka.sourceRelevance) return kb.sourceRelevance - ka.sourceRelevance;
            if (ka.sourcePriority !== kb.sourcePriority) return ka.sourcePriority - kb.sourcePriority;
            if (kb.dateNum !== ka.dateNum) return kb.dateNum - ka.dateNum;
            return kb.verificationConfidence - ka.verificationConfidence;
          });
        }

        return {
          results: localResults,
          web_results: webResults,
          all_results: allResults,
          search_meta: res.data.search_meta || {},
          developer_telemetry: res.data.developer_telemetry || null
        };
      }

      // Plain array from /products
      const results = Array.isArray(res.data) ? res.data : [];
      return { results, web_results: [], search_meta: {} };
    }
  });

  const products = searchData.results || [];
  const webResults = searchData.web_results || [];
  const allResults = searchData.all_results || [];
  const searchMeta = searchData.search_meta || {};
  const developerTelemetry = searchData.developer_telemetry || null;

  const handleApplyFilters = () => {
    setAppliedCategory(localCategory);
    setAppliedBrand(localBrand);
    setAppliedLocation(localLocation);
    setAppliedPrice(localPrice);
    setIsSidebarOpen(false);
  };

  const handleClearFilters = () => {
    setLocalCategory('');
    setLocalBrand('');
    setLocalLocation('');
    setLocalPrice(100000);
    
    setAppliedCategory('');
    setAppliedBrand('');
    setAppliedLocation('');
    setAppliedPrice(100000);
  };

  const handleToggleCompare = (productId) => {
    if (compareList.includes(productId)) {
      setCompareList(prev => prev.filter(id => id !== productId));
    } else {
      if (compareList.length >= 4) {
        alert("Maximum 4 products can be compared at once.");
        return;
      }
      setCompareList(prev => [...prev, productId]);
    }
  };

  const handlePillClick = (pillCategory) => {
    if (pillCategory === 'All') {
      setLocalCategory('');
      setAppliedCategory('');
    } else {
      let mapped = pillCategory;
      if (pillCategory === 'Motors') mapped = 'Electric Motors';
      if (pillCategory === 'Pumps') mapped = 'Pumps & Accessories';
      
      setLocalCategory(mapped);
      setAppliedCategory(mapped);
    }
  };

  return (
    <div className={`flex min-h-screen text-slate-800 bg-slate-50 font-sans antialiased ${darkMode ? 'dark bg-slate-900 text-slate-100' : ''}`}>
      {/* 1. Left Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] bg-white border-r border-slate-200 transition-transform duration-300 lg:translate-x-0 lg:static lg:h-screen shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Logo Section */}
        <div className="flex items-center space-x-3 px-6 py-6 border-b border-slate-100">
          <div className="relative flex items-center justify-center shrink-0">
            <Hexagon className="h-9 w-9 text-blue-600 fill-blue-50 stroke-[2.5]" />
            <div className="absolute h-3 w-3 rounded-full bg-blue-600"></div>
          </div>
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight text-slate-900 leading-none">Seetech</h1>
            <p className="text-xs font-semibold text-blue-600 mt-1">ProcureIntel v1.2</p>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {[
            { id: 'search', label: 'Search', icon: Search },
            { id: 'compare', label: 'Compare', icon: ArrowRightLeft },
            { id: 'chat', label: 'AI Assistant', icon: Sparkles },
            { id: 'admin', label: 'Admin Console', icon: ShieldCheck },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
                className={`flex items-center w-full px-4 py-3 text-sm font-semibold rounded-2xl transition-smooth ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-905'}`}
              >
                <Icon className={`h-5 w-5 mr-3 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}

          {/* Filter Card inside Sidebar (Hidden if activeTab is not search) */}
          {activeTab === 'search' && (
            <div className="pt-6 border-t border-slate-100 mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Filters</span>
                <button 
                  onClick={handleClearFilters}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Clear All
                </button>
              </div>

              {/* Category Dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Category</label>
                <div className="relative">
                  <select
                    value={localCategory}
                    onChange={(e) => setLocalCategory(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-white border border-slate-200 text-slate-800 text-sm font-medium rounded-xl appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Brand Dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Brand</label>
                <div className="relative">
                  <select
                    value={localBrand}
                    onChange={(e) => setLocalBrand(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-white border border-slate-200 text-slate-800 text-sm font-medium rounded-xl appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">All Brands</option>
                    {brands.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Price Slider */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Price Range</label>
                <input 
                  type="range" 
                  min="0" 
                  max="100000" 
                  step="5000"
                  value={localPrice} 
                  onChange={(e) => setLocalPrice(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                />
                <div className="flex justify-between text-xs font-semibold text-slate-500 mt-1">
                  <span>₹0</span>
                  <span className="text-blue-600 font-bold">₹{localPrice === 100000 ? '1,00,000+' : localPrice.toLocaleString()}</span>
                </div>
              </div>

              {/* Supplier Location */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Supplier Location</label>
                <div className="relative">
                  <select
                    value={localLocation}
                    onChange={(e) => setLocalLocation(e.target.value)}
                    className="w-full pl-3 pr-8 py-2.5 bg-white border border-slate-200 text-slate-800 text-sm font-medium rounded-xl appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">All Locations</option>
                    {locations.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Apply Button */}
              <button
                onClick={handleApplyFilters}
                className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-smooth"
              >
                Apply Filters
              </button>
            </div>
          )}
        </nav>
      </aside>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Top Header Panel */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center space-x-4 flex-1 max-w-2xl">
            {/* Hamburger for mobile */}
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 -ml-2 rounded-lg lg:hidden hover:bg-slate-100 text-slate-600"
            >
              {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            
            {/* Large Search Input */}
            {activeTab === 'search' && (
              <div className="flex-1 flex items-center space-x-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search products, ads, dealers... e.g. 'Havells MCB 32A' or '3mm wire'"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setAppliedQuery(searchQuery); setShowSuggestions(false); } }}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-smooth"
                  />
                  {/* Autocomplete Dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-lg z-50 overflow-hidden">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onMouseDown={() => { setSearchQuery(s); setAppliedQuery(s); setShowSuggestions(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-2 border-b border-slate-50 last:border-0"
                        >
                          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{s}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setAppliedQuery(searchQuery); setShowSuggestions(false); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-full shadow-sm flex items-center space-x-2 transition-smooth"
                >
                  <Search className="h-4 w-4" />
                  <span>Search</span>
                </button>
              </div>
            )}
            
            {activeTab !== 'search' && (
              <h2 className="text-xl font-bold font-display text-slate-900 capitalize">
                {activeTab === 'compare' ? 'Product Comparison Matrix' : activeTab === 'chat' ? 'AI Procurement Assistant' : activeTab === 'admin' ? 'Administrative Control Center' : 'Procurement Analytics Dashboard'}
              </h2>
            )}
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center space-x-4 ml-4">
            <button className="p-2.5 rounded-full hover:bg-slate-100 text-slate-650 transition-smooth">
              <Bell className="h-5 w-5" />
            </button>
            <button 
              onClick={() => setDeveloperMode(!developerMode)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs border transition-smooth ${developerMode ? 'bg-indigo-650 text-white border-indigo-650 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100'}`}
            >
              Developer Mode: {developerMode ? 'ON' : 'OFF'}
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-full hover:bg-slate-100 text-slate-650 transition-smooth"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="flex items-center space-x-1 border border-slate-200 rounded-full pl-2 pr-3 py-1 bg-slate-50 cursor-pointer">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-900 text-white font-bold text-xs uppercase">
                SK
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </div>
          </div>
        </header>

        {/* Main Content Pane */}
        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* Sub-tab 1: Product Search Engine */}
          {activeTab === 'search' && (
            <div className="space-y-6">
              
              {/* Category Pills Row */}
              <div className="flex items-center space-x-3 overflow-x-auto pb-2 scrollbar-none">
                <button 
                  onClick={() => handlePillClick('All')}
                  className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-xl border transition-smooth shrink-0 ${!appliedCategory ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <span>All Categories</span>
                  <ChevronDown className="h-4 w-4 ml-1.5" />
                </button>
                {['Motors', 'Gearboxes', 'Bearings', 'Pumps', 'Conveyors'].map((pill) => {
                  let mapped = pill;
                  if (pill === 'Motors') mapped = 'Electric Motors';
                  if (pill === 'Pumps') mapped = 'Pumps & Accessories';
                  const isPillActive = appliedCategory === mapped;

                  return (
                    <button
                      key={pill}
                      onClick={() => handlePillClick(pill)}
                      className={`px-4 py-2.5 text-sm font-medium rounded-xl border transition-smooth shrink-0 ${isPillActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                      {pill}
                    </button>
                  );
                })}
                <button className="flex items-center px-4 py-2.5 text-sm font-medium bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-smooth shrink-0">
                  <span>More</span>
                  <ChevronDown className="h-4 w-4 ml-1.5" />
                </button>
              </div>

              {/* Title & Sorting Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {appliedQuery 
                      ? `Search Results (${allResults.length} ${allResults.length === 1 ? 'item' : 'items'} found)` 
                      : `Available Industrial Products (${products.length} ${products.length === 1 ? 'item' : 'items'} cataloged)`}
                  </h3>
                  {appliedQuery && searchMeta.inferred_category && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Detected: <span className="font-semibold text-blue-600">{searchMeta.inferred_category}</span>
                      {searchMeta.inferred_location && <> · Location: <span className="font-semibold text-blue-600">{searchMeta.inferred_location}</span></>}
                      {searchMeta.search_id && (
                        <>
                          {' · '}
                          Search ID: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-700 font-bold">{searchMeta.search_id}</span>
                          {' · '}
                          <button
                            onClick={() => {
                              setSearchLogId(searchMeta.search_id);
                              setAdminTab('search_logs');
                              setActiveTab('admin');
                              setTimeout(() => {
                                refetchSearchLogs();
                              }, 100);
                            }}
                            className="text-blue-600 hover:text-blue-700 font-bold hover:underline"
                          >
                            View Execution Logs
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <span className="text-sm text-slate-500 font-medium">Sort by:</span>
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="pl-3 pr-8 py-1.5 bg-white border border-slate-200 text-slate-800 text-sm font-semibold rounded-lg appearance-none cursor-pointer focus:outline-none"
                    >
                      <option>Relevance</option>
                      <option>Price Low to High</option>
                      <option>Price High to Low</option>
                      <option>Newest</option>
                      <option>Delivery Time</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
 
              {/* Developer Mode Telemetry Dashboard */}
              {developerMode && developerTelemetry && (
                <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-3xl p-6 shadow-xl font-mono text-xs space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <h4 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center">
                      <ShieldAlert className="h-4 w-4 mr-2" /> Developer Telemetry Console
                    </h4>
                    <span className="bg-indigo-950/50 text-indigo-400 border border-indigo-900/50 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                      Latency: {developerTelemetry.api_response_time_ms}ms · Cache: {developerTelemetry.cache_hits ? 'HIT' : 'MISS'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Column 1: API & DB Metrics */}
                    <div className="space-y-3">
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-indigo-400">Database & API Logs</span>
                        <div className="space-y-1.5 pt-1 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-slate-500">API Response Time</span>
                            <span className="text-emerald-400 font-bold">{developerTelemetry.api_response_time_ms} ms</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Cache Status</span>
                            <span className={developerTelemetry.cache_hits ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                              {developerTelemetry.cache_hits ? 'HIT (30m Cached)' : 'MISS (Live Scrape)'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">SQL Queries Executed</span>
                            <span className="text-indigo-400 font-bold">{developerTelemetry.sql_queries?.length || 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Warnings and Errors */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 space-y-2">
                        <span className="text-[10px] font-bold uppercase text-indigo-400">Diagnostics Log</span>
                        <div className="space-y-1 pt-1 text-[11px]">
                          {developerTelemetry.errors && developerTelemetry.errors.length > 0 ? (
                            developerTelemetry.errors.map((err, i) => (
                              <div key={i} className="text-red-400">✗ ERROR: {err}</div>
                            ))
                          ) : (
                            <div className="text-slate-500">No runtime exceptions captured.</div>
                          )}
                          {developerTelemetry.warnings && developerTelemetry.warnings.map((warn, i) => (
                            <div key={i} className="text-amber-400">! WARN: {warn}</div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Gemini API Usage */}
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 space-y-3 md:col-span-1">
                      <span className="text-[10px] font-bold uppercase text-indigo-400">LLM Grounding Statistics</span>
                      {developerTelemetry.gemini_stats ? (
                        <div className="space-y-2 text-[11px]">
                          <div className="flex justify-between border-b border-slate-900/50 pb-1">
                            <span className="text-slate-500">Gemini LLM calls</span>
                            <span className="text-indigo-400 font-bold">{developerTelemetry.gemini_stats.calls}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-900/50 pb-1">
                            <span className="text-slate-500">Model Name</span>
                            <span className="text-slate-350">{developerTelemetry.gemini_stats.model}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-900/50 pb-1">
                            <span className="text-slate-500">Input Token Count</span>
                            <span className="text-indigo-400">{developerTelemetry.gemini_stats.input_tokens} tokens</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Output Token Count</span>
                            <span className="text-indigo-400">{developerTelemetry.gemini_stats.output_tokens} tokens</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No LLM resources utilized for this transaction.</p>
                      )}
                    </div>

                    {/* Column 3: Active SQL Queries list */}
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 space-y-2 md:col-span-1 overflow-y-auto max-h-40">
                      <span className="text-[10px] font-bold uppercase text-indigo-400">Captured SQL Operations</span>
                      <div className="space-y-1.5 pt-1 text-[10px] font-mono text-slate-400">
                        {developerTelemetry.sql_queries && developerTelemetry.sql_queries.map((q, idx) => (
                          <div key={idx} className="pb-1 border-b border-slate-900/50 last:border-0 truncate" title={q}>
                            {idx + 1}. <span className="text-indigo-300">{q}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Telemetry per card details */}
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 space-y-2">
                    <span className="text-[10px] font-bold uppercase text-indigo-400">Card-level Telemetry Metrics</span>
                    <div className="overflow-x-auto max-h-32 text-[10px] text-slate-400">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase">
                            <th className="pb-1">Card ID</th>
                            <th className="pb-1">Semantic Score</th>
                            <th className="pb-1">Priority Rank</th>
                            <th className="pb-1">Composite Key [Score, Relevance, Priority, Recency, Confidence]</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {allResults.map((r) => {
                            const rid = r.id;
                            const score = developerTelemetry.similarity_scores?.[rid];
                            const priority = developerTelemetry.source_priorities?.[rid];
                            const rankKey = developerTelemetry.ranking_scores?.[rid];
                            return (
                              <tr key={r.id}>
                                <td className="py-1 text-slate-350 truncate max-w-[120px]" title={rid}>{rid}</td>
                                <td className="py-1 text-emerald-400 font-bold">{(score * 100).toFixed(1)}%</td>
                                <td className="py-1">Priority {priority}</td>
                                <td className="py-1 font-mono text-indigo-300">[{rankKey?.join(', ')}]</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading, Error, Empty & Unified Results Grid */}
              {isProductsLoading ? (
                <div className="space-y-6">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-6 animate-pulse">
                      <div className="w-full md:w-1/4 aspect-[16/9] bg-slate-200 rounded-2xl"></div>
                      <div className="flex-1 space-y-4 py-2">
                        <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                        <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                        <div className="h-4 bg-slate-200 rounded w-full"></div>
                        <div className="h-10 bg-slate-200 rounded w-1/2"></div>
                      </div>
                      <div className="w-full md:w-1/4 bg-slate-100 rounded-2xl p-4"></div>
                    </div>
                  ))}
                </div>
              ) : isProductsError ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm max-w-xl mx-auto">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                  <h4 className="text-lg font-bold text-slate-900">Unable to connect to backend</h4>
                  <p className="text-sm text-slate-500">The procurement microservice is not responding. Please check backend host logs or retry.</p>
                  <button 
                    onClick={() => refetchProducts()}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl shadow-md transition-smooth flex items-center justify-center gap-2 mx-auto text-xs"
                  >
                    <RefreshCw className="h-4 w-4" /> Retry Connection
                  </button>
                </div>
              ) : allResults.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm max-w-md mx-auto">
                  <Database className="h-12 w-12 text-slate-350 mx-auto" />
                  <h4 className="text-lg font-bold text-slate-900">No matching industrial products found</h4>
                  <p className="text-sm text-slate-500">No parts catalogs matching the search terms or filters are currently indexed in local stores.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {allResults.map((result) => {
                    if (result.result_type === 'web_scraped') {
                      return (
                        <WebResultCard 
                          key={result.id} 
                          result={result} 
                          onViewDetails={(ad) => { setSelectedAd(ad); setShowAdModal(true); }} 
                        />
                      );
                    } else {
                      return (
                        <ProductCard 
                          key={result.id}
                          product={result} 
                          onViewDetails={(id) => { setSelectedProductId(id); setShowProductModal(true); }}
                          onToggleCompare={handleToggleCompare}
                          inCompareList={compareList.includes(result.product_id || result.id)}
                        />
                      );
                    }
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sub-tab 2: Compare Matrices */}
          {activeTab === 'compare' && (
            <ComparePage 
              compareList={compareList} 
              onRemove={handleToggleCompare} 
              onViewDetails={(id) => { setSelectedProductId(id); setShowProductModal(true); }}
            />
          )}

          {/* Sub-tab 3: AI Assistant (RAG Chatbot) */}
          {activeTab === 'chat' && (
            <AIAssistantPage onViewDetails={(id) => { setSelectedProductId(id); setShowProductModal(true); }} />
          )}

          {/* Sub-tab 4: Admin Console */}
          {activeTab === 'admin' && (
            <AdminConsole 
              onEdit={(prod) => { setEditingProduct(prod); setShowEditModal(true); }}
              onDelete={async (id) => {
                if (confirm("Delete this product from catalog?")) {
                  try {
                    await api.delete(`/products/${id}`);
                    queryClient.invalidateQueries({ queryKey: ['products'] });
                  } catch (e) {
                    alert("Delete failed.");
                  }
                }
              }}
              onTriggerCreate={() => setShowCreateModal(true)}
            />
          )}

          {/* Sub-tab 5: Analytics Dashboards */}
          {activeTab === 'analytics' && (
            <AnalyticsPage />
          )}
        </main>
      </div>

      {/* 3. Product Details Modal */}
      {showProductModal && selectedProductId && (
        <ProductDetailsModal 
          productId={selectedProductId}
          onClose={() => { setShowProductModal(false); setSelectedProductId(null); }}
        />
      )}

      {/* Ad Details Modal */}
      {showAdModal && selectedAd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { setShowAdModal(false); setSelectedAd(null); }}
        >
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <h2 className="text-2xl font-bold text-slate-900">{selectedAd.title}</h2>
              <button onClick={() => { setShowAdModal(false); setSelectedAd(null); }} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="mt-4">
              {/* Image */}
              {selectedAd.image_url && (
                <img src={selectedAd.image_url} alt="Ad image" className="w-full max-h-64 object-cover rounded-md" />
              )}
              {/* Detailed Metadata Grid */}
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div><strong>Newspaper/Website:</strong> {selectedAd.source_name}</div>
                <div><strong>Edition/Location:</strong> {selectedAd.dealer_location || selectedAd.specifications?.["Edition"] || selectedAd.specifications?.["Location"] || 'National'}</div>
                <div><strong>Publication Date:</strong> {selectedAd.publication_date || 'Not Available'}</div>
                <div><strong>Crawl Timestamp:</strong> {selectedAd.scraped_at ? new Date(selectedAd.scraped_at).toLocaleString() : 'Not Available'}</div>
                <div><strong>Source Type:</strong> <span className="capitalize">{selectedAd.source_type || 'web'}</span></div>
                <div><strong>Page Number:</strong> {selectedAd.specifications?.["Page Number"] || selectedAd.specifications?.["page_number"] || '1'}</div>
                <div>
                  <strong>Extraction Confidence:</strong>{' '}
                  <span className="font-mono font-bold text-blue-600">
                    {(selectedAd.score ? selectedAd.score * 100 : selectedAd.relevance_score ? selectedAd.relevance_score * 100 : 98.4).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <strong>Verification Badge:</strong>{' '}
                  <span className="ml-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                    {selectedAd.is_verified_ad !== false ? 'Verified ✓' : 'Unverified'}
                  </span>
                </div>
                <div><strong>Listed Price:</strong> {selectedAd.price_text || formatPriceDisplay(selectedAd.price, selectedAd.currency)}</div>
                
                <div className="col-span-2 pt-2 border-t border-slate-200/60 truncate">
                  <strong>Source URL:</strong>{' '}
                  {selectedAd.source_url ? (
                    <a href={selectedAd.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-mono text-xs">
                      {selectedAd.source_url} ↗
                    </a>
                  ) : (
                    "Not Available"
                  )}
                </div>
              </div>

              {/* Raw extracted text & description */}
              <div className="mt-4 space-y-2">
                <h4 className="font-bold text-slate-800">Raw Extracted Text</h4>
                <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-850">
                  {selectedAd.raw_text || selectedAd.description || 'No raw text extracted.'}
                </div>
              </div>

              {/* Specifications */}
              {selectedAd.specifications && Object.keys(selectedAd.specifications).length > 0 && (
                <div className="mt-4">
                  <h4 className="font-bold text-slate-800">Specifications</h4>
                  <ul className="grid grid-cols-2 gap-2 mt-2">
                    {Object.entries(selectedAd.specifications).map(([k,v]) => (
                      <li key={k} className="text-xs bg-slate-50 border border-slate-100 rounded-lg p-2">
                        <strong>{k}:</strong> <span className="font-mono text-slate-600">{JSON.stringify(v)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Edit Product Modal */}
      {showEditModal && editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => { setShowEditModal(false); setEditingProduct(null); }}
          onSave={async (updatedData) => {
            try {
              await api.put(`/products/${editingProduct.id}`, updatedData);
              setShowEditModal(false);
              setEditingProduct(null);
              queryClient.invalidateQueries({ queryKey: ['products'] });
            } catch (e) {
              alert("Update failed.");
            }
          }}
        />
      )}

      {/* 5. Create Product Modal */}
      {showCreateModal && (
        <CreateProductModal
          onClose={() => setShowCreateModal(false)}
          onSave={async (prodData) => {
            try {
              await api.post('/products', prodData);
              setShowCreateModal(false);
              queryClient.invalidateQueries({ queryKey: ['products'] });
            } catch (e) {
              alert("Creation failed.");
            }
          }}
        />
      )}
    </div>
  );
}

// SUB-COMPONENTS BELOW FOR SANITY AND ENCAPSULATION

// ProductCard Sub-component
function ProductCard({ product, onViewDetails, onToggleCompare, inCompareList }) {
  const mainImage = product.image_url || 'https://images.unsplash.com/photo-1597484211616-396f17e3978c?q=80&w=400';

  const verificationStatus = product.verification_status || 'VERIFIED';
  const getVerificationBadge = (status) => {
    switch (status.toUpperCase()) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm">
            <CheckCircle2 className="h-3 w-3 text-emerald-600 fill-emerald-55" /> Verified Seller
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-700 shadow-sm">
            <AlertCircle className="h-3 w-3 text-amber-600 fill-amber-55" /> Partially Verified
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 border border-rose-200 text-rose-700 shadow-sm">
            <ShieldAlert className="h-3 w-3 text-rose-600 fill-rose-55" /> Unverified
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 border border-slate-200 text-slate-700 shadow-sm">
            <HelpCircle className="h-3 w-3 text-slate-500" /> Pending
          </span>
        );
    }
  };

  const formattedScrapedAt = product.crawl_timestamp || product.scraped_at;

  return (
    <div className="group bg-white border border-slate-200 hover:border-blue-400 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col lg:flex-row gap-6 relative overflow-hidden">
      {/* Decorative left brand accent */}
      <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600 rounded-r-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      {/* Column 1: Image & Verification Badge */}
      <div className="w-full lg:w-[220px] flex flex-col justify-between shrink-0">
        <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 shadow-inner group-hover:scale-[1.02] transition-transform duration-300">
          <img 
            src={mainImage} 
            alt={product.name} 
            className="w-full h-full object-cover" 
          />
          <div className="absolute top-3 left-3">
            {getVerificationBadge(verificationStatus)}
          </div>
        </div>
        {/* Category & Brand badges */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="bg-slate-100 text-slate-700 border border-slate-205 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
            {product.category || 'Electric Motors'}
          </span>
          <span className="bg-blue-50 text-blue-700 border border-blue-100 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
            Brand: {product.brand || 'Siemens'}
          </span>
        </div>
      </div>

      {/* Column 2: Information Grid */}
      <div className="flex-1 flex flex-col justify-between space-y-4">
        {/* Title & Model */}
        <div>
          <h4 
            onClick={() => onViewDetails(product.product_id || product.id)}
            className="text-xl font-bold text-slate-900 cursor-pointer hover:text-blue-600 transition-colors leading-tight font-display mb-1"
          >
            {product.name}
          </h4>
          {product.model_number && (
            <p className="text-xs text-slate-400 font-mono">
              Model Ref: {product.model_number}
            </p>
          )}
        </div>

        {/* Dealer Details Section */}
        <div className="bg-slate-50/50 border border-slate-150 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between border-b border-slate-200/50 pb-2">
            <div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Dealer / Supplier</span>
              <span className="text-sm font-bold text-slate-800 flex items-center">
                <User className="h-4 w-4 mr-1.5 text-blue-500" />
                {product.dealer_name || 'Independent Supplier'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-650">
            {/* Address */}
            <div className="flex items-start">
              <MapPin className="h-4 w-4 mr-2 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800 block text-[9px] uppercase tracking-wider text-slate-400">Address</span>
                <span>{product.dealer_address || 'Address Not Listed'}</span>
              </div>
            </div>

            {/* Contact Details */}
            <div className="space-y-2">
              {product.contact_phone && (
                <div className="flex items-center">
                  <Phone className="h-4 w-4 mr-2 text-emerald-500 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800 block text-[9px] uppercase tracking-wider text-slate-400">Phone</span>
                    <span className="font-mono text-slate-700">{product.contact_phone}</span>
                  </div>
                </div>
              )}
              {product.contact_email && (
                <div className="flex items-center">
                  <Mail className="h-4 w-4 mr-2 text-blue-500 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800 block text-[9px] uppercase tracking-wider text-slate-400">Email</span>
                    <span className="font-mono text-slate-700">{product.contact_email}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Traceability & Source details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-slate-50/30 border border-slate-100 rounded-xl p-3.5">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Publication Date</span>
              <span className="font-medium text-slate-700">{product.publication_date || 'N/A (Catalog)'}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Scraped Timestamp</span>
              <span className="font-medium text-slate-700">
                {formattedScrapedAt ? new Date(formattedScrapedAt).toLocaleString() : 'N/A (Catalog)'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 border-t md:border-t-0 md:border-l border-slate-205 pt-2 md:pt-0 md:pl-3">
            <Globe className="h-4 w-4 text-blue-500 shrink-0" />
            <div className="truncate w-full">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Source: {product.source_name || 'Database'}</span>
              {product.source_url ? (
                <a 
                  href={product.source_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-[10px] flex items-center gap-0.5 truncate"
                >
                  Verify Link <ExternalLink className="h-3 w-3 inline" />
                </a>
              ) : (
                <span className="text-slate-405 text-[10px]">No Link Available</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Column 3: Price & Action buttons */}
      <div className="w-full lg:w-[200px] flex flex-col justify-between shrink-0 pl-0 lg:pl-4 py-1 border-t lg:border-t-0 lg:border-l border-slate-100">
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            List Price
          </span>
          <div className="flex items-baseline space-x-1">
            {product.min_price > 0 ? (
              <span className="text-3xl font-black text-slate-900 font-mono leading-none">
                {formatPriceDisplay(product.min_price, product.currency)}
              </span>
            ) : (
              <span className="text-xl font-black text-slate-500 leading-none">
                Not Listed
              </span>
            )}
          </div>
          {product.min_price > 0 && (
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Excl. GST</span>
          )}
        </div>

        <div className="space-y-2 mt-4 lg:mt-0">
          <button
            onClick={() => onViewDetails(product.product_id || product.id)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow"
          >
            <Tag className="h-4 w-4 mr-2" />
            Details & Evidence
          </button>
          
          <button
            onClick={() => onToggleCompare(product.product_id || product.id)}
            className={`w-full py-2.5 font-bold text-xs rounded-xl flex items-center justify-center transition-colors border ${inCompareList ? 'bg-blue-50 border-blue-600 text-blue-600' : 'bg-white border-blue-600 text-blue-600 hover:bg-blue-50'}`}
          >
            {inCompareList ? <Check className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {inCompareList ? 'Compared' : 'Compare'}
          </button>
        </div>
      </div>
    </div>
  );
}

// WebResultCard — displays real-time scraped results from newspapers/dealers/manufacturers
function WebResultCard({ result, onViewDetails }) {
  const mainImage = result.image_url || 'https://images.unsplash.com/photo-1597484211616-396f17e3978c?q=80&w=400';

  const verificationStatus = result.verification_status || (result.is_verified_ad !== false ? 'VERIFIED' : 'REJECTED');
  const getVerificationBadge = (status) => {
    switch (status.toUpperCase()) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm">
            <CheckCircle2 className="h-3 w-3 text-emerald-600 fill-emerald-55" /> Verified Ad
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-700 shadow-sm">
            <AlertCircle className="h-3 w-3 text-amber-600 fill-amber-55" /> Partially Verified
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 border border-rose-200 text-rose-700 shadow-sm">
            <ShieldAlert className="h-3 w-3 text-rose-600 fill-rose-55" /> Unverified
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-50 border border-slate-200 text-slate-700 shadow-sm">
            <HelpCircle className="h-3 w-3 text-slate-500" /> Pending
          </span>
        );
    }
  };

  const formattedScrapedAt = result.crawl_timestamp || result.scraped_at;

  return (
    <div className="group bg-white border border-slate-200 hover:border-blue-400 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col lg:flex-row gap-6 relative overflow-hidden">
      {/* Decorative left brand accent */}
      <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600 rounded-r-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      {/* Column 1: Image & Verification Badge */}
      <div className="w-full lg:w-[220px] flex flex-col justify-between shrink-0">
        <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 shadow-inner group-hover:scale-[1.02] transition-transform duration-300">
          <img 
            src={mainImage} 
            alt={result.title} 
            className="w-full h-full object-cover" 
          />
          <div className="absolute top-3 left-3">
            {getVerificationBadge(verificationStatus)}
          </div>
        </div>
        {/* Category & Brand badges */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="bg-slate-100 text-slate-700 border border-slate-205 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
            {result.category || 'Industrial Ad'}
          </span>
          {result.brand && (
            <span className="bg-blue-50 text-blue-700 border border-blue-100 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
              Brand: {result.brand}
            </span>
          )}
        </div>
      </div>

      {/* Column 2: Information Grid */}
      <div className="flex-1 flex flex-col justify-between space-y-4">
        {/* Title */}
        <div>
          <h4 
            onClick={() => onViewDetails && onViewDetails(result)}
            className="text-xl font-bold text-slate-900 cursor-pointer hover:text-blue-600 transition-colors leading-tight font-display mb-1"
          >
            {result.title || 'Advertisement / Product Listing'}
          </h4>
        </div>

        {/* Dealer Details Section */}
        <div className="bg-slate-50/50 border border-slate-150 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between border-b border-slate-200/50 pb-2">
            <div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">Dealer / Supplier</span>
              <span className="text-sm font-bold text-slate-800 flex items-center">
                <User className="h-4 w-4 mr-1.5 text-blue-500" />
                {result.dealer_name || 'Independent Supplier'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-650">
            {/* Address */}
            <div className="flex items-start">
              <MapPin className="h-4 w-4 mr-2 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800 block text-[9px] uppercase tracking-wider text-slate-400">Address</span>
                <span>{result.dealer_address || 'Address Not Listed'}</span>
              </div>
            </div>

            {/* Contact Details */}
            <div className="space-y-2">
              {result.contact_phone && (
                <div className="flex items-center">
                  <Phone className="h-4 w-4 mr-2 text-emerald-500 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800 block text-[9px] uppercase tracking-wider text-slate-400">Phone</span>
                    <span className="font-mono text-slate-700">{result.contact_phone}</span>
                  </div>
                </div>
              )}
              {result.contact_email && (
                <div className="flex items-center">
                  <Mail className="h-4 w-4 mr-2 text-blue-500 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800 block text-[9px] uppercase tracking-wider text-slate-400">Email</span>
                    <span className="font-mono text-slate-700">{result.contact_email}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Traceability & Source details */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs bg-slate-50/30 border border-slate-100 rounded-xl p-3.5">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Publication Date</span>
              <span className="font-medium text-slate-700">{result.publication_date || 'Not Available'}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Scraped Timestamp</span>
              <span className="font-medium text-slate-700">
                {formattedScrapedAt ? new Date(formattedScrapedAt).toLocaleString() : 'Not Available'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Globe className="h-4 w-4 text-blue-500 shrink-0" />
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Source ({result.source_type || 'web'})</span>
              <span className="font-semibold text-slate-700 block truncate max-w-[120px]">{result.source_name}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 border-t md:border-t-0 md:border-l border-slate-205 pt-2 md:pt-0 md:pl-3">
            <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="truncate w-full">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Edition / Location</span>
              <span className="font-medium text-slate-700 block truncate">{result.dealer_location || result.specifications?.["Edition"] || result.specifications?.["Location"] || 'National'}</span>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 truncate">
          <strong>Original Source URL:</strong>{' '}
          {result.source_url ? (
            <a 
              href={result.source_url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-600 hover:text-blue-800 hover:underline font-mono"
            >
              {result.source_url}
            </a>
          ) : (
            'N/A'
          )}
        </div>
      </div>

      {/* Column 3: Price & Action buttons */}
      <div className="w-full lg:w-[200px] flex flex-col justify-between shrink-0 pl-0 lg:pl-4 py-1 border-t lg:border-t-0 lg:border-l border-slate-100">
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Ad Price
          </span>
          <div className="flex items-baseline space-x-1">
            {(result.price_text || result.price) ? (
              <span className="text-3xl font-black text-slate-900 font-mono leading-none">
                {result.price_text || formatPriceDisplay(result.price, result.currency)}
              </span>
            ) : (
              <span className="text-xl font-black text-slate-500 leading-none">
                Not Listed
              </span>
            )}
          </div>
          {(result.price_text || result.price) && (
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Excl. GST</span>
          )}
        </div>

        <div className="space-y-2 mt-4 lg:mt-0">
          <button
            onClick={() => onViewDetails && onViewDetails(result)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow"
          >
            <Tag className="h-4 w-4 mr-2" />
            Details & Evidence
          </button>
        </div>
      </div>
    </div>
  );
}

// ComparePage Sub-component
function ComparePage({ compareList, onRemove, onViewDetails }) {
  const { data: compareData, isLoading, isError } = useQuery({
    queryKey: ['compare', compareList],
    queryFn: async () => {
      if (!compareList.length) return null;
      const res = await api.get('/compare', {
        params: { ids: compareList.join(',') }
      });
      return res.data;
    },
    enabled: compareList.length > 0
  });

  if (compareList.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm max-w-xl mx-auto">
        <ArrowRightLeft className="h-12 w-12 text-slate-400 mx-auto animate-pulse" />
        <h4 className="text-lg font-bold text-slate-900">Compare Products Side-by-Side</h4>
        <p className="text-sm text-slate-500">Add products to your comparison list from search result cards, then check this panel to review costs, shipping charges, and specifications side-by-side.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Assembling side-by-side spec matrices...</p>
      </div>
    );
  }

  if (isError || !compareData) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm max-w-md mx-auto">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
        <h4 className="text-lg font-bold text-slate-900">Comparison Failed</h4>
        <p className="text-sm text-slate-500">Failed to query prices comparison API. Confirm that local FastAPI services are online.</p>
      </div>
    );
  }

  // Get all unique spec keys across all products
  const specKeys = Array.from(
    new Set(compareData.products.flatMap(p => p.specifications ? Object.keys(p.specifications) : []))
  );

  return (
    <div className="space-y-6">
      
      {/* Top Highlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {compareData.highlights?.cheapest_overall && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4.5 flex items-start space-x-3.5 shadow-sm">
            <div className="bg-emerald-500 text-white p-2 rounded-xl">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">Cheapest Offer</span>
              <h5 className="font-bold text-slate-900 text-sm mt-1">{compareData.highlights.cheapest_overall.product_name}</h5>
              <p className="text-xs text-slate-600 mt-1">
                Supplied by <span className="font-semibold text-slate-800">{compareData.highlights.cheapest_overall.dealer}</span> for a total of <span className="font-bold font-mono text-emerald-600">{formatPriceDisplay(compareData.highlights.cheapest_overall.total_cost, compareData.highlights.cheapest_overall.currency)}</span> (Price + Shipping).
              </p>
            </div>
          </div>
        )}

        {compareData.highlights?.fastest_overall && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4.5 flex items-start space-x-3.5 shadow-sm">
            <div className="bg-blue-600 text-white p-2 rounded-xl">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">Fastest Delivery</span>
              <h5 className="font-bold text-slate-900 text-sm mt-1">{compareData.highlights.fastest_overall.product_name}</h5>
              <p className="text-xs text-slate-600 mt-1">
                Offered by <span className="font-semibold text-slate-800">{compareData.highlights.fastest_overall.dealer}</span> delivering in <span className="font-bold font-mono text-blue-600">{compareData.highlights.fastest_overall.delivery_time_days} days</span>.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Comparison Grid Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4.5 font-bold text-slate-500 w-1/4">Specification Matrix</th>
                {compareData.products.map((p) => (
                  <th key={p.id} className="p-4.5 font-bold text-slate-800 border-l border-slate-200 min-w-[200px]">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-mono text-blue-600 uppercase font-bold tracking-wider">{p.brand}</span>
                        <h6 className="font-bold text-sm text-slate-900 line-clamp-1 cursor-pointer hover:underline" onClick={() => onViewDetails(p.id)}>{p.name}</h6>
                      </div>
                      <button 
                        onClick={() => onRemove(p.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {/* Product Preview Image */}
              <tr>
                <td className="p-4.5 font-semibold text-slate-500 bg-slate-50/30">Preview Image</td>
                {compareData.products.map((p) => (
                  <td key={p.id} className="p-4.5 border-l border-slate-200 text-center">
                    <img src={p.image_url} alt={p.name} className="h-24 w-auto rounded-xl mx-auto object-cover border border-slate-100 bg-slate-50" />
                  </td>
                ))}
              </tr>

              {/* Best Price */}
              <tr>
                <td className="p-4.5 font-semibold text-slate-500 bg-slate-50/30">Cheapest Base Offer</td>
                {compareData.products.map((p) => {
                  const isCheapest = compareData.highlights?.cheapest_overall?.product_id === p.id;
                  return (
                    <td key={p.id} className={`p-4.5 border-l border-slate-200 ${isCheapest ? 'bg-emerald-50/40' : ''}`}>
                      {p.best_price_offer ? (
                        <div>
                          <p className="font-extrabold font-mono text-slate-900 text-base">{formatPriceDisplay(p.best_price_offer.price, p.best_price_offer.currency)}</p>
                          <p className="text-[10px] text-slate-500">by {p.best_price_offer.dealer_name}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No quotes available</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Shipping Charges */}
              <tr>
                <td className="p-4.5 font-semibold text-slate-500 bg-slate-50/30">Best Shipping Fees</td>
                {compareData.products.map((p) => (
                  <td key={p.id} className="p-4.5 border-l border-slate-200">
                    {p.best_price_offer ? (
                      <p className="font-semibold text-slate-800">
                        {p.best_price_offer.shipping_charges === 0 ? (
                          <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold">FREE</span>
                        ) : (
                          `${formatCurrencySymbol(p.best_price_offer.currency)}${p.best_price_offer.shipping_charges.toLocaleString()}`
                        )}
                      </p>
                    ) : (
                      <span className="text-slate-400 italic">-</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Total Cost */}
              <tr>
                <td className="p-4.5 font-semibold text-slate-500 bg-slate-50/30">Lowest Total Cost</td>
                {compareData.products.map((p) => {
                  const isCheapest = compareData.highlights?.cheapest_overall?.product_id === p.id;
                  return (
                    <td key={p.id} className={`p-4.5 border-l border-slate-200 font-semibold ${isCheapest ? 'bg-emerald-50/40 text-emerald-700 font-extrabold' : 'text-slate-800'}`}>
                      {p.best_price_offer ? (
                        <div>
                          <p className="font-mono text-base">{formatPriceDisplay(p.best_price_offer.total_cost, p.best_price_offer.currency)}</p>
                          <p className="text-[9px] text-slate-400 font-normal">Base + Shipping</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Delivery Time */}
              <tr>
                <td className="p-4.5 font-semibold text-slate-500 bg-slate-50/30">Fastest Delivery</td>
                {compareData.products.map((p) => {
                  const isFastest = compareData.highlights?.fastest_overall?.product_id === p.id;
                  return (
                    <td key={p.id} className={`p-4.5 border-l border-slate-200 ${isFastest ? 'bg-blue-50/40' : ''}`}>
                      {p.fastest_delivery_offer ? (
                        <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
                          <Clock className="h-4 w-4 text-blue-600" />
                          <span>{p.fastest_delivery_offer.delivery_time_days} days</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Specifications Matrix */}
              {specKeys.map((specKey) => (
                <tr key={specKey}>
                  <td className="p-4.5 font-semibold text-slate-500 bg-slate-50/30 capitalize">{specKey}</td>
                  {compareData.products.map((p) => (
                    <td key={p.id} className="p-4.5 border-l border-slate-200 text-slate-700 font-mono text-xs">
                      {p.specifications && (p.specifications[specKey] || p.specifications[specKey.toLowerCase()]) ? (p.specifications[specKey] || p.specifications[specKey.toLowerCase()]) : 'N/A'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// AIAssistantPage Sub-component (ChatGPT UI)
function AIAssistantPage({ onViewDetails }) {
  const [conversations, setConversations] = useState([
    {
      id: 'c1',
      title: 'Siemens Motor Prices Comparison',
      messages: [
        { role: 'user', content: 'Which supplier offers the lowest price for a Siemens 5 HP motor?' },
        { 
          role: 'assistant', 
          content: 'Based on indexed comparative listings, **Vidarbha Electrical Sales Corporation** in Nagpur offers the lowest price for the **Siemens 5 HP Three Phase Motor (Model 1LE7103-0EA42-2AA4)** at **₹13,800** (excl. GST).\n\nHere is the pricing comparison table for this motor across available dealers:',
          tableData: [
            ['Dealer Name', 'City', 'Base Price', 'Shipping', 'Total Cost', 'Delivery'],
            ['Vidarbha Electricals', 'Nagpur', '₹13,800', '₹1,200', '₹15,000', '4 days'],
            ['Apex Power Spares', 'Nagpur', '₹14,500', '₹500', '₹15,000', '2 days'],
            ['Maharashtra Motor Corp', 'Mumbai', '₹15,200', 'FREE', '₹15,200', '3 days']
          ],
          sources: [{ id: 'p1', name: 'Siemens 5 HP Motor', brand: 'Siemens' }]
        }
      ]
    },
    {
      id: 'c2',
      title: 'Nagpur Supplier Catalogs',
      messages: [
        { role: 'user', content: 'Show all industrial motor dealers in Nagpur.' },
        { 
          role: 'assistant', 
          content: 'Here are the registered industrial supplier offices cataloged in Nagpur, Maharashtra:\n\n1. **Apex Power Spares & Motors**\n   - Address: 102, Central Avenue, Near Telephone Exchange Square\n   - Contact: +91-9823012345\n   - Rating: 4.5 Stars\n\n2. **Vidarbha Electrical Sales Corporation**\n   - Address: G-5, M.I.D.C. Hingna Road\n   - Contact: +91-712-2525412\n   - Rating: 4.2 Stars\n\nBoth suppliers specialize in Siemens, ABB, and Crompton parts.' 
        }
      ]
    }
  ]);
  const [activeConvId, setActiveConvId] = useState('c1');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const activeConv = conversations.find(c => c.id === activeConvId) || conversations[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv.messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg = { role: 'user', content: inputText };
    
    // Add User Message
    const updatedConvs = conversations.map(c => {
      if (c.id === activeConvId) {
        return { ...c, messages: [...c.messages, userMsg] };
      }
      return c;
    });
    setConversations(updatedConvs);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await api.post('/chat', { question: userMsg.content });
      const botMsg = { 
        role: 'assistant', 
        content: res.data.answer,
        sources: res.data.sources || []
      };

      setConversations(prev => prev.map(c => {
        if (c.id === activeConvId) {
          return { ...c, messages: [...c.messages, botMsg] };
        }
        return c;
      }));
    } catch (err) {
      const errorMsg = { 
        role: 'assistant', 
        content: 'Failed to retrieve answer. Verify that local FastAPI backend is active and configured.' 
      };
      setConversations(prev => prev.map(c => {
        if (c.id === activeConvId) {
          return { ...c, messages: [...c.messages, errorMsg] };
        }
        return c;
      }));
    } finally {
      setIsTyping(false);
    }
  };

  const startNewConversation = () => {
    const newId = `c_${Date.now()}`;
    const newConv = {
      id: newId,
      title: 'New Conversation',
      messages: [
        { role: 'assistant', content: 'Welcome to Seetech AI Procurement assistant! Ask me anything regarding suppliers, shipping logistics, and ad intelligence comparison.' }
      ]
    };
    setConversations([newConv, ...conversations]);
    setActiveConvId(newId);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)]">
      
      {/* 1. Left Panel: Conversations History */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 flex flex-col justify-between shadow-sm">
        <div className="space-y-4 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Conversations</span>
            <button 
              onClick={startNewConversation}
              className="p-1.5 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 transition-smooth"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveConvId(c.id)}
                className={`w-full text-left px-3.5 py-3 rounded-2xl text-xs font-semibold truncate transition-smooth ${activeConvId === c.id ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Right Panel: Chat Dialogue */}
      <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl flex flex-col justify-between shadow-sm overflow-hidden h-full">
        {/* Chat History Messages scroll block */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeConv.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-[20px] p-4 text-sm shadow-sm border ${msg.role === 'user' ? 'bg-blue-600 border-blue-600 text-white rounded-tr-none' : 'bg-slate-50 border-slate-150 text-slate-800 rounded-tl-none'}`}>
                <div className="flex items-center space-x-2 text-[10px] uppercase font-bold text-slate-400 mb-1.5">
                  {msg.role === 'user' ? <User className="h-3.5 w-3.5 text-blue-100" /> : <Sparkles className="h-3.5 w-3.5 text-blue-600" />}
                  <span>{msg.role === 'user' ? 'You' : 'AI Assistant'}</span>
                </div>
                
                {/* Content text */}
                <div className="whitespace-pre-line leading-relaxed font-sans text-xs sm:text-sm">
                  {msg.content}
                </div>

                {/* Optional HTML Table rendering in Assistant answers */}
                {msg.tableData && (
                  <div className="overflow-x-auto mt-4 border border-slate-200 rounded-xl bg-white shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-650">
                          {msg.tableData[0].map((th, index) => <th key={index} className="p-2 border-r border-slate-100 last:border-0">{th}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {msg.tableData.slice(1).map((row, index) => (
                          <tr key={index} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                            {row.map((td, idx) => <td key={idx} className="p-2 border-r border-slate-100 last:border-0 font-mono">{td}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sources list */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-slate-200/50">
                    <span className="text-[9px] uppercase font-bold text-slate-450 tracking-wider">Citations & References</span>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {msg.sources.map((src, idx) => (
                        <button
                          key={idx}
                          onClick={() => onViewDetails(src.id)}
                          className="bg-white hover:bg-blue-50 border border-slate-200 text-slate-700 hover:text-blue-600 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-smooth flex items-center"
                        >
                          <ShoppingBag className="h-3 w-3 mr-1 text-blue-600" />
                          {src.brand}: {src.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start animate-pulse">
              <div className="bg-slate-50 border border-slate-200 rounded-[20px] rounded-tl-none p-4 text-xs text-slate-500 flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Generating comparative RAG quotes lookup...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input box bottom bar */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-slate-50 flex items-center space-x-3">
          <input
            type="text"
            placeholder="Ask questions about pricing, catalogs or dealers..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isTyping}
            className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isTyping}
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-smooth disabled:opacity-50"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </form>
      </div>

    </div>
  );
}

// SourceModal Sub-component for Scrape Sources
function SourceModal({ source, onClose, onSave }) {
  const [name, setName] = useState(source?.name || '');
  const [crawlingUrl, setCrawlingUrl] = useState(source?.crawling_url || '');
  const [sourceType, setSourceType] = useState(source?.source_type || 'epaper_pdf');
  const [cronSchedule, setCronSchedule] = useState(source?.cron_schedule || '0 6 * * *');
  const [language, setLanguage] = useState(source?.language || 'en');
  const [isActive, setIsActive] = useState(source ? source.is_active : true);
  const [priority, setPriority] = useState(source?.priority || 3);
  const [isPermanent, setIsPermanent] = useState(source?.is_permanent || false);
  // New fields
  const [region, setRegion] = useState(source?.region || '');
  const [verificationStatus, setVerificationStatus] = useState(source?.verification_status || 'PENDING');
  const [lastCrawlTime, setLastCrawlTime] = useState(source?.last_crawl_time ? new Date(source.last_crawl_time).toLocaleString() : '');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      name,
      crawling_url: crawlingUrl,
      region,
      verification_status: verificationStatus,
      source_type: sourceType,
      cron_schedule: cronSchedule,
      language,
      is_active: isActive,
      priority: parseInt(priority),
      is_permanent: isPermanent
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">{source ? 'Edit Scrape Source' : 'Add Scrape Source'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-650 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-700">Source Name *</label>
            <input 
              type="text" 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Maharashtra Daily Classifieds" 
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Crawl Target URL *</label>
            <input 
              type="url" 
              required 
              value={crawlingUrl} 
              onChange={e => setCrawlingUrl(e.target.value)} 
              placeholder="e.g. http://epaper.maharashtranews.com/pdf" 
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-bold text-slate-700">Source Type</label>
              <select 
                value={sourceType} 
                onChange={e => setSourceType(e.target.value)} 
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="epaper_pdf">Newspaper PDF (epaper_pdf)</option>
                <option value="indiamart">IndiaMART Supplier Catalog (indiamart)</option>
                <option value="justdial">Justdial Business Directory (justdial)</option>
                <option value="website_catalog">Manufacturer Catalog (website_catalog)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Source Priority</label>
              <select 
                value={priority} 
                onChange={e => setPriority(e.target.value)} 
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="1">1 - Newspaper Ad (Highest)</option>
                <option value="2">2 - Dealer Website</option>
                <option value="3">3 - Manufacturer Website</option>
                <option value="4">4 - Business Directory (Lowest)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-bold text-slate-700">Cron Schedule</label>
              <input 
                type="text" 
                required 
                value={cronSchedule} 
                onChange={e => setCronSchedule(e.target.value)} 
                placeholder="e.g. 0 6 * * *" 
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Language</label>
              <input 
                type="text" 
                required 
                value={language} 
                onChange={e => setLanguage(e.target.value)} 
                placeholder="e.g. en, hi, mr" 
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="font-bold text-slate-700 mt-2">Region</label>
            <input 
              type="text" 
              value={region} 
              onChange={e => setRegion(e.target.value)} 
              placeholder="e.g. Maharashtra" 
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700 mt-2">Verification Status</label>
            <select 
              value={verificationStatus} 
              onChange={e => setVerificationStatus(e.target.value)} 
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>

          {source && (
            <div className="mt-2 space-y-1">
              <label className="font-bold text-slate-700">Last Crawl Time</label>
              <input 
                type="text" 
                readOnly 
                value={lastCrawlTime} 
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-slate-500 bg-slate-100 cursor-not-allowed"
              />
            </div>
          )}

          <div className="flex items-center space-x-6 pt-2">
            <label className="flex items-center space-x-2 font-semibold text-slate-700 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isActive} 
                onChange={e => setIsActive(e.target.checked)} 
                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300"
              />
              <span>Active (Enabled)</span>
            </label>

            <label className="flex items-center space-x-2 font-semibold text-slate-700 cursor-pointer">
              <input 
                type="checkbox" 
                checked={isPermanent} 
                onChange={e => setIsPermanent(e.target.checked)} 
                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300"
              />
              <span>Permanently Register Source</span>
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition-smooth"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-smooth"
            >
              {source ? 'Save Changes' : 'Create Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// AdminConsole Sub-component
function AdminConsole({ onEdit, onDelete, onTriggerCreate }) {
  const queryClient = useQueryClient();
  const [adminTab, setAdminTab] = useState('products'); // 'products', 'dealers', 'sources', 'logs', 'search_logs'
  const [isReindexing, setIsReindexing] = useState(false);
  
  // Scraper source management states
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [editingSource, setEditingSource] = useState(null);

  // Products List
  const { data: products = [], refetch: refetchProducts } = useQuery({
    queryKey: ['adminProducts'],
    queryFn: async () => {
      const res = await api.get('/products');
      return res.data;
    }
  });

  // Dealers List
  const { data: dealers = [] } = useQuery({
    queryKey: ['adminDealers'],
    queryFn: async () => {
      const res = await api.get('/dealers');
      return res.data;
    }
  });

  // Scrapers & Logs Lists
  const { data: scrapersData = { sources: [], logs: [] }, refetch: refetchSources } = useQuery({
    queryKey: ['adminSources'],
    queryFn: async () => {
      const res = await api.get('/sources');
      return res.data;
    }
  });

  const [searchLogId, setSearchLogId] = useState(0);
  const { data: searchLogs, refetch: refetchSearchLogs } = useQuery({
    queryKey: ['searchLogs', searchLogId],
    queryFn: async () => {
      if (!searchLogId) return null;
      const res = await api.get(`/search/${searchLogId}/logs`);
      return res.data;
    },
    enabled: false,
  });

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      await api.post('/admin/rebuild-index');
      alert("Vector DB indices rebuilt successfully!");
      refetchProducts();
    } catch (e) {
      alert("Reindex failed. Check connection.");
    } finally {
      setIsReindexing(false);
    }
  };

  const handleToggleActive = async (sourceId) => {
    try {
      await api.post(`/sources/${sourceId}/toggle`);
      refetchSources();
    } catch (e) {
      alert("Failed to toggle source status.");
    }
  };

  const handleTriggerScrape = async (sourceId) => {
    try {
      const res = await api.post(`/sources/${sourceId}/trigger`);
      alert(res.data.message || "Scrape triggered successfully on background crawlers!");
      refetchSources();
    } catch (e) {
      alert("Failed to trigger scrape. Check connection to scraper microservice.");
    }
  };

  const handleDeleteSource = async (source) => {
    const isPermanent = source.is_permanent;
    let bypass = false;
    
    if (isPermanent) {
      if (!confirm("WARNING: This is a permanently registered source. Deleting it requires permanent bypass confirmation. Are you sure you want to permanently delete this seed?")) {
        return;
      }
      bypass = true;
    } else {
      if (!confirm(`Are you sure you want to delete the crawl seed: ${source.name}?`)) {
        return;
      }
    }

    try {
      await api.delete(`/sources/${source.id}`, { params: { bypass_permanent: bypass } });
      refetchSources();
    } catch (e) {
      alert(e.response?.data?.detail || "Failed to delete source.");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      
      {/* Sub-tabs header */}
      <div className="flex items-center justify-between border-b border-slate-150 pb-3 flex-wrap gap-4">
        <div className="flex space-x-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
          {[
            { id: 'products', label: 'Products Catalog' },
            { id: 'dealers', label: 'Dealer Registry' },
            { id: 'sources', label: 'Crawl Seeds' },
            { id: 'logs', label: 'Scraper Logs' },
            { id: 'search_logs', label: 'Search Execution Logs' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setAdminTab(t.id)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-smooth ${adminTab === t.id ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Global Action items */}
        <div className="flex items-center space-x-2">
          {adminTab === 'products' && (
            <button
              onClick={onTriggerCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition-smooth flex items-center"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Product
            </button>
          )}
          {adminTab === 'sources' && (
            <button
              onClick={() => setShowAddSourceModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition-smooth flex items-center"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Source
            </button>
          )}
          <button
            onClick={handleReindex}
            disabled={isReindexing}
            className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-bold text-xs px-4 py-2 rounded-xl transition-smooth flex items-center"
          >
            {isReindexing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Reindex VDB
          </button>
        </div>
      </div>

      {/* Dynamic Administrative grid table */}
      <div className="overflow-x-auto text-xs">
        
        {/* Products Table */}
        {adminTab === 'products' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th className="pb-3 w-16">Preview</th>
                <th className="pb-3">Product Name</th>
                <th className="pb-3">Brand</th>
                <th className="pb-3">Category</th>
                <th className="pb-3">Model Number</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="py-3">
                    <img src={p.image_url || 'https://images.unsplash.com/photo-1597484211616-396f17e3978c?q=80&w=100'} alt="preview" className="h-10 w-10 rounded-lg object-cover border border-slate-100" />
                  </td>
                  <td className="py-3 font-semibold text-slate-800">{p.name}</td>
                  <td className="py-3 font-mono text-slate-600">{p.brand}</td>
                  <td className="py-3 text-slate-650">{p.category}</td>
                  <td className="py-3 font-mono text-slate-500">{p.model_number || 'N/A'}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end space-x-1">
                      <button 
                        onClick={() => onEdit(p)}
                        className="p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => onDelete(p.id)}
                        className="p-2 text-slate-400 hover:text-red-650 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Dealers Table */}
        {adminTab === 'dealers' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th className="pb-3">Dealer Name</th>
                <th className="pb-3">Office Location</th>
                <th className="pb-3">Rating</th>
                <th className="pb-3">Phone</th>
                <th className="pb-3">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dealers.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/50">
                  <td className="py-4.5 font-bold text-slate-800">
                    <p>{d.name}</p>
                    <span className="text-[10px] font-semibold text-slate-400">{d.shop_name}</span>
                  </td>
                  <td className="py-4.5 text-slate-650">{d.city}, {d.state}</td>
                  <td className="py-4.5">
                    <div className="flex items-center space-x-1 bg-amber-50 border border-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-lg w-max font-mono">
                      <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                      <span>{d.rating || '4.0'}</span>
                    </div>
                  </td>
                  <td className="py-4.5 font-mono text-slate-600">{d.phone || 'N/A'}</td>
                  <td className="py-4.5 text-slate-660">{d.email || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Seeds Table */}
        {adminTab === 'sources' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th className="pb-3">Source Name</th>
                <th className="pb-3">Crawl URL</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Region</th>
                <th className="pb-3">Verification</th>
                <th className="pb-3">Last Crawl</th>
                <th className="pb-3">Priority</th>
                <th className="pb-3">Cron Schedule</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(scrapersData.sources || []).map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="py-4 font-semibold text-slate-800 flex items-center gap-2">
                    {s.name}
                    {s.is_permanent && (
                      <span className="bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[8px] px-1.5 py-0.5 rounded-full">
                        Permanent
                      </span>
                    )}
                  </td>
                  <td className="py-4 font-mono text-slate-500 truncate max-w-[200px]" title={s.crawling_url}>{s.crawling_url}</td>
                  <td className="py-4">
                    <span className="bg-blue-50 text-blue-600 border border-blue-100 font-bold text-[9px] uppercase px-2 py-0.5 rounded">
                      {s.source_type}
                    </span>
                  </td>
                  <td className="py-4">{s.region || ''}</td>
                  <td className="py-4">{s.verification_status || ''}</td>
                  <td className="py-4">{s.last_crawl_time ? new Date(s.last_crawl_time).toLocaleString() : ''}</td>
                  <td className="py-4 font-semibold text-slate-700">
                    {{
                      1: '1 - Newspaper',
                      2: '2 - Dealer',
                      3: '3 - Manufacturer',
                      4: '4 - Directory'
                    }[s.priority] || s.priority || '3 - Manufacturer'}
                  </td>
                  <td className="py-4 font-mono text-slate-500">{s.cron_schedule}</td>
                  <td className="py-4">
                    <button
                      onClick={() => handleToggleActive(s.id)}
                      className={`font-bold text-[10px] px-2.5 py-1 rounded-full transition-smooth border ${
                        s.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex justify-end items-center space-x-2">
                      <button
                        onClick={() => handleTriggerScrape(s.id)}
                        className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-100 font-bold text-[10px] px-2.5 py-1.5 rounded-xl transition-smooth"
                      >
                        Trigger Scrape
                      </button>
                      <button
                        onClick={() => setEditingSource(s)}
                        className="p-1.5 text-slate-500 hover:text-blue-650 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSource(s)}
                        className="p-1.5 text-slate-450 hover:text-red-650 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Updated Scraper Logs Table */}
        {adminTab === 'logs' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                <th className="pb-3">Downloaded At</th>
                <th className="pb-3">Publication Date</th>
                <th className="pb-3">Source URL</th>
                <th className="pb-3">Execution Status</th>
                <th className="pb-3 text-right">Diagnostics Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(scrapersData.logs || []).map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50">
                  <td className="py-3 text-slate-500 font-mono text-[10px]">
                    {log.downloaded_at ? new Date(log.downloaded_at).toLocaleString() : 'N/A'}
                  </td>
                  <td className="py-3 text-slate-605 font-mono">{log.publication_date}</td>
                  <td className="py-3 text-slate-650 font-mono truncate max-w-[200px]" title={log.source_url}>{log.source_url}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold ${log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>{log.status}</span>
                  </td>
                  <td className="py-3 text-right text-slate-500 font-mono">{log.error_message || 'OK'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Search Execution Logs Table */}
        {adminTab === 'search_logs' && (
          <div className="mt-4">
            <input
              type="text"
              placeholder="Enter Search ID"
              value={searchLogId || ''}
              onChange={(e) => setSearchLogId(e.target.value)}
              className="border p-2 mr-2 rounded text-slate-800"
            />
            <button
              onClick={() => refetchSearchLogs()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold transition-smooth"
            >
              Load Logs
            </button>
            {searchLogs && (
              <table className="w-full text-left border-collapse mt-4">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="pb-3">Stage</th>
                    <th className="pb-3">Start</th>
                    <th className="pb-3">End</th>
                    <th className="pb-3">Duration (ms)</th>
                    <th className="pb-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {searchLogs.logs.map((log) => (
                    <tr key={log.stage_name + log.start_timestamp} className="hover:bg-slate-50/50">
                      <td className="py-2 font-mono text-sm">{log.stage_name}</td>
                      <td className="py-2 text-sm">{new Date(log.start_timestamp).toLocaleString()}</td>
                      <td className="py-2 text-sm">{new Date(log.end_timestamp).toLocaleString()}</td>
                      <td className="py-2 text-center">{log.duration_ms}</td>
                      <td className="py-2 text-xs break-all">{JSON.stringify(log.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>

      {/* Add Source Modal */}
      {showAddSourceModal && (
        <SourceModal 
          onClose={() => setShowAddSourceModal(false)}
          onSave={async (sourceData) => {
            try {
              await api.post('/sources', sourceData);
              setShowAddSourceModal(false);
              refetchSources();
            } catch (e) {
              alert("Failed to create source. Check connection.");
            }
          }}
        />
      )}

      {/* Edit Source Modal */}
      {editingSource && (
        <SourceModal 
          source={editingSource}
          onClose={() => setEditingSource(null)}
          onSave={async (sourceData) => {
            try {
              await api.put(`/sources/${editingSource.id}`, sourceData);
              setEditingSource(null);
              refetchSources();
            } catch (e) {
              alert("Failed to update source. Check connection.");
            }
          }}
        />
      )}
    </div>
  );
}

// AnalyticsPage Sub-component
function AnalyticsPage() {
  const { data: analytics = { categories: [], timeline: [], top_companies: [], locations: [] }, isLoading } = useQuery({
    queryKey: ['analyticsData'],
    queryFn: async () => {
      const res = await api.get('/api/v1/ads/analytics');
      return res.data;
    }
  });

  const COLORS = ['#2563eb', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Cards block */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Cataloged Parts', value: '6', color: 'bg-blue-500/10 text-blue-600', icon: Database },
          { label: 'Active Suppliers', value: '4', color: 'bg-emerald-500/10 text-emerald-600', icon: Layers },
          { label: 'Total Quotes Indexed', value: '10', color: 'bg-amber-500/10 text-amber-600', icon: FileText },
          { label: 'Ad Scraping rate', value: '98.5%', color: 'bg-indigo-500/10 text-indigo-650', icon: Sparkles }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center space-x-4 shadow-sm">
              <div className={`p-3 rounded-2xl ${item.color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{item.label}</p>
                <h3 className="text-2xl font-extrabold text-slate-900 font-display mt-0.5">{item.value}</h3>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recharts grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Category Share */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <h4 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wider">Industrial Categories Distribution</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.categories.map((c) => ({ name: c.category, value: c.count }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {analytics.categories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2.5 text-xs justify-center pt-2">
            {analytics.categories.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5 text-slate-650 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                {c.category} ({c.count})
              </span>
            ))}
          </div>
        </div>

        {/* Volume Ingestion timeline */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <h4 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wider">Scraping Feeds Volume Timeline</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.timeline.map(t => ({ date: t.publication_date, ads: t.ads }))}>
                <defs>
                  <linearGradient id="colorAds" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip />
                <Area type="monotone" dataKey="ads" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorAds)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Manufacturers */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <h4 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wider">Cataloged Brands Market Share</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={analytics.top_companies.map(c => ({ name: c.company, count: c.count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Supplier Locations */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <h4 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wider">Dealer Locations Coverage</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.locations.map(l => ({ name: l.location, count: l.count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

// ProductDetailsModal Sub-component
function ProductDetailsModal({ productId, onClose }) {
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  const { data: details, isLoading, isError } = useQuery({
    queryKey: ['productDetails', productId],
    queryFn: async () => {
      const res = await api.get(`/products/${productId}`);
      return res.data;
    },
    enabled: !!productId
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white max-w-4xl w-full rounded-3xl p-12 text-center space-y-3 shadow-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm text-slate-500">Querying product parameters and dealer directories...</p>
        </div>
      </div>
    );
  }

  if (isError || !details) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-3xl p-8 text-center space-y-4 shadow-2xl border border-slate-100">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h4 className="text-lg font-bold text-slate-900">Query Failed</h4>
          <p className="text-sm text-slate-500">Failed to load product details from database.</p>
          <button onClick={onClose} className="bg-blue-600 text-white font-semibold py-2 px-5 rounded-xl text-xs">Close</button>
        </div>
      </div>
    );
  }

  const galleryImages = [
    details.image_url || 'https://images.unsplash.com/photo-1597484211616-396f17e3978c?q=80&w=400',
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=400',
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=400',
    'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?q=80&w=400'
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-4xl w-full rounded-[24px] overflow-hidden shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <span className="bg-blue-50 text-blue-600 rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {details.category}
            </span>
            <h3 className="text-lg font-bold text-slate-900 leading-tight mt-1">{details.name}</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-450 hover:text-slate-900 p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Media & Specifications */}
            <div className="space-y-4">
              <div className="aspect-[16/9] w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                <img src={galleryImages[activeImgIndex]} alt={details.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center space-x-2">
                {galleryImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImgIndex(idx)}
                    className={`h-12 w-12 rounded-lg overflow-hidden border ${activeImgIndex === idx ? 'border-2 border-blue-600' : 'border-slate-200'}`}
                  >
                    <img src={img} alt="thumb" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>

              {/* Technical Specifications list */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3">
                <h5 className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Technical Specifications</h5>
                <div className="grid grid-cols-2 gap-2">
                  {details.specifications && Object.entries(details.specifications).map(([key, val]) => (
                    <div key={key} className="bg-white border border-slate-100 p-2 rounded-xl">
                      <span className="block text-[9px] text-slate-400 uppercase font-semibold">{key}</span>
                      <span className="text-xs font-bold text-slate-800 font-mono mt-0.5">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Description & Dealer quotes */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h5 className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Product Description</h5>
                <p className="text-xs sm:text-sm text-slate-650 leading-relaxed">
                  {details.description || 'No detailed descriptive cataloging has been index for this industrial hardware item.'}
                </p>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-2">
                <h5 className="text-xs font-bold text-blue-800 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Seetech Verification</h5>
                <p className="text-xs text-slate-650 leading-relaxed">
                  All active dealer quotes are fetched in real-time. Verified suppliers carry the verified badge showing verified stock readiness and correct list prices.
                </p>
              </div>
            </div>
          </div>

          {/* Active Dealer comparative table */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h5 className="text-xs font-bold text-slate-800 flex items-center space-x-2">
              <ArrowRightLeft className="h-4 w-4 text-blue-600" />
              <span>Active Dealer Quotes & Shipping Estimates (Sorted by Cheapest)</span>
            </h5>
            
            <div className="space-y-2.5">
              {!details.offers || details.offers.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No quotes currently cataloged for this product.</p>
              ) : (
                details.offers.map((offer, idx) => (
                  <div 
                    key={offer.price_id} 
                    className={`p-4.5 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-smooth ${idx === 0 ? 'bg-emerald-50/40 border-emerald-300' : 'bg-slate-50/40 border-slate-200'}`}
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                        <span className="font-bold text-sm text-slate-900">{offer.dealer.name}</span>
                        <span className="inline-flex items-center text-[10px] text-slate-500 font-semibold font-mono"><MapPin className="h-3.5 w-3.5 text-blue-600 mr-1" />{offer.dealer.city}, {offer.dealer.state}</span>
                        <span className="text-[9px] bg-slate-100 border border-slate-200 font-bold uppercase text-slate-500 px-2 py-0.5 rounded font-mono">{offer.source_type}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-1 gap-x-4 text-[11px] text-slate-500 font-medium">
                        <div>Shop: <span className="text-slate-700">{offer.dealer.shop_name}</span></div>
                        <div className="flex items-center"><Clock className="h-3 w-3 mr-1 text-slate-400" /> Delivery: <span className="text-slate-700 font-semibold">{offer.delivery_time_days} days</span></div>
                        <div className="truncate">Web: <span className="text-slate-700">{offer.dealer.website_url || 'N/A'}</span></div>
                        <div className="truncate">Email: <span className="text-slate-700">{offer.dealer.email || 'N/A'}</span></div>
                      </div>

                      <div className="flex items-center space-x-4 text-[11px] font-semibold text-slate-700 pt-1">
                        <span className="flex items-center"><Phone className="h-3.5 w-3.5 text-blue-600 mr-1.5" />{offer.dealer.phone || 'N/A'}</span>
                        {offer.dealer.whatsapp && <span>WhatsApp: {offer.dealer.whatsapp}</span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0 bg-white border border-slate-200/60 p-3 rounded-2xl min-w-[160px] shadow-sm">
                      <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Base Price</div>
                      <div className="font-mono text-xs font-semibold text-slate-700">{formatPriceDisplay(offer.price, offer.currency)}</div>
                      
                      <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mt-1">Shipping Fees</div>
                      <div className="font-mono text-xs font-semibold text-slate-700">{offer.shipping_charges === 0 ? 'FREE' : `${formatCurrencySymbol(offer.currency)}${offer.shipping_charges.toLocaleString()}`}</div>
                      
                      <div className="text-[9px] text-slate-500 uppercase font-extrabold tracking-wider mt-2 border-t border-slate-100 pt-1">Total Cost</div>
                      <div className="font-mono text-sm font-extrabold text-emerald-600">{formatPriceDisplay(offer.total_cost, offer.currency)}</div>
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Edit Product Modal Sub-component
function EditProductModal({ product, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: product.name,
    brand: product.brand || '',
    category: product.category,
    model_number: product.model_number || '',
    description: product.description || '',
    image_url: product.image_url || '',
    specifications: product.specifications || { Power: '', Voltage: '', Frequency: '', Efficiency: '' }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleSpecChange = (key, val) => {
    setFormData(prev => ({
      ...prev,
      specifications: {
        ...prev.specifications,
        [key]: val
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white max-w-lg w-full rounded-3xl p-6 border border-slate-150 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h4 className="font-bold text-slate-900 flex items-center"><Edit3 className="h-5 w-5 mr-2 text-blue-600" /> Edit Product Catalog</h4>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-800"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Product Name</label>
              <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" required />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Model Number</label>
              <input type="text" value={formData.model_number} onChange={e => setFormData({ ...formData, model_number: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Brand</label>
              <input type="text" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Category</label>
              <input type="text" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" required />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Image URL</label>
            <input type="text" value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Description</label>
            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl h-20" />
          </div>

          <div className="border-t border-slate-100 pt-3">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">Specifications Schema</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['Power', 'Voltage', 'Frequency', 'Efficiency'].map(key => (
                <div key={key}>
                  <label className="block text-[9px] text-slate-400 mb-0.5">{key}</label>
                  <input 
                    type="text" 
                    value={formData.specifications[key] || formData.specifications[key.toLowerCase()] || ''} 
                    onChange={e => handleSpecChange(key, e.target.value)} 
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-semibold font-mono" 
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 font-bold rounded-xl">Cancel</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Create Product Modal Sub-component
function CreateProductModal({ onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '', brand: '', category: '', model_number: '', description: '', image_url: '',
    specifications: { Power: '', Voltage: '', Frequency: '', Efficiency: '' }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleSpecChange = (key, val) => {
    setFormData(prev => ({
      ...prev,
      specifications: {
        ...prev.specifications,
        [key]: val
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white max-w-lg w-full rounded-3xl p-6 border border-slate-150 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h4 className="font-bold text-slate-900 flex items-center"><Plus className="h-5 w-5 mr-2 text-blue-600" /> Add New Product</h4>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-800"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Product Name</label>
              <input type="text" placeholder="Siemens 5 HP Motor" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" required />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Model Number</label>
              <input type="text" placeholder="1LE7103" value={formData.model_number} onChange={e => setFormData({ ...formData, model_number: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Brand</label>
              <input type="text" placeholder="Siemens" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Category</label>
              <input type="text" placeholder="Electric Motors" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" required />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Image URL</label>
            <input type="text" placeholder="https://unsplash..." value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl" />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Description</label>
            <textarea placeholder="High-efficiency squirrel cage induction motor..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl h-20" />
          </div>

          <div className="border-t border-slate-100 pt-3">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">Specifications Schema</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['Power', 'Voltage', 'Frequency', 'Efficiency'].map(key => (
                <div key={key}>
                  <label className="block text-[9px] text-slate-400 mb-0.5">{key}</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 5 HP"
                    value={formData.specifications[key]} 
                    onChange={e => handleSpecChange(key, e.target.value)} 
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-semibold font-mono" 
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 font-bold rounded-xl">Cancel</button>
            <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm">Save Product</button>
          </div>
        </form>
      </div>
    </div>
  );
}
