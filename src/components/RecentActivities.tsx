import React from "react";
import { FileCheck2, UserPlus, Receipt, AlertTriangle, Layers, BarChart3 } from "lucide-react";
import { ActivityItem } from "../types";

interface RecentActivitiesProps {
  activities: ActivityItem[];
  onViewAllActivities?: () => void;
}

export const RecentActivities: React.FC<RecentActivitiesProps> = ({
  activities,
  onViewAllActivities,
}) => {
  const getIconAndColor = (item: ActivityItem) => {
    switch (item.type) {
      case "contract":
        return {
          Icon: FileCheck2,
          bg: "bg-emerald-50 text-emerald-600 border border-emerald-100",
        };
      case "creditor":
        return {
          Icon: UserPlus,
          bg: "bg-blue-50 text-blue-600 border border-blue-100",
        };
      case "invoice":
        return {
          Icon: Receipt,
          bg: "bg-purple-50 text-purple-600 border border-purple-100",
        };
      case "alert":
        return {
          Icon: AlertTriangle,
          bg: "bg-amber-50 text-amber-600 border border-amber-100",
        };
      case "additive":
        return {
          Icon: Layers,
          bg: "bg-teal-50 text-teal-600 border border-teal-100",
        };
      case "report":
      default:
        return {
          Icon: BarChart3,
          bg: "bg-blue-50 text-blue-600 border border-blue-100",
        };
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-base font-medium text-slate-800">Atividades Recentes</h3>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Ao vivo" />
        </div>

        {/* Activity Items List */}
        <div className="mt-4 space-y-4">
          {activities.map((act) => {
            const { Icon, bg } = getIconAndColor(act);

            return (
              <div key={act.id} className="flex items-start space-x-3 group">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${bg}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-800 group-hover:text-emerald-700 transition-colors leading-tight">
                      {act.title}
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium ml-2 shrink-0">
                      {act.time}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Pill Button */}
      <div className="mt-6 pt-4 border-t border-slate-100 text-center">
        <button
          onClick={onViewAllActivities}
          className="w-full py-2.5 px-4 text-xs font-medium text-emerald-700 border border-emerald-300 hover:bg-emerald-50/80 rounded-xl transition-all cursor-pointer"
          id="ver-todas-atividades-btn"
        >
          Ver todas as atividades
        </button>
      </div>
    </div>
  );
};
