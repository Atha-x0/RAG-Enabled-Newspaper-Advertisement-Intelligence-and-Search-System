'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Upload, Database, FileText, BarChart3, HelpCircle, 
  MapPin, Tag, Calendar, User, Phone, Globe, Layers, AlertCircle,
  Loader2, RefreshCw, Send, CheckCircle2, ChevronRight, Sparkles,
  ArrowRightLeft, ShieldAlert, ShoppingBag, ShieldCheck, Star, 
  Clock, Truck, Check, Plus, Trash2, Edit3, Hexagon, Bell, Sun, Moon, Menu, X, ChevronDown, CheckCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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

  // Search & Filtering State (Applied parameters for Query)
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [sortBy, setSortBy] = useState('Relevance');

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
    data: products = [], 
    isLoading: isProductsLoading, 
    isError: isProductsError, 
    refetch: refetchProducts 
  } = useQuery({
    queryKey: ['products', appliedQuery, appliedCategory, appliedBrand, appliedLocation, appliedPrice, sortBy],
    queryFn: async () => {
      // If we have a query, use /search. Otherwise use /products.
      const url = appliedQuery ? "/search" : "/products";
      const res = await api.get(url, {
        params: {
          q: appliedQuery || undefined,
          brand: appliedBrand || undefined,
          category: appliedCategory || undefined
        }
      });

      let results = [];
      if (res.data && typeof res.data === 'object' && Array.isArray(res.data.results)) {
        results = res.data.results;
      } else {
        results = Array.isArray(res.data) ? res.data : [];
      }

      // Filter by location dynamically in frontend since backend /products and /search filter by brand/category/query but location is inside offers!
      if (appliedLocation) {
        results = results.filter(p => {
          return p.offers && p.offers.some(o => o.dealer_location && o.dealer_location.toLowerCase().includes(appliedLocation.toLowerCase()));
        });
      }

      // Filter by price (min_price <= appliedPrice)
      if (appliedPrice < 100000) {
        results = results.filter(p => p.min_price <= appliedPrice);
      }

      // Sorting
      if (sortBy === 'Price Low to High') {
        results.sort((a, b) => (a.min_price || 0) - (b.min_price || 0));
      } else if (sortBy === 'Price High to Low') {
        results.sort((a, b) => (b.min_price || 0) - (a.min_price || 0));
      } else if (sortBy === 'Delivery Time') {
        results.sort((a, b) => {
          const aDays = a.offers?.length ? Math.min(...a.offers.map(o => o.delivery_time_days || 3)) : 3;
          const bDays = b.offers?.length ? Math.min(...b.offers.map(o => o.delivery_time_days || 3)) : 3;
          return aDays - bDays;
        });
      } else if (sortBy === 'Newest') {
        results.sort((a, b) => b.id.localeCompare(a.id));
      }

      return results;
    }
  });

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
                className={`flex items-center w-full px-4 py-3 text-sm font-semibold rounded-2xl transition-smooth ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
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
                    type="text"
                    placeholder="Search industrial products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-smooth"
                  />
                </div>
                <button
                  onClick={() => setAppliedQuery(searchQuery)}
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
                <h3 className="text-xl font-bold text-slate-900">
                  Available Industrial Products ({products.length} {products.length === 1 ? 'item' : 'items'} cataloged)
                </h3>
                <div className="flex items-center space-x-2 shrink-0">
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

              {/* Loading, Error, Empty & Products Results Grid */}
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
              ) : products.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm max-w-md mx-auto">
                  <Database className="h-12 w-12 text-slate-350 mx-auto" />
                  <h4 className="text-lg font-bold text-slate-900">No matching industrial products found</h4>
                  <p className="text-sm text-slate-500">No parts catalogs matching the search terms or filters are currently indexed in local stores.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {products.map((product) => (
                    <ProductCard 
                      key={product.id}
                      product={product} 
                      onViewDetails={(id) => { setSelectedProductId(id); setShowProductModal(true); }}
                      onToggleCompare={handleToggleCompare}
                      inCompareList={compareList.includes(product.id)}
                    />
                  ))}
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
  // Gallery states
  const mainImage = product.image_url || 'https://images.unsplash.com/photo-1597484211616-396f17e3978c?q=80&w=400';
  const galleryImages = [
    mainImage,
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?q=80&w=400',
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=400',
    'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?q=80&w=400'
  ];
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  // Specifications
  const getSpec = (key) => {
    if (!product.specifications) return 'N/A';
    return product.specifications[key] || product.specifications[key.toLowerCase()] || 'N/A';
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[24px] p-6 shadow-sm flex flex-col lg:flex-row gap-6 hover:shadow-md transition-smooth">
      {/* Column 1: Image Gallery */}
      <div className="w-full lg:w-[260px] flex flex-col space-y-3 shrink-0">
        <div className="aspect-[16/9] w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50">
          <img 
            src={galleryImages[activeImgIndex]} 
            alt={product.name} 
            className="w-full h-full object-cover" 
          />
        </div>
        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          {galleryImages.map((img, i) => (
            <button
              key={i}
              onClick={() => setActiveImgIndex(i)}
              className={`h-11 w-11 rounded-lg overflow-hidden border shrink-0 transition-smooth ${activeImgIndex === i ? 'border-2 border-blue-600' : 'border-slate-200'}`}
            >
              <img src={img} alt="thumbnail" className="h-full w-full object-cover" />
            </button>
          ))}
          <button className="h-11 w-11 rounded-lg border border-slate-200 flex items-center justify-center shrink-0 hover:bg-slate-50">
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Column 2: Details & Specs */}
      <div className="flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="bg-blue-50 text-blue-600 rounded px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">
              {product.category || 'Electric Motors'}
            </span>
          </div>
          <h4 
            onClick={() => onViewDetails(product.id)}
            className="text-xl font-bold text-slate-900 cursor-pointer hover:text-blue-600 transition-smooth leading-tight"
          >
            {product.name}
          </h4>
          <p className="text-xs text-slate-500 font-semibold">
            Brand: {product.brand || 'Siemens'} <span className="text-slate-300 mx-2">|</span> Model: {product.model_number || '1LE7103-0EA42-2AA4'}
          </p>
          <p className="text-sm text-slate-650 line-clamp-2 leading-relaxed">
            {product.description || 'No descriptive summary is currently indexed for this industrial equipment.'}
          </p>
        </div>
        {/* Horizontal Specifications blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200/50 rounded-2xl p-3.5 mt-4">
          {[
            { label: 'Power', key: 'Power' },
            { label: 'Voltage', key: 'Voltage' },
            { label: 'Frequency', key: 'Frequency' },
            { label: 'Efficiency', key: 'Efficiency' }
          ].map((spec) => (
            <div key={spec.label} className="border-r border-slate-200 last:border-0 pr-3">
              <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">{spec.label}</span>
              <span className="text-xs font-bold text-slate-800 font-mono leading-tight block">{getSpec(spec.key)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Column 3: Price & Actions */}
      <div className="w-full lg:w-[220px] flex flex-col justify-between shrink-0 pl-0 lg:pl-4 py-1">
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Cheapest Deal Starts At</span>
          <div className="flex items-baseline space-x-1">
            <span className="text-3xl font-extrabold text-slate-900 font-mono leading-none">
              ₹{product.min_price > 0 ? product.min_price.toLocaleString() : '13,800'}
            </span>
          </div>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Excl. GST</span>
        </div>

        <div className="space-y-2 mt-4 lg:mt-0">
          <button
            onClick={() => onViewDetails(product.id)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center transition-smooth shadow-sm"
          >
            <Tag className="h-4 w-4 mr-2" />
            Get Offers
          </button>
          
          <button
            onClick={() => onToggleCompare(product.id)}
            className={`w-full py-2.5 font-bold text-xs rounded-xl flex items-center justify-center transition-smooth border ${inCompareList ? 'bg-blue-50 border-blue-600 text-blue-600' : 'bg-white border-blue-600 text-blue-600 hover:bg-blue-50'}`}
          >
            {inCompareList ? <Check className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {inCompareList ? 'Compared' : 'Compare'}
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
                Supplied by <span className="font-semibold text-slate-800">{compareData.highlights.cheapest_overall.dealer}</span> for a total of <span className="font-bold font-mono text-emerald-600">₹{compareData.highlights.cheapest_overall.total_cost.toLocaleString()}</span> (Price + Shipping).
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
                          <p className="font-extrabold font-mono text-slate-900 text-base">₹{p.best_price_offer.price.toLocaleString()}</p>
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
                          `₹${p.best_price_offer.shipping_charges.toLocaleString()}`
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
                          <p className="font-mono text-base">₹{p.best_price_offer.total_cost.toLocaleString()}</p>
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

// AdminConsole Sub-component
function AdminConsole({ onEdit, onDelete, onTriggerCreate }) {
  const queryClient = useQueryClient();
  const [adminTab, setAdminTab] = useState('products'); // 'products', 'dealers', 'sources', 'logs'
  const [isReindexing, setIsReindexing] = useState(false);

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

  // Separate Logs Endpoint query
  const { data: scrapeLogs = [] } = useQuery({
    queryKey: ['adminLogs'],
    queryFn: async () => {
      const res = await api.get('/logs');
      return res.data;
    }
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

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      
      {/* Sub-tabs header */}
      <div className="flex items-center justify-between border-b border-slate-150 pb-3 flex-wrap gap-4">
        <div className="flex space-x-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
          {[
            { id: 'products', label: 'Products Catalog' },
            { id: 'dealers', label: 'Dealer Registry' },
            { id: 'sources', label: 'Crawl Seeds' },
            { id: 'logs', label: 'Scraper Logs' }
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
                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors"
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
                  <td className="py-4.5 text-slate-600">{d.email || 'N/A'}</td>
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
                <th className="pb-3">Cron Schedule</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(scrapersData.sources || []).map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="py-4 font-semibold text-slate-800">{s.name}</td>
                  <td className="py-4 font-mono text-slate-500 truncate max-w-[200px]" title={s.crawling_url}>{s.crawling_url}</td>
                  <td className="py-4">
                    <span className="bg-blue-50 text-blue-600 border border-blue-100 font-bold text-[9px] uppercase px-2 py-0.5 rounded">
                      {s.source_type}
                    </span>
                  </td>
                  <td className="py-4 font-mono text-slate-500">{s.cron_schedule}</td>
                  <td className="py-4 text-right">
                    <button
                      onClick={async () => {
                        alert("Scrape triggered on background crawlers!");
                      }}
                      className="bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-100 font-bold text-[10px] px-3 py-1.5 rounded-lg transition-smooth"
                    >
                      Trigger Scrape
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Logs Table */}
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
              {scrapeLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50">
                  <td className="py-3 text-slate-500 font-mono text-[10px]">
                    {log.downloaded_at ? new Date(log.downloaded_at).toLocaleString() : 'N/A'}
                  </td>
                  <td className="py-3 text-slate-600 font-mono">{log.publication_date}</td>
                  <td className="py-3 text-slate-650 font-mono truncate max-w-[200px]" title={log.source_url}>{log.source_url}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold ${log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-3 text-right text-slate-500 font-mono">{log.error_message || 'OK'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      </div>
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
          { label: 'Ad Scraping rate', value: '98.5%', color: 'bg-indigo-500/10 text-indigo-600', icon: Sparkles }
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
            className="text-slate-400 hover:text-slate-900 p-2 rounded-full hover:bg-slate-100 transition-colors"
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
                        <div className="truncate">Web: <a href={offer.dealer.website_url} target="_blank" className="text-blue-600 hover:underline">{offer.dealer.website_url ? 'Catalog' : 'N/A'}</a></div>
                        <div className="truncate">Email: <span className="text-slate-700">{offer.dealer.email || 'N/A'}</span></div>
                      </div>

                      <div className="flex items-center space-x-4 text-[11px] font-semibold text-slate-700 pt-1">
                        <span className="flex items-center"><Phone className="h-3.5 w-3.5 text-blue-600 mr-1.5" />{offer.dealer.phone || 'N/A'}</span>
                        {offer.dealer.whatsapp && <a href={`https://wa.me/${offer.dealer.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" className="text-emerald-600 hover:underline">WhatsApp Link</a>}
                      </div>
                    </div>

                    <div className="text-right shrink-0 bg-white border border-slate-200/60 p-3 rounded-2xl min-w-[160px] shadow-sm">
                      <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Base Price</div>
                      <div className="font-mono text-xs font-semibold text-slate-700">₹{offer.price.toLocaleString()}</div>
                      
                      <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mt-1">Shipping Fees</div>
                      <div className="font-mono text-xs font-semibold text-slate-700">{offer.shipping_charges === 0 ? 'FREE' : `₹${offer.shipping_charges.toLocaleString()}`}</div>
                      
                      <div className="text-[9px] text-slate-500 uppercase font-extrabold tracking-wider mt-2 border-t border-slate-100 pt-1">Total Cost</div>
                      <div className="font-mono text-sm font-extrabold text-emerald-600">₹{offer.total_cost.toLocaleString()}</div>
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
