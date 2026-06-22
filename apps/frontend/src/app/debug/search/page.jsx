'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { 
  ShieldAlert, Database, AlertCircle, RefreshCw, ChevronRight, Play, Server, Clock, Code, Activity
} from 'lucide-react';

export default function DebugSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runDebugSearch = async () => {
    if (!query) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.get('/search', {
        params: { q: query, include_web: true }
      });
      setResults(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Failed execution");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-mono text-xs">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-ping"></div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">ProcureIntel /DEBUG Console</h1>
              <p className="text-slate-500 text-[10px]">Real-time pipeline diagnostics & query tracking</p>
            </div>
          </div>
          <span className="bg-slate-900 border border-slate-800 px-3 py-1 rounded text-slate-400">
            Node: seetech-fastapi-backend
          </span>
        </div>

        {/* Input Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-3 items-center">
          <input
            type="text"
            placeholder="Execute query for pipeline trace... e.g. 'Havells MCB 32A'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runDebugSearch(); }}
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 text-xs"
          />
          <button
            onClick={runDebugSearch}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded font-bold flex items-center gap-1.5 transition-colors"
          >
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            <span>TRACE</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-900/50 text-red-400 p-4 rounded-xl flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold">Execution Error</h5>
              <p className="mt-1 text-[11px] font-mono whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-500" />
            <p>Executing live search, querying indexes, and running classifier evaluations...</p>
          </div>
        )}

        {results && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: General Stats & SQL Queries */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Telemetry metrics overview */}
              {results.developer_telemetry && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-indigo-400 border-b border-slate-800 pb-2 flex items-center">
                    <Activity className="h-4 w-4 mr-1.5" /> Transaction Metadata
                  </h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[11px]">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-900">
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">API Latency</span>
                      <span className="text-slate-100 text-sm font-bold">{results.developer_telemetry.api_response_time_ms} ms</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-900">
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Cache Status</span>
                      <span className="text-slate-100 text-sm font-bold">{results.developer_telemetry.cache_hits ? 'HIT' : 'MISS'}</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-900">
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Result Count</span>
                      <span className="text-slate-100 text-sm font-bold">{results.all_results?.length || 0} items</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-900">
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Search ID</span>
                      <span className="text-slate-100 text-sm font-bold">#{results.search_meta?.search_id}</span>
                    </div>
                  </div>

                  {/* SQL Queries */}
                  <div className="space-y-2">
                    <span className="text-slate-500 text-[10px] font-bold uppercase">Captured SQL Queries</span>
                    <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 space-y-1.5 font-mono text-[10px] text-slate-350">
                      {results.developer_telemetry.sql_queries?.map((q, idx) => (
                        <div key={idx} className="pb-1.5 border-b border-slate-900/50 last:border-0">
                          <span className="text-indigo-400">Query {idx + 1}:</span> {q}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Card Level Metrics */}
              {results.developer_telemetry && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-indigo-400 border-b border-slate-800 pb-2 flex items-center">
                    <Code className="h-4 w-4 mr-1.5" /> Card Level Scoring
                  </h3>
                  
                  <div className="overflow-x-auto text-[10px]">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-500 uppercase font-bold">
                          <th className="pb-2">ID</th>
                          <th className="pb-2">Similarity</th>
                          <th className="pb-2">Priority</th>
                          <th className="pb-2">Composite Rank Key</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {results.all_results?.map((r) => {
                          const score = results.developer_telemetry.similarity_scores?.[r.id];
                          const priority = results.developer_telemetry.source_priorities?.[r.id];
                          const rankKey = results.developer_telemetry.ranking_scores?.[r.id];
                          return (
                            <tr key={r.id} className="hover:bg-slate-950/40">
                              <td className="py-2 text-slate-300 font-bold">{r.id.substring(0, 18)}...</td>
                              <td className="py-2 text-emerald-400 font-bold">{(score * 100).toFixed(1)}%</td>
                              <td className="py-2 text-slate-400">Priority {priority}</td>
                              <td className="py-2 font-mono text-indigo-300">[{rankKey?.join(', ')}]</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>

            {/* Right: LLM Grounding Stats & Logs */}
            <div className="space-y-6">
              
              {/* Gemini usage stats */}
              {results.developer_telemetry && results.developer_telemetry.gemini_stats && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-indigo-400 border-b border-slate-800 pb-2 flex items-center">
                    <Server className="h-4 w-4 mr-1.5" /> LLM Grounding Stats
                  </h3>
                  
                  <div className="space-y-2 text-[11px]">
                    <div className="flex justify-between border-b border-slate-950 pb-1">
                      <span className="text-slate-500">Gemini LLM calls</span>
                      <span className="text-indigo-400 font-bold">{results.developer_telemetry.gemini_stats.calls}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-950 pb-1">
                      <span className="text-slate-500">Model Name</span>
                      <span className="text-slate-350">{results.developer_telemetry.gemini_stats.model}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-950 pb-1">
                      <span className="text-slate-500">Input Token Count</span>
                      <span className="text-indigo-400">{results.developer_telemetry.gemini_stats.input_tokens} tokens</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-slate-500">Output Token Count</span>
                      <span className="text-indigo-400">{results.developer_telemetry.gemini_stats.output_tokens} tokens</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings and errors log */}
              {results.developer_telemetry && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-indigo-400 border-b border-slate-800 pb-2 flex items-center">
                    <ShieldAlert className="h-4 w-4 mr-1.5" /> Warnings & Errors
                  </h3>
                  <div className="space-y-1.5 text-[11px]">
                    {results.developer_telemetry.errors?.map((err, i) => (
                      <div key={i} className="text-red-400">✗ ERROR: {err}</div>
                    ))}
                    {results.developer_telemetry.warnings?.map((warn, i) => (
                      <div key={i} className="text-amber-400">! WARN: {warn}</div>
                    ))}
                    {(!results.developer_telemetry.errors?.length && !results.developer_telemetry.warnings?.length) && (
                      <span className="text-slate-500 italic">No errors/warnings detected.</span>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
