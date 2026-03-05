import React from 'react';
import {
  Users,
  FileText,
  Clock,
  AlertCircle,
  Activity,
  GraduationCap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { DateRangeOption } from '@/components/DashboardFilters';
import { DashboardStats } from '@/types';
import { AdminOverviewTab } from './AdminOverviewTab';
import { PresalesDashboardOverview } from './PresalesDashboardOverview';
import { SalesDashboardOverview } from './SalesDashboardOverview';

interface OverviewProps {
  dateRange: DateRangeOption;
  customDateFrom: string;
  customDateTo: string;
}

export { AdminOverviewTab, PresalesDashboardOverview, SalesDashboardOverview };

interface StatCard {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
}

interface NonAdminOverviewProps extends OverviewProps {
  stats: DashboardStats | null;
  userRole: string;
}

export const NonAdminOverviewTab: React.FC<NonAdminOverviewProps> = ({ stats, userRole, dateRange, customDateFrom, customDateTo }) => {
  if (userRole === 'presales') {
    return <PresalesDashboardOverview dateRange={dateRange} customDateFrom={customDateFrom} customDateTo={customDateTo} />;
  }

  if (userRole === 'sales') {
    return <SalesDashboardOverview dateRange={dateRange} customDateFrom={customDateFrom} customDateTo={customDateTo} />;
  }

  const statCards: StatCard[] = userRole === 'admin'
    ? [
      { title: 'Total Inquiries', value: stats?.totalInquiries || 0, icon: FileText, color: 'stat-card-gradient-blue' },
      { title: 'Presales Inquiries', value: stats?.presalesInquiries || 0, icon: Users, color: 'stat-card-gradient-emerald' },
      { title: 'Sales Inquiries', value: stats?.salesInquiries || 0, icon: Activity, color: 'stat-card-gradient-purple' },
      { title: 'Admitted Students', value: stats?.admittedStudents || 0, icon: GraduationCap, color: 'stat-card-gradient-amber' },
    ]
    : [
      { title: 'Total Inquiries', value: stats?.totalInquiries || 0, icon: FileText, color: 'stat-card-gradient-blue' },
      { title: 'Hot Inquiries', value: stats?.hotInquiries || 0, icon: AlertCircle, color: 'stat-card-gradient-rose' },
      { title: 'Warm Inquiries', value: stats?.warmInquiries || 0, icon: Clock, color: 'stat-card-gradient-amber' },
      { title: 'Cold Inquiries', value: stats?.coldInquiries || 0, icon: AlertCircle, color: 'stat-card-gradient-cyan' },
      { title: 'My Raised Inquiries', value: stats?.myInquiries || 0, icon: Users, color: 'stat-card-gradient-emerald' },
      { title: 'My Attended Inquiries', value: stats?.assignedInquiries || 0, icon: Activity, color: 'stat-card-gradient-purple' },
    ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {statCards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="card"
          >
            <div className="card-content">
              <div className="flex items-center">
                <div className="shrink-0">
                  <div className={cn('p-3 rounded-lg', card.color)}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-secondary-500 dark:text-secondary-400 truncate">
                      {card.title}
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-xl sm:text-2xl font-semibold text-secondary-900 dark:text-white">
                        {card.value}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default AdminOverviewTab;
