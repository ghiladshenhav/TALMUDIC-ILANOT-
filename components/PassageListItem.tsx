
import React from 'react';

interface PassageSummary {
  id: string;
  title: string;
  sourceText: string;
  branchCount: number;
  lastUpdated: string;
  themes: string[];
}

interface PassageListItemProps {
  passage: PassageSummary;
  onSelect: () => void;
}

const PassageListItem: React.FC<PassageListItemProps> = ({ passage, onSelect }) => {
  return (
    <div 
        onClick={onSelect}
        className="flex items-center gap-4 rounded-xl border border-black/10 dark:border-white/10 p-4 transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-md hover:shadow-primary/10 cursor-pointer"
    >
      <div className="flex-1">
          <h3 className="text-base font-bold text-black dark:text-white">{passage.title}</h3>
           <p className="text-sm font-semibold text-primary/80 dark:text-primary/90">{passage.sourceText}</p>
          <p className="text-xs text-black/60 dark:text-white/60 mt-1">{passage.branchCount} Branches • Last updated: {passage.lastUpdated}</p>
      </div>
      <div className="hidden sm:flex flex-wrap gap-2 justify-end max-w-xs">
          {passage.themes.map(theme => (
            <span key={theme} className="px-2 py-1 text-xs rounded bg-primary/10 text-primary/80 dark:bg-primary/20 dark:text-primary/90">{theme}</span>
          ))}
      </div>
      <span className="material-symbols-outlined text-black/40 dark:text-white/40">arrow_forward</span>
    </div>
  );
};

export default PassageListItem;
