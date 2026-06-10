'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, Upload, Database, FileText, BarChart3, HelpCircle, 
  MapPin, Tag, Calendar, User, Phone, Globe, Layers, AlertCircle,
  Loader2, RefreshCw, Send, CheckCircle2, ChevronRight, Sparkles,
  ArrowRightLeft, ShieldAlert, ShoppingBag, ShieldCheck, Star, 
  Clock, Truck, Check, Plus, Trash2, Edit3
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('search');
  
  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Compare State
  const [compareList, setCompareList] = useState([]);
  const [compareData, setCompareData] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  
  // RAG Chat State
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'assistant',
      content: 'Welcome to Seetech Procurement Intelligence! I can help you search catalogs, compare dealer pricing, check delivery estimates, and review newspaper ad listings. Ask me anything like:\n\n* "Which supplier offers the lowest price for a Siemens 5 HP motor?"\n* "Show dealers in Nagpur with the fastest delivery."\n* "Compare ABB and Siemens 3-phase motors."'
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // Detail Modal State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);

  // Ingestion & Admin State
  const [uploadFile, setUploadFile] = useState(null);
  const [pubDate, setPubDate] = useState('2026-06-10');
  const [lang, setLang] = useState('en');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [pagesList, setPagesList] = useState([]);
  
  // Scraper & Admin Controls State
  const [sourcesList, setSourcesList] = useState([]);
  const [scraperLogs, setScraperLogs] = useState([]);
  const [isTriggeringCrawl, setIsTriggeringCrawl] = useState({});
  const [isNewSourceModal, setIsNewSourceModal] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceType, setNewSourceType] = useState('indiamart');
  const [newSourceSchedule, setNewSourceSchedule] = useState('0 9 * * *');
  
  // Manual Verification State
  const [verificationItems, setVerificationItems] = useState([]);
  const [approvedItems, setApprovedItems] = useState({});

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState({
    categories: [],
    timeline: [],
    top_companies: [],
    locations: []
  });

  const backendUrl = 'http://localhost:5000';

  // Load initial data
  useEffect(() => {
    fetchProducts();
    fetchSources();
    fetchLegacyPages();
    fetchAnalytics();
    loadVerificationItems();
  }, []);

  // Sync comparison data whenever comparison list changes
  useEffect(() => {
    if (compareList.length > 0) {
      fetchComparisonDetails();
    } else {
      setCompareData(null);
    }
  }, [compareList]);

  // API Call: Fetch Products
  const fetchProducts = async (query = '', brand = '', category = '') => {
    setIsSearching(true);
    try {
      let url = `${backendUrl}/products`;
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (brand) params.append('brand', brand);
      if (category) params.append('category', category);
      
      if (params.toString()) {
        url = `${backendUrl}/search?${params.toString()}`;
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // API Call: Fetch Comparison details
  const fetchComparisonDetails = async () => {
    setIsComparing(true);
    try {
      const idsParam = compareList.join(',');
      const res = await fetch(`${backendUrl}/compare?ids=${idsParam}`);
      if (res.ok) {
        const data = await res.json();
        setCompareData(data);
      }
    } catch (err) {
      console.error("Failed to load comparison data:", err);
    } finally {
      setIsComparing(false);
    }
  };

  // API Call: Fetch Sources & Logs
  const fetchSources = async () => {
    try {
      const res = await fetch(`${backendUrl}/sources`);
      if (res.ok) {
        const data = await res.json();
        setSourcesList(data.sources || []);
        setScraperLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to load scraper sources:", err);
    }
  };

  // API Call: Fetch Legacy Upload Logs
  const fetchLegacyPages = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/v1/pages`);
      if (res.ok) {
        const data = await res.json();
        setPagesList(data);
      }
    } catch (err) {
      console.error("Failed to load legacy uploads:", err);
    }
  };

  // API Call: Fetch Analytics Data
  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/v1/ads/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    }
  };

  // API Call: Create Scrape Source
  const handleCreateSource = async (e) => {
    e.preventDefault();
    if (!newSourceName || !newSourceUrl) return;

    try {
      // Scraper Service triggers
      const res = await fetch('http://localhost:8080/api/v1/scraper/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSourceName,
          crawling_url: newSourceUrl,
          source_type: newSourceType,
          cron_schedule: newSourceSchedule,
          language: 'en',
          is_active: true
        })
      });

      if (res.ok) {
        setIsNewSourceModal(false);
        setNewSourceName('');
        setNewSourceUrl('');
        fetchSources();
        alert("Scrape source registered successfully with background cron scheduler.");
      } else {
        alert("Failed to register scrape source.");
      }
    } catch (err) {
      console.error("Failed to create scrape source:", err);
      // Fallback seed
      alert("Error contacting local scraper service. Make sure scraper microservice is running.");
    }
  };

  // API Call: Manual Trigger Scrape
  const handleTriggerScrape = async (sourceId) => {
    setIsTriggeringCrawl(prev => ({ ...prev, [sourceId]: true }));
    try {
      const res = await fetch(`http://localhost:8080/api/v1/scraper/trigger/${sourceId}`, {
        method: 'POST'
      });
      if (res.ok) {
        alert("Crawler trigger success! Scraper is executing search loops in background thread.");
        setTimeout(() => {
          fetchSources();
          fetchProducts();
          fetchAnalytics();
          loadVerificationItems();
        }, 3000);
      } else {
        alert("Scraper trigger returned error. Check logs.");
      }
    } catch (err) {
      console.error("Crawler trigger failed:", err);
      alert("Trigger request timed out. Re-polling database for newly ingested products in 3s...");
      setTimeout(() => {
        fetchSources();
        fetchProducts();
        loadVerificationItems();
      }, 3000);
    } finally {
      setIsTriggeringCrawl(prev => ({ ...prev, [sourceId]: false }));
    }
  };

  // API Call: File Page Upload Ingest
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    setUploadSuccess(false);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('publication_date', pubDate);
    formData.append('language', lang);

    try {
      const res = await fetch(`${backendUrl}/api/v1/pages/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setUploadSuccess(true);
        setUploadFile(null);
        fetchLegacyPages();
        setTimeout(() => {
          fetchLegacyPages();
          fetchProducts();
          fetchAnalytics();
        }, 5000);
      } else {
        alert("Upload failed. Verify local FastAPI backend is active.");
      }
    } catch (err) {
      console.error("Ingestion failed:", err);
      alert("Error contacting upload endpoint.");
    } finally {
      setIsUploading(false);
    }
  };

  // Load Mock Verification Items (simulate manual verification queue)
  const loadVerificationItems = () => {
    setVerificationItems([
      {
        id: "v-101",
        product_name: "Siemens 5 HP Three Phase Motor",
        brand: "Siemens",
        dealer: "Apex Power Spares",
        base_price: 14500,
        shipping_charges: 500,
        delivery_time_days: 2,
        extracted_source: "Newspaper Page Scan (Economic Times)"
      },
      {
        id: "v-102",
        product_name: "ABB 10 HP Induction Motor",
        brand: "ABB",
        dealer: "Vidarbha Electricals",
        base_price: 24500,
        shipping_charges: 1500,
        delivery_time_days: 5,
        extracted_source: "IndiaMART supplier listings"
      },
      {
        id: "v-103",
        product_name: "Havells 3 HP Single Phase Motor",
        brand: "Havells",
        dealer: "Apex Power Spares",
        base_price: 8200,
        shipping_charges: 300,
        delivery_time_days: 1,
        extracted_source: "Justdial portal listing"
      }
    ]);
  };

  const handleApproveItem = (id) => {
    setApprovedItems(prev => ({ ...prev, [id]: true }));
  };

  // Toggle comparison state for products
  const toggleCompare = (productId) => {
    if (compareList.includes(productId)) {
      setCompareList(prev => prev.filter(id => id !== productId));
    } else {
      if (compareList.length >= 4) {
        alert("You can compare a maximum of 4 products side-by-side.");
        return;
      }
      setCompareList(prev => [...prev, productId]);
    }
  };

  // API Call: Conversational RAG Chat
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatQuestion.trim()) return;

    const userMessage = { role: 'user', content: chatQuestion };
    setChatHistory(prev => [...prev, userMessage]);
    setChatQuestion('');
    setIsChatLoading(true);

    try {
      const res = await fetch(`${backendUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage.content })
      });

      if (res.ok) {
        const data = await res.json();
        setChatHistory(prev => [...prev, { 
          role: 'assistant', 
          content: data.answer,
          sources: data.sources 
        }]);
      } else {
        setChatHistory(prev => [...prev, { 
          role: 'assistant', 
          content: "I encountered an error retrieving comparative RAG analysis. Verify the FastAPI backend is running."
        }]);
      }
    } catch (err) {
      console.error("Chat failure:", err);
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: "Network error. Failed to connect to RAG pipeline." 
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Display Product Detail Modal
  const viewProductDetails = async (productId) => {
    try {
      const res = await fetch(`${backendUrl}/products/${productId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedProduct(data);
        setShowProductModal(true);
      }
    } catch (err) {
      console.error("Failed to load product details:", err);
    }
  };

  const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

  return (
    <div className="flex flex-col min-h-screen text-slate-100 font-sans antialiased">
      {/* Top Header Navigation */}
      <header className="glass-panel sticky top-0 z-40 px-6 py-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-500/30">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
              Seetech ProcureIntel <span className="text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full">v1.2</span>
            </h1>
            <p className="text-[11px] text-slate-400">Industrial Parts Ad Intelligence & Dealer Comparison Engine</p>
          </div>
        </div>

        <nav className="flex bg-slate-950/40 p-1.5 rounded-xl border border-slate-800/80 backdrop-blur-md space-x-1">
          <button 
            onClick={() => { setActiveTab('search'); fetchProducts(); }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-350 ${activeTab === 'search' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-300 hover:bg-slate-900/65 hover:text-white'}`}
          >
            <span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" /> Search</span>
          </button>
          <button 
            onClick={() => setActiveTab('compare')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-350 ${activeTab === 'compare' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-300 hover:bg-slate-900/65 hover:text-white'}`}
          >
            <span className="flex items-center gap-2">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Compare 
              {compareList.length > 0 && <span className="ml-1 bg-indigo-900/50 text-indigo-350 text-[10px] px-1.5 py-0.2 rounded-full border border-indigo-500/20">{compareList.length}</span>}
            </span>
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-350 ${activeTab === 'chat' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-300 hover:bg-slate-900/65 hover:text-white'}`}
          >
            <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> AI Assistant</span>
          </button>
          <button 
            onClick={() => setActiveTab('admin')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-350 ${activeTab === 'admin' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-300 hover:bg-slate-900/65 hover:text-white'}`}
          >
            <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" /> Admin Console</span>
          </button>
          <button 
            onClick={() => { setActiveTab('analytics'); fetchAnalytics(); }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-350 ${activeTab === 'analytics' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-300 hover:bg-slate-900/65 hover:text-white'}`}
          >
            <span className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5" /> Analytics</span>
          </button>
        </nav>
      </header>

      {/* Main Grid Wrapper */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        {/* Tab 1: Product Global Search */}
        {activeTab === 'search' && (
          <section className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
              <form onSubmit={(e) => { e.preventDefault(); fetchProducts(searchQuery, filterBrand, filterCategory); }} className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Global search parts e.g. 'Siemens 5 HP motor' or 'Three Phase Induction Motors'..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900/60 border border-slate-700/60 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-500 transition-colors"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isSearching}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-indigo-500/15 hover:shadow-indigo-500/25 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 min-w-[140px] glow-btn"
                  >
                    {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Search Procurement'}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <button 
                    type="button" 
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-1.5 hover:text-indigo-400 font-semibold transition-colors"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {showFilters ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
                  </button>
                </div>

                {showFilters && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/60 animate-fadeIn">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Manufacturer / Brand</label>
                      <select 
                        value={filterBrand} 
                        onChange={(e) => setFilterBrand(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">All Brands</option>
                        <option value="Siemens">Siemens</option>
                        <option value="ABB">ABB</option>
                        <option value="Havells">Havells</option>
                        <option value="Crompton">Crompton</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Category</label>
                      <select 
                        value={filterCategory} 
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">All Categories</option>
                        <option value="Electric Motors">Electric Motors</option>
                        <option value="Pumps & Accessories">Pumps & Accessories</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button 
                        type="button"
                        onClick={() => { setSearchQuery(''); setFilterBrand(''); setFilterCategory(''); fetchProducts(); }}
                        className="w-full px-3 py-2 border border-slate-700 rounded-lg text-sm text-slate-400 hover:bg-slate-850 transition-colors"
                      >
                        Reset Filters
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Results Grid */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold font-display tracking-tight text-white flex items-center gap-2">
                Available Industrial Products {searchResults.length > 0 && <span className="text-sm font-normal text-slate-400">({searchResults.length} items cataloged)</span>}
              </h2>

              {searchResults.length === 0 ? (
                <div className="glass-panel p-12 rounded-2xl text-center space-y-3">
                  <Database className="h-10 w-10 text-slate-500 mx-auto" />
                  <p className="text-slate-400 font-medium">No industrial catalog listings matched your query.</p>
                  <p className="text-xs text-slate-500">Run a search above or trigger scrapers in the Admin Console to ingest product feeds.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {searchResults.map((product, idx) => (
                    <div 
                      key={idx} 
                      className="glass-card rounded-2xl overflow-hidden flex flex-col group relative"
                    >
                      {/* Product Image */}
                      <div className="h-44 bg-black/60 relative overflow-hidden flex items-center justify-center border-b border-slate-800/80">
                        {product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt={product.name} 
                            className="object-cover h-full w-full transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <FileText className="h-12 w-12 text-slate-600" />
                        )}
                        <span className="absolute top-3 left-3 bg-indigo-650/90 backdrop-blur-sm px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                          {product.category}
                        </span>
                        
                        <div className="absolute top-3 right-3 bg-slate-900/90 backdrop-blur-sm px-2 py-1.5 rounded-lg border border-slate-700/50 flex items-center gap-1.5">
                          <input 
                            type="checkbox"
                            checked={compareList.includes(product.id)}
                            onChange={() => toggleCompare(product.id)}
                            className="rounded border-slate-700 text-indigo-650 focus:ring-indigo-650 h-3.5 w-3.5 bg-slate-900 cursor-pointer"
                            id={`comp-${product.id}`}
                          />
                          <label htmlFor={`comp-${product.id}`} className="text-[10px] font-semibold text-slate-350 cursor-pointer select-none">Compare</label>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/15 px-2 py-0.5 rounded">
                              Brand: {product.brand || 'Generic'}
                            </span>
                            {product.model_number && (
                              <span className="text-[10px] font-mono text-slate-400">
                                Model: {product.model_number}
                              </span>
                            )}
                          </div>
                          
                          <h4 className="text-md font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1 leading-snug">
                            {product.name}
                          </h4>
                          
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {product.description || 'No description cataloged for this industrial component.'}
                          </p>
                        </div>

                        {/* Specs badges */}
                        {product.specifications && Object.keys(product.specifications).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {Object.entries(product.specifications).slice(0, 3).map(([k, v], i) => (
                              <span key={i} className="text-[9px] bg-slate-900 border border-slate-800 text-slate-450 px-2 py-0.5 rounded-md">
                                {k}: {v}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                          <div>
                            <p className="text-[9px] uppercase tracking-wider text-slate-500 font-medium">Cheapest Deal Starts At</p>
                            <p className="text-md font-bold text-emerald-400 font-mono">
                              {product.min_price > 0 ? `Rs. ${product.min_price.toLocaleString()}` : 'No quotes'}
                            </p>
                          </div>
                          
                          <button 
                            onClick={() => viewProductDetails(product.id)}
                            className="bg-slate-900 hover:bg-indigo-650 text-indigo-300 hover:text-white border border-indigo-500/15 hover:border-indigo-500 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                          >
                            Get Offers <Clock className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tab 2: Compare Panel */}
        {activeTab === 'compare' && (
          <section className="space-y-6 animate-fadeIn">
            {compareList.length === 0 ? (
              <div className="glass-panel p-12 rounded-2xl text-center space-y-4">
                <ArrowRightLeft className="h-10 w-10 text-slate-500 mx-auto" />
                <h3 className="text-lg font-bold text-white">Compare Products Side-by-Side</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Add products to compare directly by checking the **Compare** box on search result cards, then return here to examine spec matrices, prices, and shipping logistics.
                </p>
                <button 
                  onClick={() => setActiveTab('search')}
                  className="bg-indigo-650 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors inline-block shadow-lg shadow-indigo-600/10"
                >
                  Browse Products
                </button>
              </div>
            ) : isComparing ? (
              <div className="glass-panel p-12 rounded-2xl text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mx-auto" />
                <p className="text-xs text-slate-400">Querying comparative price matrices...</p>
              </div>
            ) : compareData ? (
              <div className="space-y-6">
                {/* Highlights Summary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {compareData.highlights?.cheapest_overall && (
                    <div className="glass-panel p-4.5 rounded-xl border border-emerald-500/25 bg-emerald-950/10 flex items-start space-x-3">
                      <div className="bg-emerald-500/20 p-2.5 rounded-lg text-emerald-400 shrink-0">
                        <Check className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">Cheapest Total Cost</span>
                        <h4 className="font-bold text-slate-100 text-sm mt-1">{compareData.highlights.cheapest_overall.product_name}</h4>
                        <p className="text-xs text-slate-400 mt-1">
                          Offered by <span className="font-semibold text-slate-200">{compareData.highlights.cheapest_overall.dealer}</span> for a total of <span className="font-mono font-bold text-emerald-400">Rs. {compareData.highlights.cheapest_overall.total_cost.toLocaleString()}</span> (Price + Shipping).
                        </p>
                      </div>
                    </div>
                  )}

                  {compareData.highlights?.fastest_overall && (
                    <div className="glass-panel p-4.5 rounded-xl border border-indigo-500/25 bg-indigo-950/10 flex items-start space-x-3">
                      <div className="bg-indigo-500/20 p-2.5 rounded-lg text-indigo-400 shrink-0">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md">Fastest Delivery</span>
                        <h4 className="font-bold text-slate-100 text-sm mt-1">{compareData.highlights.fastest_overall.product_name}</h4>
                        <p className="text-xs text-slate-400 mt-1">
                          Supplied by <span className="font-semibold text-slate-200">{compareData.highlights.fastest_overall.dealer}</span> with an estimated delivery speed of <span className="font-mono font-bold text-indigo-400">{compareData.highlights.fastest_overall.delivery_time_days} days</span>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Compare Grid */}
                <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800">
                          <th className="p-4 text-slate-400 font-semibold w-1/4">Specification Matrix</th>
                          {compareData.products.map((p, idx) => (
                            <th key={idx} className="p-4 font-bold text-slate-200 border-l border-slate-850">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <p className="text-[9px] font-mono text-indigo-400 uppercase tracking-wider">{p.brand}</p>
                                  <h5 className="font-bold text-sm text-slate-100 line-clamp-1">{p.name}</h5>
                                </div>
                                <button 
                                  onClick={() => toggleCompare(p.id)}
                                  className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                                  title="Remove from comparison"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {/* 1. Base Image */}
                        <tr>
                          <td className="p-4 font-semibold text-slate-450 bg-slate-950/20">Preview Image</td>
                          {compareData.products.map((p, idx) => (
                            <td key={idx} className="p-4 border-l border-slate-850 text-center">
                              <img src={p.image_url} alt={p.name} className="h-20 w-auto rounded-lg mx-auto object-cover border border-slate-800" />
                            </td>
                          ))}
                        </tr>
                        
                        {/* 2. Best Price Deal */}
                        <tr>
                          <td className="p-4 font-semibold text-slate-450 bg-slate-950/20">Cheapest Base Quote</td>
                          {compareData.products.map((p, idx) => (
                            <td key={idx} className="p-4 border-l border-slate-850">
                              {p.best_price_offer ? (
                                <div className="space-y-0.5">
                                  <p className="font-bold font-mono text-emerald-400 text-sm">Rs. {p.best_price_offer.price.toLocaleString()}</p>
                                  <p className="text-[10px] text-slate-400">by {p.best_price_offer.dealer_name}</p>
                                </div>
                              ) : (
                                <span className="text-slate-500 italic">No quotes available</span>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* 3. Shipping Charges */}
                        <tr>
                          <td className="p-4 font-semibold text-slate-450 bg-slate-950/20">Best Shipping Fees</td>
                          {compareData.products.map((p, idx) => (
                            <td key={idx} className="p-4 border-l border-slate-850">
                              {p.best_price_offer ? (
                                <p className="font-semibold text-slate-200">
                                  {p.best_price_offer.shipping_charges === 0 ? (
                                    <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px]">FREE</span>
                                  ) : (
                                    `Rs. ${p.best_price_offer.shipping_charges}`
                                  )}
                                </p>
                              ) : (
                                <span className="text-slate-500 italic">-</span>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* 4. Total Price */}
                        <tr>
                          <td className="p-4 font-semibold text-slate-450 bg-slate-950/20">Lowest Total Cost</td>
                          {compareData.products.map((p, idx) => (
                            <td key={idx} className="p-4 border-l border-slate-850">
                              {p.best_price_offer ? (
                                <div className="space-y-0.5">
                                  <p className="font-extrabold font-mono text-emerald-400 text-sm">Rs. {p.best_price_offer.total_cost.toLocaleString()}</p>
                                  <p className="text-[9px] text-slate-500">Base + Shipping</p>
                                </div>
                              ) : (
                                <span className="text-slate-500 italic">-</span>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* 5. Delivery time */}
                        <tr>
                          <td className="p-4 font-semibold text-slate-450 bg-slate-950/20">Fastest Delivery</td>
                          {compareData.products.map((p, idx) => (
                            <td key={idx} className="p-4 border-l border-slate-850">
                              {p.fastest_delivery_offer ? (
                                <div className="flex items-center gap-1 text-slate-200 font-semibold">
                                  <Clock className="h-3 w-3 text-indigo-400" /> {p.fastest_delivery_offer.delivery_time_days} days
                                </div>
                              ) : (
                                <span className="text-slate-500 italic">-</span>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* 6. Dynamic Specifications */}
                        {/* We collect all unique spec keys across comparison products and render them */}
                        {Array.from(new Set(compareData.products.flatMap(p => p.specifications ? Object.keys(p.specifications) : []))).map((specKey, sIdx) => (
                          <tr key={sIdx}>
                            <td className="p-4 font-semibold text-slate-450 bg-slate-950/20 capitalize">{specKey}</td>
                            {compareData.products.map((p, idx) => (
                              <td key={idx} className="p-4 border-l border-slate-850 text-slate-300 font-mono text-[11px]">
                                {p.specifications && p.specifications[specKey] ? p.specifications[specKey] : 'N/A'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* Tab 3: AI Assistant (RAG Chat Console) */}
        {activeTab === 'chat' && (
          <section className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Chat Console Area */}
              <div className="lg:col-span-2 space-y-4 flex flex-col h-[70vh]">
                
                {/* Chat History Box */}
                <div className="flex-1 glass-panel p-6 rounded-2xl shadow-xl overflow-y-auto space-y-4">
                  {chatHistory.map((msg, idx) => (
                    <div 
                      key={idx} 
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] rounded-2xl p-4.5 text-xs shadow-md border ${msg.role === 'user' ? 'bg-indigo-600/80 border-indigo-500/20 text-slate-100 rounded-tr-none' : 'bg-slate-900/80 border-slate-800 text-slate-200 rounded-tl-none'}`}>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 mb-1">
                          {msg.role === 'user' ? <User className="h-3 w-3 text-indigo-300" /> : <Sparkles className="h-3 w-3 text-indigo-400" />}
                          {msg.role === 'user' ? 'You (Procurement Officer)' : 'AI Procurement Assistant'}
                        </div>
                        <p className="leading-relaxed whitespace-pre-line text-[11.5px] font-sans">
                          {msg.content}
                        </p>
                        
                        {/* Citations/References rendering */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3.5 pt-3 border-t border-slate-800">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">References & Quotes</p>
                            <div className="flex flex-wrap gap-2">
                              {msg.sources.map((src, i) => (
                                <button
                                  key={i}
                                  onClick={() => viewProductDetails(src.id)}
                                  className="text-[10px] bg-slate-950 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-slate-800 hover:border-indigo-500 px-2 py-1 rounded-md transition-all flex items-center gap-1"
                                >
                                  <ShoppingBag className="h-2.5 w-2.5 text-indigo-400" /> {src.brand}: {src.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-xs text-slate-450 rounded-tl-none flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                        <span>Searching catalogs and comparing dealer pricing...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Question Form */}
                <form onSubmit={handleChatSubmit} className="relative">
                  <input 
                    type="text" 
                    placeholder="Ask standard questions (e.g. Which supplier has the lowest shipping charges?)"
                    value={chatQuestion}
                    onChange={(e) => setChatQuestion(e.target.value)}
                    className="w-full pl-5 pr-14 py-3 bg-slate-900 border border-slate-700/60 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-500 shadow-xl transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={isChatLoading || !chatQuestion.trim()}
                    className="absolute right-2.5 top-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 p-1.5 rounded-lg text-white transition-all duration-200 disabled:opacity-50 glow-btn"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>

              {/* Sidebar Guide */}
              <div className="space-y-6">
                <div className="glass-panel p-6 rounded-2xl space-y-4">
                  <h4 className="font-bold text-white text-md flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-indigo-400" /> Guided Queries
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Click a sample query template to populate the chat input box and trigger conversational RAG database joins:
                  </p>
                  
                  <div className="space-y-2.5 pt-2">
                    <button
                      onClick={() => setChatQuestion("Which supplier offers the lowest price for a Siemens 5 HP motor?")}
                      className="w-full text-left text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/30 p-3 rounded-xl transition-all text-slate-350 block leading-snug"
                    >
                      "Which supplier offers the lowest price for a Siemens 5 HP motor?"
                    </button>
                    <button
                      onClick={() => setChatQuestion("Which dealer has the shortest delivery time for ABB motors?")}
                      className="w-full text-left text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/30 p-3 rounded-xl transition-all text-slate-350 block leading-snug"
                    >
                      "Which dealer has the shortest delivery time for ABB motors?"
                    </button>
                    <button
                      onClick={() => setChatQuestion("Who provides free shipping for industrial motors in Maharashtra?")}
                      className="w-full text-left text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/30 p-3 rounded-xl transition-all text-slate-350 block leading-snug"
                    >
                      "Who provides free shipping for industrial motors in Maharashtra?"
                    </button>
                    <button
                      onClick={() => setChatQuestion("Compare specifications and price ranges of Siemens and ABB motors.")}
                      className="w-full text-left text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/30 p-3 rounded-xl transition-all text-slate-350 block leading-snug"
                    >
                      "Compare specifications and price ranges of Siemens and ABB motors."
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </section>
        )}

        {/* Tab 4: Admin Panel */}
        {activeTab === 'admin' && (
          <section className="space-y-6 animate-fadeIn">
            
            {/* Upper grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Manage Sources */}
              <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Database className="h-5 w-5 text-indigo-400" /> Crawl Source Management
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Register manufacturer website catalogs, newspaper epaper URLs, or business portal queries (IndiaMART/Justdial) to be crawled automatically.
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <button 
                    onClick={() => setIsNewSourceModal(true)}
                    className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs glow-btn"
                  >
                    <Plus className="h-4 w-4" /> Add Scrape Source
                  </button>
                </div>
              </div>

              {/* Right Column: Source list and Schedule triggers */}
              <div className="lg:col-span-2 glass-panel p-6 rounded-2xl shadow-xl space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center justify-between">
                  <span>Registered Scrapers & Schedulers</span>
                  <button onClick={fetchSources} className="p-1.5 rounded border border-slate-700 hover:bg-slate-800 text-slate-400">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </h3>

                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-450 font-semibold uppercase tracking-wider">
                        <th className="pb-3">Source Name</th>
                        <th className="pb-3">Portal URL</th>
                        <th className="pb-3">Type</th>
                        <th className="pb-3">Cron Schedule</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {sourcesList.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-4 text-center text-slate-500">No active sources registered.</td>
                        </tr>
                      ) : (
                        sourcesList.map((src, i) => (
                          <tr key={i} className="hover:bg-slate-900/10 transition-colors">
                            <td className="py-3 font-semibold text-slate-200">{src.name}</td>
                            <td className="py-3 text-slate-450 truncate max-w-[150px] font-mono">{src.crawling_url}</td>
                            <td className="py-3"><span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-mono text-[9px] uppercase font-bold">{src.source_type}</span></td>
                            <td className="py-3 font-mono text-[10px] text-slate-400">{src.cron_schedule}</td>
                            <td className="py-3 text-right">
                              <button 
                                onClick={() => handleTriggerScrape(src.id)}
                                disabled={isTriggeringCrawl[src.id]}
                                className="bg-indigo-600/20 hover:bg-indigo-650 text-indigo-350 hover:text-white border border-indigo-500/20 hover:border-indigo-500 px-2.5 py-1.5 rounded-lg font-bold text-[10px] transition-all"
                              >
                                {isTriggeringCrawl[src.id] ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
                                Trigger Scrape
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Ingestion upload & Scraper Logs Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Newspaper Scan Ingestion */}
              <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
                <h3 className="text-md font-bold text-white flex items-center gap-2">
                  <Upload className="h-5 w-5 text-indigo-400" /> Scanned Newspaper Ingest
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Submit scanned images or PDF pages of print advertisements to run through PaddleOCR, LayoutLMv3, and Gemini parsing.
                </p>

                <form onSubmit={handleUploadSubmit} className="space-y-4.5 pt-1 text-xs">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Newspaper Scan File</label>
                    <input 
                      type="file" 
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      className="w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer bg-slate-900 border border-slate-700 p-1.5 rounded-lg"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Publish Date</label>
                      <input 
                        type="date" 
                        value={pubDate}
                        onChange={(e) => setPubDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Language</label>
                      <select 
                        value={lang} 
                        onChange={(e) => setLang(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                      >
                        <option value="en">English</option>
                        <option value="hi">Hindi</option>
                        <option value="mr">Marathi</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={isUploading}
                    className="w-full bg-slate-900 hover:bg-indigo-650 text-indigo-300 hover:text-white border border-indigo-500/15 hover:border-indigo-500 font-semibold py-2 rounded-lg transition-all text-xs flex items-center justify-center gap-1.5"
                  >
                    {isUploading ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : 'Run OCR Segmentation'}
                  </button>

                  {uploadSuccess && (
                    <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/35 p-2 rounded-lg text-emerald-400 text-[10.5px]">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Scan upload succeeded! Page registered in ingestion workers.</span>
                    </div>
                  )}
                </form>
              </div>

              {/* Scraper logs monitoring list */}
              <div className="lg:col-span-2 glass-panel p-6 rounded-2xl shadow-xl space-y-4">
                <h3 className="text-md font-bold text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-400" /> Scraper Pipeline Execution Logs
                </h3>

                <div className="overflow-x-auto text-[11px] max-h-[220px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Source URL</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {scraperLogs.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="py-4 text-center text-slate-500">No logs generated. Run a crawler scheduler trigger.</td>
                        </tr>
                      ) : (
                        scraperLogs.map((log, i) => (
                          <tr key={i} className="hover:bg-slate-900/10">
                            <td className="py-2.5 font-mono text-[9.5px] text-slate-450">{new Date(log.downloaded_at).toLocaleTimeString()}</td>
                            <td className="py-2.5 text-slate-300 font-mono truncate max-w-[200px]" title={log.source_url}>{log.source_url}</td>
                            <td className="py-2.5">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${log.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400' : log.status === 'DUPLICATE' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono text-[9px] text-slate-450">
                              {log.error_message || 'OK'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Manual Verification Table */}
            <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-indigo-400" /> Manual Normalization & Verification Queue
              </h3>
              <p className="text-xs text-slate-400 max-w-2xl">
                Review newly parsed catalog and advertisement pricing entries before committing them to public search catalogs. Normalizing pricing data fields fixes inconsistencies.
              </p>

              <div className="overflow-x-auto text-xs pt-2">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-450 font-semibold uppercase tracking-wider">
                      <th className="pb-3">Product Item</th>
                      <th className="pb-3">Extracted Supplier</th>
                      <th className="pb-3">Base Price</th>
                      <th className="pb-3">Shipping Charges</th>
                      <th className="pb-3">Delivery Days</th>
                      <th className="pb-3">Parsed Source</th>
                      <th className="pb-3 text-right">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {verificationItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/10">
                        <td className="py-3.5 font-bold text-slate-200">{item.product_name}</td>
                        <td className="py-3.5 text-slate-350">{item.dealer}</td>
                        <td className="py-3.5 font-mono text-slate-300">Rs. {item.base_price.toLocaleString()}</td>
                        <td className="py-3.5 font-mono text-slate-300">Rs. {item.shipping_charges.toLocaleString()}</td>
                        <td className="py-3.5 font-mono text-slate-300">{item.delivery_time_days} days</td>
                        <td className="py-3.5 text-slate-450 italic text-[11px]">{item.extracted_source}</td>
                        <td className="py-3.5 text-right">
                          {approvedItems[item.id] ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full">
                              <Check className="h-3 w-3" /> VERIFIED
                            </span>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleApproveItem(item.id)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg text-[10.5px] transition-colors"
                              >
                                Approve
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </section>
        )}

        {/* Tab 5: Analytics Charts */}
        {activeTab === 'analytics' && (
          <section className="space-y-6 animate-fadeIn">
            {/* Core Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-card p-4.5 rounded-xl flex items-center space-x-4">
                <div className="bg-indigo-500/20 p-3 rounded-lg text-indigo-400">
                  <Database className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Cataloged Parts</p>
                  <h3 className="text-2xl font-bold font-display text-white">4</h3>
                </div>
              </div>

              <div className="glass-card p-4.5 rounded-xl flex items-center space-x-4">
                <div className="bg-emerald-500/20 p-3 rounded-lg text-emerald-400">
                  <Layers className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Active Suppliers</p>
                  <h3 className="text-2xl font-bold font-display text-white">6</h3>
                </div>
              </div>

              <div className="glass-card p-4.5 rounded-xl flex items-center space-x-4">
                <div className="bg-amber-500/20 p-3 rounded-lg text-amber-400">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Quotes Indexed</p>
                  <h3 className="text-2xl font-bold font-display text-white">10</h3>
                </div>
              </div>

              <div className="glass-card p-4.5 rounded-xl flex items-center space-x-4">
                <div className="bg-blue-500/20 p-3 rounded-lg text-blue-400">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Crawling Success Rate</p>
                  <h3 className="text-2xl font-bold font-display text-white">100%</h3>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Category distribution */}
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-white text-md">Industrial Categories Distribution</h4>
                <div className="h-64 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analyticsData.categories.map((c, i) => ({ name: c.category, value: parseInt(c.count) }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {analyticsData.categories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2.5 text-xs justify-center pt-2">
                  {analyticsData.categories.map((c, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                      {c.category} ({c.count})
                    </span>
                  ))}
                </div>
              </div>

              {/* Volume Ingestion timeline */}
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-white text-md">Scraping Feeds Volume Timeline</h4>
                <div className="h-64 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={analyticsData.timeline.map(t => ({ date: t.publication_date, ads: parseInt(t.ads) }))}
                    >
                      <defs>
                        <linearGradient id="colorAds" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }} />
                      <Area type="monotone" dataKey="ads" stroke="#6366f1" fillOpacity={1} fill="url(#colorAds)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Manufacturers / Brands */}
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-white text-md">Cataloged Brands Market Share</h4>
                <div className="h-64 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={analyticsData.top_companies.map(c => ({ name: c.company, count: parseInt(c.count) }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                      <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Geographical locations list */}
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-white text-md">Dealer Locations Coverage</h4>
                <div className="h-64 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analyticsData.locations.map(l => ({ name: l.location, count: parseInt(l.count) }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }} />
                      <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </section>
        )}

      </main>

      {/* Product Details Modal with Quotes comparative table */}
      {showProductModal && selectedProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-4xl w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-700/60 max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="space-y-1">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-md">
                  {selectedProduct.category}
                </span>
                <h3 className="text-lg font-bold text-white font-display leading-tight">{selectedProduct.name}</h3>
              </div>
              <button 
                onClick={() => { setShowProductModal(false); setSelectedProduct(null); }}
                className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 transition-all font-semibold text-xs"
              >
                Close Window
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Side: Product Image and Specifications */}
                <div className="space-y-4">
                  <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-56 object-cover rounded-xl border border-slate-800" />
                  
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Specifications Schema</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      {selectedProduct.specifications && Object.entries(selectedProduct.specifications).map(([k, v], i) => (
                        <div key={i} className="bg-slate-950 p-2 rounded border border-slate-850">
                          <p className="text-[9px] text-slate-500 uppercase">{k}</p>
                          <p className="font-semibold text-slate-200 mt-0.5 truncate">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Description and Contact Details */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {selectedProduct.description || 'No detailed descriptive cataloging has been index for this industrial hardware item.'}
                    </p>
                  </div>

                  <div className="bg-indigo-950/10 border border-indigo-500/15 p-4 rounded-xl space-y-2.5">
                    <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5"><Star className="h-4 w-4" /> Technical parameters</h4>
                    <p className="text-[11.5px] text-slate-300 leading-relaxed">
                      All models have been normalized according to Seetech procurement criteria. Pricing quotes are retrieved using real-time crawls of manufacturer bulletins.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dealer Offers list */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><ArrowRightLeft className="h-4 w-4 text-indigo-400" /> Active Dealer Quotes & Shipping Estimations (Sorted by Lowest Total Cost)</h4>
                
                <div className="space-y-2.5">
                  {selectedProduct.offers && selectedProduct.offers.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No quotes cataloged in database. Ingest scrapers to search suppliers.</p>
                  ) : (
                    selectedProduct.offers.map((offer, i) => (
                      <div 
                        key={i} 
                        className={`p-4 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all ${i === 0 ? 'bg-emerald-950/10 border-emerald-500/35 shadow-lg shadow-emerald-950/10' : 'bg-slate-900/40 border-slate-800'}`}
                      >
                        <div className="space-y-2 max-w-[65%]">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-200">{offer.dealer.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5"><MapPin className="h-3 w-3 text-indigo-400" /> {offer.dealer.city}, {offer.dealer.state}</span>
                            <span className="text-[10px] bg-slate-800 text-indigo-300 border border-slate-700/60 px-2 py-0.2 rounded-full font-mono uppercase text-[9px]">{offer.source_type}</span>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px] text-slate-400">
                            <div>Shop: <span className="text-slate-300 font-medium">{offer.dealer.shop_name || 'Corp Office'}</span></div>
                            <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-550" /> Delivery: <span className="text-slate-300 font-semibold">{offer.delivery_time_days} days</span></div>
                            <div className="truncate">Web: <a href={offer.dealer.website_url} target="_blank" className="text-indigo-400 hover:underline">{offer.dealer.website_url ? 'Link' : 'N/A'}</a></div>
                            <div className="truncate">Email: <span className="text-slate-350">{offer.dealer.email || 'N/A'}</span></div>
                          </div>
                          
                          <div className="text-[11px] text-slate-400 flex items-center gap-4">
                            <span className="flex items-center gap-1 font-semibold text-slate-300"><Phone className="h-3.5 w-3.5 text-indigo-400" /> {offer.dealer.phone || 'N/A'}</span>
                            {offer.dealer.whatsapp && <a href={`https://wa.me/${offer.dealer.whatsapp}`} className="text-emerald-400 font-bold hover:underline">WhatsApp</a>}
                          </div>
                        </div>

                        <div className="text-right shrink-0 space-y-1 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 min-w-[150px]">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Base Price</div>
                          <div className="font-mono text-slate-300 text-xs font-semibold">Rs. {offer.price.toLocaleString()}</div>
                          
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1.5">Shipping Charges</div>
                          <div className="font-mono text-slate-300 text-xs font-semibold">{offer.shipping_charges === 0 ? 'FREE' : `Rs. ${offer.shipping_charges.toLocaleString()}`}</div>
                          
                          <div className="text-[10.5px] text-slate-450 uppercase tracking-wider mt-2 border-t border-slate-850 pt-1.5">Total Cost</div>
                          <div className="font-mono text-sm font-extrabold text-emerald-400">Rs. {offer.total_cost.toLocaleString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4.5 border-t border-slate-800 flex justify-between items-center bg-slate-900/30 text-xs text-slate-500">
              <span>Catalog Reference: {selectedProduct.id}</span>
              <span>Seetech Procurement Database</span>
            </div>

          </div>
        </div>
      )}

      {/* New Source Registration Modal Overlay */}
      {isNewSourceModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full rounded-2xl p-6 border border-slate-700/60 space-y-4 shadow-2xl">
            <h3 className="text-md font-bold text-white flex items-center gap-1.5"><Plus className="h-5 w-5 text-indigo-400" /> Register Scraper Source</h3>
            
            <form onSubmit={handleCreateSource} className="space-y-4 text-xs text-slate-300">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Source Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. IndiaMART Motor Listings"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Crawling Seed URL</label>
                <input 
                  type="url" 
                  placeholder="e.g. http://example-portal.com/industrial-motor-query"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Source Type</label>
                  <select 
                    value={newSourceType}
                    onChange={(e) => setNewSourceType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
                  >
                    <option value="indiamart">IndiaMART</option>
                    <option value="justdial">Justdial</option>
                    <option value="website_catalog">Website Catalog</option>
                    <option value="epaper_pdf">e-Paper Scan PDF</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wider">Cron Schedule</label>
                  <input 
                    type="text" 
                    value={newSourceSchedule}
                    onChange={(e) => setNewSourceSchedule(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3 text-xs">
                <button 
                  type="button" 
                  onClick={() => setIsNewSourceModal(false)}
                  className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-400 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-indigo-650 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Save Source
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
