// Dynamic lead stage color utility
// This provides color classes for lead stages based on configured colors

export interface LeadStageConfig {
  label: string;
  subStages: string[];
  color: string;
}

// Color mapping from color name to Tailwind classes
const COLOR_CLASSES: Record<string, { bg: string; text: string }> = {
  red: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200' },
  green: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-800 dark:text-purple-200' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900', text: 'text-pink-800 dark:text-pink-200' },
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900', text: 'text-indigo-800 dark:text-indigo-200' },
  teal: { bg: 'bg-teal-100 dark:bg-teal-900', text: 'text-teal-800 dark:text-teal-200' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-800 dark:text-orange-200' },
  gray: { bg: 'bg-gray-100 dark:bg-gray-900', text: 'text-gray-800 dark:text-gray-200' },
};

// Default fallback color
const DEFAULT_COLOR = COLOR_CLASSES.gray;

/**
 * Get color classes for a lead stage based on its configured color
 * @param leadStageLabel - The label of the lead stage
 * @param leadStages - Array of lead stage configurations from API
 * @returns Object with bg and text Tailwind classes
 */
export const getLeadStageColorClasses = (
  leadStageLabel: string,
  leadStages: LeadStageConfig[]
): { bg: string; text: string } => {
  const stage = leadStages.find(s => s.label === leadStageLabel);
  if (!stage || !stage.color) {
    return DEFAULT_COLOR;
  }
  return COLOR_CLASSES[stage.color] || DEFAULT_COLOR;
};

/**
 * Get combined class string for a lead stage badge
 * @param leadStageLabel - The label of the lead stage
 * @param leadStages - Array of lead stage configurations from API
 * @returns Combined Tailwind class string for badge styling
 */
export const getLeadStageBadgeClasses = (
  leadStageLabel: string,
  leadStages: LeadStageConfig[]
): string => {
  const colors = getLeadStageColorClasses(leadStageLabel, leadStages);
  return `${colors.bg} ${colors.text}`;
};


