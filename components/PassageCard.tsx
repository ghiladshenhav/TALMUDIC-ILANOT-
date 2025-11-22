
import React from 'react';

interface PassageSummary {
  id: string;
  title: string;
  sourceText: string;
  branchCount: number;
  lastUpdated: string;
  themes: string[];
}


interface PassageCardProps {
  passage: PassageSummary;
  onSelect: () => void;
}

const PassageCard: React.FC<PassageCardProps> = ({ passage, onSelect }) => {
  return (
    <div 
        onClick={onSelect}
        className="flex flex-col gap-4 rounded-xl border border-black/10 dark:border-white/10 p-4 transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-black dark:text-white">{passage.title}</h3>
           <p className="text-sm font-semibold text-primary/80 dark:text-primary/90">{passage.sourceText}</p>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">{passage.branchCount} Branches • Last updated: {passage.lastUpdated}</p>
        </div>
        <span className="material-symbols-outlined text-black/40 dark:text-white/40 mt-1">arrow_forward</span>
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-black/80 dark:text-white/80">Key Themes:</h4>
        <div className="flex flex-wrap gap-2">
          {passage.themes.slice(0, 5).map(theme => (
            <span key={theme} className="px-2 py-1 text-xs rounded bg-primary/10 text-primary/80 dark:bg-primary/20 dark:text-primary/90">{theme}</span>
          ))}
          {passage.themes.length > 5 && <span className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">+{passage.themes.length - 5} more</span>}
        </div>
      </div>
    </div>
  );
};

export default PassageCard;
