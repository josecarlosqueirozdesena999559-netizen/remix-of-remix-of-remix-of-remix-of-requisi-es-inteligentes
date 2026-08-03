import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  trendText?: string;
  icon?: LucideIcon;
  variant: "green" | "amber" | "blue" | "purple";
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  trendText,
  variant,
  onClick,
}) => {
  // Styles for different KPI themes based on screenshot
  const styles = {
    green: {
      trendBg: "bg-emerald-50 text-emerald-700",
      valueColor: "text-slate-900",
    },
    amber: {
      trendBg: "bg-amber-50 text-amber-700",
      valueColor: "text-slate-900",
    },
    blue: {
      trendBg: "bg-blue-50 text-blue-700",
      valueColor: "text-slate-900",
    },
    purple: {
      trendBg: "bg-purple-50 text-purple-700",
      valueColor: "text-slate-900",
    },
  }[variant];

  return (
    <div
      onClick={onClick}
      className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{title}</span>
      </div>

      <div className="mt-3">
        <div className={`text-2xl font-medium tracking-tight ${styles.valueColor}`}>{value}</div>
        {trendText && (
          <div className="mt-2 inline-flex items-center space-x-1">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${styles.trendBg}`}>
              {trendText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
