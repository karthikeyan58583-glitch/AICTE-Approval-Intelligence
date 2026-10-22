'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

export function StageDistributionChart() {
  // Chart data derived strictly from the mock data source
  const chartData = MOCK_DASHBOARD_DATA.stages.map((s) => ({
    name: s.shortName,
    fullName: s.stageName,
    count: s.count,
    avgDays: s.avgDurationDays,
    benchmark: s.benchmarkDays,
    risk: s.riskStatus,
  }));

  const getBarColor = (risk: string) => {
    switch (risk) {
      case 'high_bottleneck':
        return '#f43f5e'; // Rose / red for severe bottleneck
      case 'moderate':
        return '#f59e0b'; // Amber for warning
      default:
        return '#0d9488'; // Teal for healthy
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      {/* Header and metadata */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Stage-Wise Application Distribution &amp; Pipeline Latency
            </h2>
            <span className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200">
              Active Workflow
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time pipeline volume across the 5 statutory AICTE approval phases with SLA benchmark comparisons.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-teal-600"></span>
            <span>Normal SLA</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-amber-500"></span>
            <span>Moderate Delay</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-xs bg-rose-500"></span>
            <span>Bottleneck Hotspot</span>
          </div>
        </div>
      </div>

      {/* Main Chart Section */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recharts Bar Visualization */}
        <div className="lg:col-span-2 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg text-xs">
                        <p className="font-bold text-slate-900">{data.fullName}</p>
                        <p className="text-teal-700 font-semibold mt-1">
                          Count: {data.count} applications
                        </p>
                        <p className="text-slate-600">
                          Average Duration: <strong>{data.avgDays} days</strong> (Target:{' '}
                          {data.benchmark} days)
                        </p>
                        {data.risk === 'high_bottleneck' && (
                          <p className="text-rose-600 font-semibold mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5" /> High Bottleneck Variance (+
                            {(data.avgDays - data.benchmark).toFixed(1)} days)
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.risk)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stage Metric Breakdown Cards */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {MOCK_DASHBOARD_DATA.stages.map((stage) => {
            const isBottleneck = stage.riskStatus === 'high_bottleneck';
            return (
              <div
                key={stage.stageNumber}
                className={cn(
                  'rounded-lg border p-2.5 text-xs transition-colors',
                  isBottleneck
                    ? 'border-rose-300 bg-rose-50/50'
                    : 'border-slate-200 bg-slate-50/60'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    {stage.stageName}
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-xs bg-white px-2 py-0.5 rounded border border-slate-200">
                    {stage.count}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-400" />
                    Avg: <strong>{stage.avgDurationDays}d</strong> / Target: {stage.benchmarkDays}d
                  </span>
                  {isBottleneck ? (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                      <AlertCircle className="h-3 w-3" /> Delay Hotspot
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Within SLA
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
