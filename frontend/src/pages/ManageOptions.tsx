import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Plus, Save, Trash2, Edit2, X, ChevronDown, Tag, Check } from 'lucide-react';
import apiService from '@/services/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils/cn';

const ListEditor: React.FC<{
  title: string;
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
  description?: string;
}> = ({ title, values, onChange, placeholder, description }) => {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (values.includes(v)) return;
    onChange([...values, v]);
    setInput('');
  };
  const remove = (v: string) => onChange(values.filter(x => x !== v));
  return (
    <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-secondary-200 dark:border-secondary-700 overflow-hidden">
      <div className="p-6 border-b border-secondary-100 dark:border-secondary-700/50">
        <h2 className="text-xl font-bold text-secondary-900 dark:text-white">{title}</h2>
        {description && <p className="text-sm text-secondary-600 dark:text-gray-400 mt-1">{description}</p>}
      </div>
      <div className="p-6 space-y-6">
        <div className="flex gap-3">
          <input 
            className="flex-1 px-4 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900/50 text-secondary-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none" 
            placeholder={placeholder} 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} 
          />
          <button 
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors flex items-center justify-center shadow-sm active:translate-y-px" 
            onClick={add}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {values.map(v => (
            <motion.span 
              layout
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              key={v} 
              className="inline-flex items-center px-4 py-2 rounded-lg bg-secondary-50 dark:bg-secondary-600 text-sm font-medium text-secondary-700 dark:text-gray-100 border border-secondary-200 dark:border-secondary-500 group hover:border-primary-200 dark:hover:border-primary-800 transition-colors"
            >
              {v}
              <button 
                className="ml-2 text-secondary-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all group-hover:opacity-100" 
                onClick={() => remove(v)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </motion.span>
          ))}
          {values.length === 0 && (
             <div className="text-center w-full py-8 text-secondary-500 dark:text-gray-400 italic text-sm border-2 border-dashed border-secondary-200 dark:border-secondary-700 rounded-lg">
                No items added yet. Start by adding one above.
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface LeadStage {
  label: string;
  subStages: string[];
  color: string;
}

// Available colors for lead stages
const AVAILABLE_COLORS = [
  { value: 'gray', label: 'Gray', bgClass: 'bg-gray-100 dark:bg-gray-900', textClass: 'text-gray-800 dark:text-gray-200' },
  { value: 'red', label: 'Red', bgClass: 'bg-red-100 dark:bg-red-900', textClass: 'text-red-800 dark:text-red-200' },
  { value: 'orange', label: 'Orange', bgClass: 'bg-orange-100 dark:bg-orange-900', textClass: 'text-orange-800 dark:text-orange-200' },
  { value: 'yellow', label: 'Yellow', bgClass: 'bg-yellow-100 dark:bg-yellow-900', textClass: 'text-yellow-800 dark:text-yellow-200' },
  { value: 'green', label: 'Green', bgClass: 'bg-emerald-100 dark:bg-emerald-900', textClass: 'text-emerald-800 dark:text-emerald-200' },
  { value: 'teal', label: 'Teal', bgClass: 'bg-teal-100 dark:bg-teal-900', textClass: 'text-teal-800 dark:text-teal-200' },
  { value: 'blue', label: 'Blue', bgClass: 'bg-indigo-100 dark:bg-indigo-900', textClass: 'text-indigo-800 dark:text-indigo-200' },
  { value: 'purple', label: 'Purple', bgClass: 'bg-purple-100 dark:bg-purple-900', textClass: 'text-purple-800 dark:text-purple-200' },
  { value: 'pink', label: 'Pink', bgClass: 'bg-pink-100 dark:bg-pink-900', textClass: 'text-pink-800 dark:text-pink-200' },
];

const LeadStagesEditor: React.FC<{
  leadStages: LeadStage[];
  onChange: (stages: LeadStage[]) => void;
}> = ({ leadStages, onChange }) => {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [editingStageIndex, setEditingStageIndex] = useState<number | null>(null);
  const [editingStageOriginalLabel, setEditingStageOriginalLabel] = useState<string | null>(null);
  const [newStageLabel, setNewStageLabel] = useState('');
  const [newSubStage, setNewSubStage] = useState<{ [key: string]: string }>({});

  
  // Get color classes for a color value
  const getColorClasses = (color: string) => {
    const colorConfig = AVAILABLE_COLORS.find(c => c.value === color);
    return colorConfig || AVAILABLE_COLORS.find(c => c.value === 'gray')!;
  };

  const toggleExpand = (label: string) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedStages(newExpanded);
  };

  const addStage = () => {
    if (!newStageLabel.trim()) {
      toast.error('Please enter a lead stage name');
      return;
    }
    if (leadStages.some(s => s.label === newStageLabel.trim())) {
      toast.error('Lead stage with this name already exists');
      return;
    }
    onChange([...leadStages, { 
      label: newStageLabel.trim(), 
      subStages: [],
      color: 'gray'
    }]);
    setNewStageLabel('');
  };
  
  const updateStageColor = (stageLabel: string, color: string) => {
    onChange(leadStages.map(s => 
      s.label === stageLabel ? { ...s, color } : s
    ));
  };

  const updateStage = (oldLabel: string, newLabel: string, currentIndex: number) => {
    if (!newLabel.trim()) {
      toast.error('Lead stage name cannot be empty');
      return;
    }
    // Check if another stage (not the current one being edited) has the same label
    if (newLabel.trim() !== oldLabel && leadStages.some((s, idx) => idx !== currentIndex && s.label === newLabel.trim())) {
      toast.error('Lead stage with this name already exists');
      return;
    }
    onChange(leadStages.map(s => s.label === oldLabel ? { ...s, label: newLabel.trim() } : s));
    setEditingStageIndex(null);
    setEditingStageOriginalLabel(null);
  };

  const deleteStage = (label: string) => {
    if (confirm('Are you sure you want to delete this lead stage?')) {
      onChange(leadStages.filter(s => s.label !== label));
    }
  };

  const addSubStage = (stageLabel: string) => {
    const subStageValue = newSubStage[stageLabel]?.trim();
    if (!subStageValue) return;
    const stage = leadStages.find(s => s.label === stageLabel);
    if (stage && stage.subStages.includes(subStageValue)) {
      toast.error('This sub-stage already exists');
      return;
    }
    onChange(leadStages.map(s => 
      s.label === stageLabel 
        ? { ...s, subStages: [...s.subStages, subStageValue] }
        : s
    ));
    setNewSubStage({ ...newSubStage, [stageLabel]: '' });
  };

  const removeSubStage = (stageLabel: string, subStage: string) => {
    onChange(leadStages.map(s => 
      s.label === stageLabel 
        ? { ...s, subStages: s.subStages.filter(sub => sub !== subStage) }
        : s
    ));
  };

  return (
    <div className="bg-white dark:bg-secondary-800 rounded-xl shadow-sm border border-secondary-200 dark:border-secondary-700 overflow-hidden">
      <div className="p-6 border-b border-secondary-100 dark:border-secondary-700/50 bg-linear-to-r from-primary-50/50 to-transparent dark:from-primary-900/10 dark:to-transparent">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary-100 dark:bg-primary-900/20 rounded-xl">
             <Tag className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-secondary-900 dark:text-white">Lead Stages Configuration</h2>
            <p className="text-sm text-secondary-600 dark:text-gray-400 mt-1">Define sales pipeline stages, their colors, and associated sub-stages.</p>
          </div>
        </div>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Add New Stage - Enhanced */}
        <div className="bg-secondary-50 dark:bg-secondary-900/30 rounded-xl p-5 border border-secondary-200 dark:border-secondary-700 shadow-sm">
          <label className="block text-sm font-semibold text-secondary-700 dark:text-secondary-300 mb-2">Add New Pipeline Stage</label>
          <div className="flex gap-3">
            <input
              className="flex-1 px-4 py-2.5 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-800 text-secondary-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
              placeholder="e.g. New Inquiry, Attempted to Contact..."
              value={newStageLabel}
              onChange={(e) => setNewStageLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addStage(); }}
            />
            <button className="px-6 py-2.5 bg-secondary-900 dark:bg-white text-white dark:text-secondary-900 hover:bg-secondary-800 dark:hover:bg-secondary-100 rounded-lg transition-colors font-medium flex items-center shadow-lg shadow-gray-200 dark:shadow-none" onClick={addStage}>
              <Plus className="h-5 w-5 mr-2" />
              Add Stage
            </button>
          </div>
        </div>

        {/* Existing Stages - Redesigned */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-base font-bold text-secondary-800 dark:text-gray-100">
              Active Stages ({leadStages.length})
            </h3>
            {leadStages.length > 0 && (
              <button
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium px-3 py-1.5 rounded-full hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                onClick={() => {
                  const allExpanded = leadStages.every(s => expandedStages.has(s.label));
                  if (allExpanded) {
                    setExpandedStages(new Set());
                  } else {
                    setExpandedStages(new Set(leadStages.map(s => s.label)));
                  }
                }}
              >
                {leadStages.every(s => expandedStages.has(s.label)) ? 'Collapse All' : 'Expand All'}
              </button>
            )}
          </div>
          
          <AnimatePresence>
            {leadStages.map((stage, index) => {
              const isEditing = editingStageIndex === index;
              const originalLabel = editingStageOriginalLabel || stage.label;
              const isExpanded = expandedStages.has(stage.label);
              const colorClasses = getColorClasses(stage.color);
              
              return (
                <motion.div
                  key={`${stage.label}-${index}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800/50 transition-all duration-200 group"
                >
                  {/* Stage Header */}
                  <div className={`p-4 cursor-pointer transition-colors ${isExpanded ? 'bg-secondary-50/50 dark:bg-secondary-700/30' : 'hover:bg-secondary-50/30 dark:hover:bg-secondary-700/20'}`} onClick={() => !isEditing && toggleExpand(stage.label)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div 
                           className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${colorClasses.bgClass} ${colorClasses.textClass}`}
                        >
                            <Tag className="h-5 w-5" />
                        </div>

                        <div className="flex-1">
                             {isEditing ? (
                               <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
                                 <input
                                   className="input text-sm flex-1 max-w-sm px-3 py-1.5 h-9"
                                   value={stage.label}
                                   onChange={(e) => {
                                     const newStages = leadStages.map((s, idx) => 
                                       idx === index ? { ...s, label: e.target.value } : s
                                     );
                                     onChange(newStages);
                                   }}
                                   placeholder="Lead Stage Name"
                                   autoFocus
                                 />
                                 <button
                                   className="h-9 w-9 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center justify-center transition-colors"
                                   onClick={() => updateStage(originalLabel, stage.label, index)}
                                 >
                                   <Check className="h-4 w-4" />
                                 </button>
                                 <button
                                   className="h-9 w-9 border border-secondary-300 hover:bg-secondary-100 dark:border-secondary-600 dark:hover:bg-secondary-700 rounded-lg flex items-center justify-center transition-colors"
                                   onClick={() => {
                                     setEditingStageIndex(null);
                                     setEditingStageOriginalLabel(null);
                                     if (stage.label !== originalLabel) {
                                       const restoredStages = leadStages.map((s, idx) => 
                                         idx === index ? { ...s, label: originalLabel } : s
                                       );
                                       onChange(restoredStages);
                                     }
                                   }}
                                 >
                                   <X className="h-4 w-4" />
                                 </button>
                               </div>
                             ) : (
                               <div>
                                   <div className="flex items-center gap-3">
                                        <h4 className="text-base font-bold text-secondary-900 dark:text-white">{stage.label}</h4>
                                        <div className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-secondary-100 dark:bg-secondary-700 text-secondary-600 dark:text-secondary-300">
                                            {stage.subStages.length} Sub-stages
                                        </div>
                                   </div>
                               </div>
                             )}
                        </div>
                      </div>
                      
                      {!isEditing && (
                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button
                            className="p-2 hover:bg-white dark:hover:bg-secondary-600 rounded-lg text-secondary-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors shadow-none hover:shadow-sm"
                            onClick={() => {
                              setEditingStageIndex(index);
                              setEditingStageOriginalLabel(stage.label);
                            }}
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            className="p-2 hover:bg-white dark:hover:bg-secondary-600 rounded-lg text-secondary-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shadow-none hover:shadow-sm"
                            onClick={() => deleteStage(stage.label)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <div className="w-px h-4 bg-secondary-300 dark:bg-secondary-600 mx-1"></div>
                          <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                             <ChevronDown className="h-5 w-5 text-secondary-500 dark:text-gray-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-secondary-200 dark:border-secondary-700 bg-secondary-50/30 dark:bg-secondary-900/10"
                      >
                        <div className="p-5 space-y-6">
                          {/* Color Selection */}
                          <div>
                            <label className="text-xs font-bold text-secondary-600 dark:text-gray-400 uppercase tracking-widest mb-3 block">
                              Stage Color Theme
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {AVAILABLE_COLORS.map(color => (
                                <button
                                  key={color.value}
                                  onClick={() => updateStageColor(stage.label, color.value)}
                                  className={`relative h-9 w-9 rounded-full transition-all flex items-center justify-center ${
                                    stage.color === color.value
                                      ? 'ring-2 ring-offset-2 ring-primary-500 scale-110 dark:ring-offset-secondary-800'
                                      : 'hover:scale-105'
                                  } ${color.bgClass}`}
                                  title={color.label}
                                >
                                  {stage.color === color.value && (
                                     <Check className={`h-4 w-4 ${color.textClass}`} />
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          {/* Sub-stages */}
                          <div className="bg-white dark:bg-secondary-800 rounded-xl border border-secondary-200 dark:border-secondary-700 p-4">
                            <label className="text-xs font-bold text-secondary-600 dark:text-gray-400 uppercase tracking-widest mb-3 block">
                              Sub-Stages Configuration
                            </label>
                            
                            <div className="space-y-4">
                              <div className="flex gap-2">
                                <input
                                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-900/50 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                                  placeholder="Add sub-stage..."
                                  value={newSubStage[stage.label] || ''}
                                  onChange={(e) => setNewSubStage({ ...newSubStage, [stage.label]: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') addSubStage(stage.label); }}
                                />
                                <button
                                  className="px-3 py-2 bg-secondary-100 dark:bg-secondary-700 hover:bg-secondary-200 dark:hover:bg-secondary-600 text-secondary-700 dark:text-secondary-200 rounded-lg transition-colors"
                                  onClick={() => addSubStage(stage.label)}
                                >
                                  <Plus className="h-5 w-5" />
                                </button>
                              </div>
                              
                              {stage.subStages.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {stage.subStages.map((subStage) => (
                                    <div
                                      key={subStage}
                                      className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md bg-secondary-50 dark:bg-secondary-600 text-sm border border-secondary-200 dark:border-secondary-500"
                                    >
                                      <span className="font-medium text-secondary-700 dark:text-gray-100">{subStage}</span>
                                      <button
                                        className="text-secondary-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 rounded transition-colors"
                                        onClick={() => removeSubStage(stage.label, subStage)}
                                        title="Remove"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-6 border border-dashed border-secondary-200 dark:border-secondary-700 rounded-lg bg-secondary-50/50 dark:bg-secondary-900/50">
                                  <p className="text-sm text-secondary-600 dark:text-gray-400">No sub-stages configured</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {leadStages.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-secondary-800 rounded-xl border border-secondary-200 dark:border-secondary-700 shadow-sm">
              <div className="p-4 bg-secondary-100 dark:bg-secondary-700/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <Tag className="h-8 w-8 text-secondary-500 dark:text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-secondary-900 dark:text-white mb-2">Lead Pipeline Empty</h3>
              <p className="text-secondary-600 dark:text-gray-400 max-w-sm mx-auto">Get started by adding your first lead stage to define your sales process.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ManageOptions: React.FC = () => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const saveInProgressRef = useRef(false);
  const [courses, setCourses] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [leadStages, setLeadStages] = useState<LeadStage[]>([]);
  const [activeTab, setActiveTab] = useState<'Courses' | 'Locations' | 'Status' | 'Lead Stage & Sub-Stage'>('Courses');

  // Use useQuery to fetch options and automatically refetch when cache is invalidated
  const { isLoading: loading } = useQuery(
    'options',
    () => apiService.options.get(),
    {
      staleTime: 2 * 60 * 1000, // 2 min – save updates cache via setQueryData
      onSuccess: (res) => {
        const d = res.data || {};
        setCourses(d.courses || []);
        setLocations(d.locations || []);
        setStatuses(d.statuses || []);
        setLeadStages(d.leadStages || []);
      }
    }
  );

  const saveAll = async () => {
    if (saveInProgressRef.current) return;
    saveInProgressRef.current = true;
    setSaving(true);
    try {
      const response = await apiService.options.update({ 
        courses, 
        locations, 
        statuses, 
        leadStages: leadStages as Array<{ label: string; subStages: string[] }>
      });
      // Update local state with the response data to ensure consistency
      if (response?.data) {
        setCourses(response.data.courses || []);
        setLocations(response.data.locations || []);
        setStatuses(response.data.statuses || []);
        setLeadStages(response.data.leadStages || []);
      }
      // Update the cache directly so other components get fresh data without a refetch
      queryClient.setQueryData('options', response);
      toast.success('Changes Saved');
    } catch (error: any) {
      console.error('Error saving options:', error);
      toast.error(error?.response?.data?.message || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
      saveInProgressRef.current = false;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 sm:min-h-80">
        <LoadingSpinner size="lg" label="Loading options..." />
      </div>
    );
  }

  const tabs = ['Courses', 'Locations', 'Status', 'Lead Stage & Sub-Stage'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-0 relative z-10">
         {/* Tabs Container */}
         <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide w-full sm:w-auto -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "px-4 py-3 text-[15px] font-medium transition-all whitespace-nowrap relative rounded-t-lg select-none outline-none group",
                   activeTab === tab
                     ? "text-primary-600 dark:text-primary-400 font-bold bg-primary-50/50 dark:bg-primary-900/10"
                     : "text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50"
                )}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            ))}
         </div>
          
          {/* Save Button */}
          <div className="hidden sm:block">
            <button 
              className="flex items-center gap-2 px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-lg shadow-primary-500/20 hover:shadow-primary-500/40 transform transition-all hover:scale-105 active:scale-95 text-sm font-bold tracking-wide" 
              onClick={saveAll} 
              disabled={saving}
            >
              {saving ? (
                <>
                  <LoadingSpinner size="sm" className="mr-1 text-white border-white" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
          
          {/* Mobile Save Button (Fixed Bottom) */}
          <div className="sm:hidden fixed bottom-6 right-6 z-50">
             <button 
              className="flex items-center justify-center p-4 bg-primary-500 text-white rounded-full shadow-xl shadow-primary-500/30 transform transition-all active:scale-90" 
              onClick={saveAll} 
              disabled={saving}
            >
              {saving ? <LoadingSpinner size="sm" className="text-white border-white" /> : <Save className="h-6 w-6" />}
            </button>
          </div>
      </div>

      <div className="min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'Courses' && (
                 <ListEditor 
                    title="Course Management" 
                    description="Configure the list of courses available for inquiry selection."
                    values={courses} 
                    onChange={setCourses} 
                    placeholder="Enter course name (e.g., Full Stack Development)" 
                 />
              )}
              {activeTab === 'Locations' && (
                 <ListEditor 
                    title="Office Locations" 
                    description="Manage physical center locations for student allocation."
                    values={locations} 
                    onChange={setLocations} 
                    placeholder="Enter city or branch name" 
                 />
              )}
              {activeTab === 'Status' && (
                 <ListEditor 
                    title="Inquiry Statuses" 
                    description="Define statuses to track the temperature of inquiries."
                    values={statuses} 
                    onChange={setStatuses} 
                    placeholder="Enter status (e.g., Cold, Warm, Hot)" 
                 />
              )}
              {activeTab === 'Lead Stage & Sub-Stage' && (
                 <LeadStagesEditor leadStages={leadStages} onChange={setLeadStages} />
              )}
            </motion.div>
          </AnimatePresence>
      </div>
    </div>
  );
};

export default ManageOptions;
