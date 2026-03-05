import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar
} from 'recharts';
import { motion } from 'framer-motion';
import { AdminDashboardOverview } from '@/types';

interface AdvancedAnalyticsProps {
  data: AdminDashboardOverview['advancedAnalytics'];
  dateRangeLabel?: string;
}

interface TooltipPayloadItem {
  name?: string;
  value?: number | string | Array<number | string>;
  color?: string;
}

interface TooltipContentProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

const AdvancedAnalytics: React.FC<AdvancedAnalyticsProps> = ({ data, dateRangeLabel = 'Overview' }) => {
  const { performance, source, location, course } = data;

  // Custom Tooltip for Area Chart
  const CustomTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 rounded-lg shadow-xl text-xs sm:text-sm">
          <p className="font-semibold mb-2 text-zinc-700 dark:text-zinc-200">{label}</p>
          {payload.map((entry: TooltipPayloadItem, index: number) => (
            <div key={index} className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-zinc-500 dark:text-zinc-400 capitalize">{entry.name ?? ''}:</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{entry.value ?? ''}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-hidden">
      
      {/* 1. Performance Over Time */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-secondary-900 rounded-xl p-3 border border-secondary-200 dark:border-secondary-800 shadow-sm h-[280px] flex flex-col"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-secondary-900 dark:text-white text-xs sm:text-sm">Performance Over Time</h3>
          <span className="text-[10px] font-medium text-secondary-500 bg-secondary-100 dark:bg-secondary-800 px-1.5 py-0.5 rounded-md">
            {dateRangeLabel}
          </span>
        </div>
        
        <div className="flex items-center gap-3 text-[10px] mb-2">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#4F46E5]"></span>
            <span className="text-secondary-600 dark:text-secondary-400">Enquiries</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#4338CA]"></span>
            <span className="text-secondary-600 dark:text-secondary-400">Admissions</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#818CF8]"></span>
            <span className="text-secondary-600 dark:text-secondary-400">Conversions</span>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={performance} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorInquiries" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorAdmissions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4338CA" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#4338CA" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818CF8" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 9, fill: '#6B7280' }} 
                tickLine={false}
                axisLine={false}
                dy={5}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 9, fill: '#6B7280' }} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="inquiries" 
                stroke="#4F46E5" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorInquiries)" 
                activeDot={{ r: 4, strokeWidth: 0, fill: '#4338CA' }}
              />

              <Area 
                type="monotone" 
                dataKey="admissions" 
                stroke="#4338CA" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorAdmissions)" 
              />
              <Area 
                type="monotone" 
                dataKey="conversions" 
                stroke="#818CF8" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorConversions)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* 2. Source & Channel Insights */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-secondary-900 rounded-xl p-3 border border-secondary-200 dark:border-secondary-800 shadow-sm h-[280px] flex flex-col"
      >
        <h3 className="font-bold text-secondary-900 dark:text-white mb-2 text-xs sm:text-sm">Source & Channel Insights</h3>
        
        <div className="flex flex-1 items-center gap-2">
          <div className="w-[45%] h-full relative">
             <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={source}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {source.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  content={({ active, payload }: TooltipContentProps) => {
                    if (active && payload?.[0]) {
                       return (
                         <div className="bg-white dark:bg-zinc-900 p-1.5 rounded shadow-lg border text-[10px]">
                           <span className="font-bold">{payload[0].name}</span>: {payload[0].value}
                         </div>
                       )
                    }
                    return null;
                  }}
                />
              </PieChart>
             </ResponsiveContainer>
             {/* Center Text */}
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <span className="text-xl font-bold text-secondary-900 dark:text-white">
                    {source.reduce((acc, curr) => acc + curr.value, 0)}
                  </span>
                </div>
             </div>
          </div>
          
          <div className="w-[55%] overflow-y-auto max-h-[220px] scrollbar-thin pr-1">
             <div className="text-[10px] font-medium text-right text-secondary-500 mb-1">Conversion Rate</div>
             <div className="space-y-2">
               {source.map((item) => (
                 <div key={item.name} className="flex items-center justify-between group">
                   <div className="flex items-center gap-1.5 min-w-0">
                     <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                     <span className="text-[10px] text-secondary-700 dark:text-secondary-300 truncate max-w-[60px]" title={item.name}>{item.name}</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1 bg-[#FFE8D6] dark:bg-secondary-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ width: `${Math.min(item.conversionRate, 100)}%`, backgroundColor: item.color }} 
                        />
                      </div>
                      <span className="text-[10px] font-bold text-secondary-900 dark:text-white w-6 text-right">{item.conversionRate}%</span>
                   </div>
                 </div>
               ))}
             </div>
          </div>
        </div>
      </motion.div>

      {/* 3. Location & Center Analytics */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-secondary-900 rounded-xl p-3 border border-secondary-200 dark:border-secondary-800 shadow-sm h-[280px] flex flex-col"
      >
        <h3 className="font-bold text-secondary-900 dark:text-white mb-2 text-xs sm:text-sm">Location Analytics</h3>
        
        <div className="grid grid-cols-12 gap-1 text-[10px] font-medium text-secondary-500 mb-1 px-1">
          <div className="col-span-4">City</div>
          <div className="col-span-3 text-center">Enquiry</div>
          <div className="col-span-5 text-right">Conversion Rate</div>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 space-y-1.5">
          {location.map((loc) => {
            const maxInquiries = Math.max(...location.map(l => l.inquiries));
            const intensity = Math.min((loc.inquiries / (maxInquiries || 1)), 1);
            
            return (
              <div key={loc.city} className="grid grid-cols-12 gap-1 items-center text-[10px]">
                <div className="col-span-4 font-medium text-secondary-900 dark:text-white truncate" title={loc.city}>
                  {loc.city}
                </div>
                
                <div className="col-span-3">
                   <div 
                    className="py-0.5 px-1 rounded text-center text-white font-medium transition-all text-[10px]"
                    style={{ 
                      backgroundColor: `rgba(244, 122, 31, ${0.4 + (intensity * 0.6)})`
                    }}
                   >
                     {loc.inquiries}
                   </div>
                </div>
                
                <div className="col-span-5 flex items-center justify-end gap-1.5">
                   <div className="w-10 h-1.5 bg-[#FFE8D6] dark:bg-secondary-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-linear-to-r from-[#4F46E5] to-[#818CF8]" 
                        style={{ width: `${Math.min(loc.conversionRate, 100)}%` }} 
                      />
                   </div>
                   <span className="text-secondary-700 dark:text-secondary-300 w-6 text-right">{loc.conversionRate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* 4. Course / Product Analytics */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-secondary-900 rounded-xl p-3 border border-secondary-200 dark:border-secondary-800 shadow-sm h-[280px] flex flex-col"
      >
        <h3 className="font-bold text-secondary-900 dark:text-white mb-2 text-xs sm:text-sm">Course Analytics</h3>
        
        <div className="flex items-center justify-center gap-3 text-[10px] mb-2">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#4F46E5]"></span>
            <span className="text-secondary-600 dark:text-secondary-400">Enquiry</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#818CF8]"></span>
            <span className="text-secondary-600 dark:text-secondary-400">Conversions</span>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={course} 
              margin={{ top: 0, right: 0, left: -25, bottom: 20 }}
              barSize={12} 
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 9, fill: '#6B7280' }} 
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                dy={5}
                height={30}
              />
              <YAxis 
                tick={{ fontSize: 9, fill: '#6B7280' }} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                content={({ active, payload, label }: TooltipContentProps) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white dark:bg-zinc-900 p-1.5 border rounded shadow-lg text-[10px]">
                        <p className="font-semibold mb-0.5">{label}</p>
                        <p className="text-[#4F46E5]">Enquiries: {payload[0].value}</p>
                        <p className="text-[#818CF8]">Conversions: {payload[1].value}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="inquiries" fill="#4F46E5" radius={[2, 2, 0, 0]} />
              <Bar dataKey="conversions" fill="#818CF8" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

    </div>
  );
};

export default AdvancedAnalytics;
