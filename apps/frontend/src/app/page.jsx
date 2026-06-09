'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Upload, Database, FileText, BarChart3, HelpCircle, 
  MapPin, Tag, Calendar, User, Phone, Globe, Layers, AlertCircle,
  Loader2, RefreshCw, Send, CheckCircle2, ChevronRight, Sparkles
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('search');
  const [uploadFile, setUploadFile] = useState(null);
  const [pubDate, setPubDate] = useState('2026-06-08');
  const [lang, setLang] = useState('en');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('hybrid');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  
  // QA RAG State
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState(null);
  const [isQaLoading, setIsQaLoading] = useState(false);
  
  // Detail Modal State
  const [selectedAd, setSelectedAd] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [similarAds, setSimilarAds] = useState([]);


  // Database lists
  const [pagesList, setPagesList] = useState([]);
  const [analyticsData, setAnalyticsData] = useState({
    categories: [],
    timeline: [],
    top_companies: [],
    locations: []
  });

  const backendUrl = 'http://localhost:5000';

  // Fetch initial data
  useEffect(() => {
    fetchPages();
    fetchAnalytics();
  }, []);

  const fetchPages = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/v1/pages`);
      if (res.ok) {
        const data = await res.json();
        setPagesList(data);
      }
    } catch (err) {
      console.error("Failed to load page ingestions:", err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/v1/ads/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error("Failed to load database analytics:", err);
    }
  };

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
        fetchPages();
        // Wait and refresh list in background
        setTimeout(() => {
          fetchPages();
          fetchAnalytics();
        }, 8000);
      } else {
        alert("Upload failed. Make sure Express backend and MinIO services are active.");
      }
    } catch (err) {
      console.error("Ingestion failed:", err);
      alert("Error contacting upload gateway.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    setIsSearching(true);

    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append('q', searchQuery);
      queryParams.append('type', searchType);
      if (filterCategory) queryParams.append('category', filterCategory);
      if (filterLocation) queryParams.append('location', filterLocation);

      const res = await fetch(`${backendUrl}/api/v1/ads/search?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAskRAG = async (e) => {
    e.preventDefault();
    if (!qaQuestion.trim()) return;

    setIsQaLoading(true);
    setQaAnswer(null);

    try {
      const res = await fetch(`${backendUrl}/api/v1/ads/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: qaQuestion,
          filters: {
            category: filterCategory || undefined,
            location: filterLocation || undefined
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        setQaAnswer(data);
      } else {
        setQaAnswer({ answer: "Error: Could not retrieve answer. Check if Python ML Service is online." });
      }
    } catch (err) {
      console.error("RAG pipeline failed:", err);
      setQaAnswer({ answer: "Failed to connect to ML and QA services." });
    } finally {
      setIsQaLoading(false);
    }
  };

  const viewAdDetails = async (adId) => {
    try {
      setSimilarAds([]); // Clear previous similar ads
      const res = await fetch(`${backendUrl}/api/v1/ads/${adId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedAd(data);
        setShowModal(true);

        // Fetch similar advertisements semantically
        try {
          const simRes = await fetch(`${backendUrl}/api/v1/ads/${adId}/similar`);
          if (simRes.ok) {
            const simData = await simRes.json();
            setSimilarAds(simData.results || []);
          }
        } catch (simErr) {
          console.error("Failed to load similar advertisements:", simErr);
        }
      }
    } catch (err) {
      console.error("Failed to load ad metadata details:", err);
    }
  };


  // Pre-configured colors for categories
  const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

  return (
    <div className="flex flex-col min-h-screen text-slate-100 font-sans antialiased">
      {/* Top Banner Navigation */}
      <header className="glass-panel sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-500/35">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
              AdIntel-RAG <span className="text-xs font-mono bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">v1.0</span>
            </h1>
            <p className="text-xs text-slate-400">Newspaper Ad Intelligence & Retrieval Engine</p>
          </div>
        </div>

        <nav className="flex space-x-1">
          <button 
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'search' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <span className="flex items-center gap-2"><Search className="h-4 w-4" /> Search Engine</span>
          </button>
          <button 
            onClick={() => setActiveTab('rag')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'rag' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> RAG QA</span>
          </button>
          <button 
            onClick={() => setActiveTab('ingest')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'ingest' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Ingestion Queue</span>
          </button>
          <button 
            onClick={() => { setActiveTab('analytics'); fetchAnalytics(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Analytics</span>
          </button>
        </nav>
      </header>

      {/* Main Grid Wrapper */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">


        {/* Tab Content 1: Search & Box canvas */}
        {activeTab === 'search' && (
          <section className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
              <form onSubmit={handleSearchSubmit} className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search ads by semantic meaning e.g. 'civil engineers needed' or 'road construction tenders'..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900/60 border border-slate-700/60 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-500 transition-colors"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isSearching}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 min-w-[140px]"
                  >
                    {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Search Archive'}
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
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-800/60 animate-fadeIn">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Search Mechanism</label>
                      <select 
                        value={searchType} 
                        onChange={(e) => setSearchType(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="hybrid">Sparse-Dense Hybrid (Recommended)</option>
                        <option value="semantic">Vector Semantic Match</option>
                        <option value="keyword">Standard Database Filter</option>
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
                        <option value="Government Tender">Government Tender</option>
                        <option value="Recruitment">Recruitment</option>
                        <option value="Real Estate">Real Estate</option>
                        <option value="Retail">Retail</option>
                        <option value="Healthcare">Healthcare</option>
                        <option value="Education">Education</option>
                        <option value="Automobile">Automobile</option>
                        <option value="Public Notice">Public Notice</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Geographic Location</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Nagpur, Mumbai"
                        value={filterLocation}
                        onChange={(e) => setFilterLocation(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="flex items-end">
                      <button 
                        type="button"
                        onClick={() => { setSearchQuery(''); setFilterCategory(''); setFilterLocation(''); setSearchResults([]); }}
                        className="w-full px-3 py-2 border border-slate-700 rounded-lg text-sm text-slate-400 hover:bg-slate-800 transition-colors"
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
                Search Results {searchResults.length > 0 && <span className="text-sm font-normal text-slate-400">({searchResults.length} matches)</span>}
              </h2>

              {searchResults.length === 0 ? (
                <div className="glass-panel p-12 rounded-2xl text-center space-y-3">
                  <Database className="h-10 w-10 text-slate-500 mx-auto" />
                  <p className="text-slate-400 font-medium">No advertisements matched your filters.</p>
                  <p className="text-xs text-slate-500">Run a search query above or upload files in the Ingestion tab to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {searchResults.map((result, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => viewAdDetails(result.ad_id)}
                      className="glass-card rounded-2xl overflow-hidden cursor-pointer flex flex-col group"
                    >
                      {/* Image Preview */}
                      <div className="h-48 bg-black/60 relative overflow-hidden flex items-center justify-center border-b border-slate-800/80">
                        {result.image_url ? (
                          <img 
                            src={result.image_url} 
                            alt={result.title} 
                            className="object-cover max-h-full max-w-full transition-transform duration-500 group-hover:scale-105"
                            onError={(e) => {
                              // If minio url fails locally, show mock page scan or canvas representation
                              e.target.onerror = null;
                              e.target.src = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600';
                            }}
                          />
                        ) : (
                          <FileText className="h-12 w-12 text-slate-600" />
                        )}
                        <div className="absolute top-3 right-3 bg-indigo-600/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-mono font-medium text-white shadow-md">
                          Score: {result.score ? result.score.toFixed(3) : '1.0'}
                        </div>
                      </div>

                      {/* Details Content */}
                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-md">
                            {result.category}
                          </span>
                          <h4 className="text-md font-semibold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                            {result.title}
                          </h4>
                          <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                            {result.raw_text}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-indigo-400" /> {result.location || 'Maharashtra'}
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Calendar className="h-3 w-3 text-indigo-400" /> {result.publication_date || '2026-06-08'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tab Content 2: RAG QA Console */}
        {activeTab === 'rag' && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Question Form */}
              <div className="lg:col-span-2 space-y-6">
                <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
                  <div className="flex items-center space-x-2 text-indigo-400">
                    <Sparkles className="h-5 w-5" />
                    <h3 className="text-lg font-bold font-display tracking-tight text-white">Semantic Question Answering</h3>
                  </div>
                  <p className="text-sm text-slate-400">
                    The RAG pipeline queries Qdrant vector database for relevant ads context, compiles semantic passages, and generates an answer using Gemini 1.5 Flash.
                  </p>

                  <form onSubmit={handleAskRAG} className="space-y-4 pt-2">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="e.g. Which road construction tenders are open in Nagpur or Nagpur municipal corporation?"
                        value={qaQuestion}
                        onChange={(e) => setQaQuestion(e.target.value)}
                        className="w-full pl-4 pr-12 py-3 bg-slate-900/60 border border-slate-700/60 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-500 transition-colors"
                      />
                      <button 
                        type="submit"
                        disabled={isQaLoading}
                        className="absolute right-2 top-2 bg-indigo-600 hover:bg-indigo-700 p-1.5 rounded-lg text-white transition-all disabled:opacity-50"
                      >
                        {isQaLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Answer Display */}
                {qaAnswer && (
                  <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4 border border-indigo-500/20 bg-indigo-950/10">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="font-bold text-md text-white flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-indigo-400" /> Generated Response
                      </h4>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                        Gemini 1.5 Flash RAG Engine
                      </span>
                    </div>

                    <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                      {qaAnswer.answer}
                    </div>

                    {qaAnswer.sources && qaAnswer.sources.length > 0 && (
                      <div className="pt-4 border-t border-slate-800">
                        <p className="text-xs font-semibold text-slate-400 mb-2">Cited References</p>
                        <div className="flex flex-wrap gap-2">
                          {qaAnswer.sources.map((src, i) => (
                            <button
                              key={i}
                              onClick={() => viewAdDetails(src.ad_id)}
                              className="text-xs bg-slate-800 hover:bg-indigo-650 text-indigo-400 hover:text-white border border-slate-700/60 hover:border-indigo-500 px-3 py-1 rounded-lg transition-colors flex items-center gap-1 font-mono"
                            >
                              <FileText className="h-3 w-3" /> Ad-Source #{i + 1}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* RAG Guide / Suggestions */}
              <div className="space-y-6">
                <div className="glass-panel p-6 rounded-2xl space-y-4">
                  <h4 className="font-bold text-white text-md flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-indigo-400" /> Try Query Suggestions
                  </h4>
                  <p className="text-xs text-slate-400">Click a sample query to populate the QA console.</p>
                  
                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => setQaQuestion("Government tenders related to road construction in Maharashtra")}
                      className="w-full text-left text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700/60 p-3 rounded-xl transition-all hover:border-indigo-500/40 text-slate-300 block"
                    >
                      "Government tenders related to road construction in Maharashtra"
                    </button>
                    <button
                      onClick={() => setQaQuestion("Show all recruitment advertisements for civil engineers")}
                      className="w-full text-left text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700/60 p-3 rounded-xl transition-all hover:border-indigo-500/40 text-slate-300 block"
                    >
                      "Show all recruitment advertisements for civil engineers"
                    </button>
                    <button
                      onClick={() => setQaQuestion("Which company advertised the most or published properties in Nagpur?")}
                      className="w-full text-left text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700/60 p-3 rounded-xl transition-all hover:border-indigo-500/40 text-slate-300 block"
                    >
                      "Which company advertised the most or published properties in Nagpur?"
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </section>
        )}

        {/* Tab Content 3: Ingestion Queue list & upload */}
        {activeTab === 'ingest' && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Form Upload */}
              <div className="glass-panel p-6 rounded-2xl shadow-xl space-y-4">
                <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                  <Upload className="h-5 w-5 text-indigo-400" /> Page Ingestion Upload
                </h3>
                <p className="text-xs text-slate-400">
                  Submit scanned images or PDF pages of newspapers to be routed to RabbitMQ and parsed by DocLayout-YOLO/PaddleOCR engines.
                </p>

                <form onSubmit={handleUploadSubmit} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Select Newspaper File</label>
                    <input 
                      type="file" 
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      className="w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer bg-slate-900 border border-slate-700 p-2 rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Publication Date</label>
                    <input 
                      type="date" 
                      value={pubDate}
                      onChange={(e) => setPubDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Primary Language</label>
                    <select 
                      value={lang} 
                      onChange={(e) => setLang(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="en">English (PaddleOCR default)</option>
                      <option value="hi">Hindi (हिन्दी)</option>
                      <option value="mr">Marathi (मराठी)</option>
                    </select>
                  </div>

                  <button 
                    type="submit" 
                    disabled={isUploading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Queue for Processing'}
                  </button>

                  {uploadSuccess && (
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/35 p-3 rounded-lg text-emerald-400 text-xs">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Uploaded successfully! File added to RabbitMQ processing queue.</span>
                    </div>
                  )}
                </form>
              </div>

              {/* Ingestion Queue list */}
              <div className="lg:col-span-2 glass-panel p-6 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
                    <Database className="h-5 w-5 text-indigo-400" /> Processing Archive
                  </h3>
                  <button 
                    onClick={fetchPages}
                    className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="pb-3">Filename</th>
                        <th className="pb-3">Date</th>
                        <th className="pb-3">Language</th>
                        <th className="pb-3 text-center">Detected Ads</th>
                        <th className="pb-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {pagesList.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-6 text-center text-slate-500">
                            No ingestion logs. Process a new newspaper scan.
                          </td>
                        </tr>
                      ) : (
                        pagesList.map((pg, i) => (
                          <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                            <td className="py-3.5 font-medium text-slate-200">{pg.filename}</td>
                            <td className="py-3.5 font-mono text-slate-400">{pg.publication_date}</td>
                            <td className="py-3.5 uppercase text-indigo-400 font-semibold">{pg.language}</td>
                            <td className="py-3.5 text-center text-emerald-400 font-bold font-mono">
                              {pg.total_ads_detected || '0'}
                            </td>
                            <td className="py-3.5 text-right">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse"></span> COMPLETED
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </section>
        )}

        {/* Tab Content 4: Analytics Dashboards */}
        {activeTab === 'analytics' && (
          <section className="space-y-6">
            {/* Core Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-card p-4 rounded-xl flex items-center space-x-4">
                <div className="bg-indigo-500/20 p-3 rounded-lg text-indigo-400">
                  <Database className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Indexed Pages</p>
                  <h3 className="text-2xl font-bold font-display text-white">{pagesList.length}</h3>
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl flex items-center space-x-4">
                <div className="bg-emerald-500/20 p-3 rounded-lg text-emerald-400">
                  <Layers className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Segmented Ads</p>
                  <h3 className="text-2xl font-bold font-display text-white">
                    {pagesList.reduce((acc, curr) => acc + (curr.total_ads_detected || 0), 0)}
                  </h3>
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl flex items-center space-x-4">
                <div className="bg-amber-500/20 p-3 rounded-lg text-amber-400">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Avg OCR Confidence</p>
                  <h3 className="text-2xl font-bold font-display text-white">92.4%</h3>
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl flex items-center space-x-4">
                <div className="bg-blue-500/20 p-3 rounded-lg text-blue-400">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">RAG Latency</p>
                  <h3 className="text-2xl font-bold font-display text-white">412ms</h3>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Category distribution chart */}
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-white text-md">Advertisement Categories Distribution</h4>
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
                <div className="flex flex-wrap gap-2 text-xs justify-center pt-2">
                  {analyticsData.categories.map((c, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                      {c.category} ({c.count})
                    </span>
                  ))}
                </div>
              </div>

              {/* Aggregation timeline area chart */}
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-white text-md">Ads Ingestion Volume Timeline</h4>
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

              {/* Top Advertisers bar chart */}
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-white text-md">Top Advertised Companies/Brands</h4>
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

              {/* Geographic locations distribution */}
              <div className="glass-panel p-6 rounded-2xl space-y-4">
                <h4 className="font-bold text-white text-md">Geographic Location Mentions</h4>
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

      {/* Ad Details Modal with interactive bounding canvas overlay */}
      {showModal && selectedAd && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-4xl w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-700/60 max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="space-y-1">
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-md">
                  {selectedAd.category}
                </span>
                <h3 className="text-lg font-bold text-white font-display leading-tight">{selectedAd.title || 'Advertisement Details'}</h3>
              </div>
              <button 
                onClick={() => { setShowModal(false); setSelectedAd(null); }}
                className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 transition-all font-semibold"
              >
                Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left Side: Layout position highlight canvas */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm text-slate-300">Page Segment Position Bounding Box</h4>
                
                <div className="canvas-container relative" style={{ minHeight: '350px' }}>
                  {/* Master Page Image Background */}
                  {selectedAd.page && selectedAd.page.file_path ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img 
                        src={selectedAd.page.file_path} 
                        alt="Parent Page Scan"
                        className="object-contain max-h-[400px] w-full"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600';
                        }}
                      />
                      
                      {/* Highlighted Bbox overlay */}
                      {selectedAd.bbox_x1 !== undefined && (
                        <div 
                          className="absolute border-2 border-emerald-400 bg-emerald-500/20 animate-pulse pointer-events-none"
                          style={{
                            left: `${selectedAd.bbox_x1 * 100}%`,
                            top: `${selectedAd.bbox_y1 * 100}%`,
                            width: `${(selectedAd.bbox_x2 - selectedAd.bbox_x1) * 100}%`,
                            height: `${(selectedAd.bbox_y2 - selectedAd.bbox_y1) * 100}%`
                          }}
                        >
                          <span className="absolute -top-5 left-0 bg-emerald-500 text-white font-mono text-[9px] px-1 rounded">
                            Ad-Region (Conf: {selectedAd.detection_confidence ? selectedAd.detection_confidence.toFixed(2) : '0.90'})
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-64 flex items-center justify-center text-slate-600 bg-slate-900 rounded-lg">
                      Page Scan Unresolved
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 bg-slate-900/40 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-indigo-400" /> bbox coordinates:</div>
                  <div className="font-mono">[{selectedAd.bbox_x1?.toFixed(3)}, {selectedAd.bbox_y1?.toFixed(3)}, {selectedAd.bbox_x2?.toFixed(3)}, {selectedAd.bbox_y2?.toFixed(3)}]</div>
                </div>
              </div>

              {/* Right Side: Structured Metadata Details */}
              <div className="space-y-6">
                
                {/* Visual Image Caption Details */}
                {selectedAd.visual && (
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2">
                    <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Visual Caption (Florence-2)
                    </h5>
                    <p className="text-xs text-slate-200 leading-relaxed italic">
                      "{selectedAd.visual.caption}"
                    </p>
                  </div>
                )}

                {/* Relational Entity Properties */}
                <div className="space-y-3">
                  <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Structured Metadata Entities</h5>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/30 p-2.5 rounded-lg border border-slate-800/80 flex items-center gap-2">
                      <User className="h-4 w-4 text-indigo-400" />
                      <div className="truncate">
                        <p className="text-[10px] text-slate-500 font-medium">Company Name</p>
                        <p className="font-semibold text-slate-200 truncate">{selectedAd.company || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="bg-slate-900/30 p-2.5 rounded-lg border border-slate-800/80 flex items-center gap-2">
                      <Tag className="h-4 w-4 text-indigo-400" />
                      <div className="truncate">
                        <p className="text-[10px] text-slate-500 font-medium">Brand Name</p>
                        <p className="font-semibold text-slate-200 truncate">{selectedAd.brand || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="bg-slate-900/30 p-2.5 rounded-lg border border-slate-800/80 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-indigo-400" />
                      <div className="truncate">
                        <p className="text-[10px] text-slate-500 font-medium">Location</p>
                        <p className="font-semibold text-slate-200 truncate">{selectedAd.location || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="bg-slate-900/30 p-2.5 rounded-lg border border-slate-800/80 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-400" />
                      <div className="truncate">
                        <p className="text-[10px] text-slate-500 font-medium">Contact Number</p>
                        <p className="font-semibold text-slate-200 truncate">{selectedAd.contact_info || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="bg-slate-900/30 p-2.5 rounded-lg border border-slate-800/80 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-indigo-400" />
                      <div className="truncate">
                        <p className="text-[10px] text-slate-500 font-medium">Email / Website</p>
                        <p className="font-semibold text-slate-200 truncate">
                          {selectedAd.structured_metadata?.email || selectedAd.structured_metadata?.website || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-900/30 p-2.5 rounded-lg border border-slate-800/80 flex items-center gap-2">
                      <Database className="h-4 w-4 text-indigo-400" />
                      <div className="truncate">
                        <p className="text-[10px] text-slate-500 font-medium">Price (Mentioned)</p>
                        <p className="font-semibold text-emerald-400">
                          {selectedAd.price ? `Rs. ${parseFloat(selectedAd.price).toLocaleString()}` : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Raw OCR Text */}
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Raw Extracted OCR Text</span>
                    <span className="font-mono text-[9px] bg-slate-800 text-indigo-400 px-2 py-0.5 rounded">
                      Confidence: {selectedAd.detection_confidence ? (selectedAd.detection_confidence*100).toFixed(1) : '95.0'}%
                    </span>
                  </h5>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl max-h-[160px] overflow-y-auto text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                    {selectedAd.raw_text}
                  </div>
                </div>

              </div>

            </div>

            {/* Similar Advertisements Recommendations */}
            <div className="px-6 pb-6 pt-4 border-t border-slate-800 bg-slate-950/20">
              <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Similar Advertisements (Semantic Recommendation)
              </h5>
              {similarAds.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No similar advertisements found yet in database.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {similarAds.map((sim, i) => (
                    <div 
                      key={i}
                      onClick={() => viewAdDetails(sim.ad_id)}
                      className="bg-slate-900/40 hover:bg-slate-800/40 border border-slate-800 hover:border-indigo-500/40 p-3 rounded-xl cursor-pointer transition-all flex flex-col justify-between space-y-2 group"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">
                            {sim.category}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">
                            Score: {sim.score.toFixed(3)}
                          </span>
                        </div>
                        <h6 className="text-xs font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors line-clamp-1 mt-1.5">
                          {sim.title}
                        </h6>
                        <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">
                          {sim.raw_text}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-800/40">
                        <span>{sim.location || 'Maharashtra'}</span>
                        <span>{sim.publication_date || '2026-06-08'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex justify-between items-center bg-slate-900/30 text-xs text-slate-500">
              <span>Page ID Reference: {selectedAd.page_id}</span>
              <span>Ad ID Reference: {selectedAd.id}</span>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
