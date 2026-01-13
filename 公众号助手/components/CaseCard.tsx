
import React from 'react';
import { ErrorCase } from '../types';

interface CaseCardProps {
  errorCase: ErrorCase;
}

export const CaseCard: React.FC<CaseCardProps> = ({ errorCase }) => {
  const getCategoryLabel = (cat: string) => {
    switch(cat) {
      case 'typo': return '错别字';
      case 'grammar': return '病句';
      case 'logic': return '逻辑错误';
      case 'sensitivity': return '敏感/违禁';
      default: return '其他';
    }
  };

  const getCategoryColor = (cat: string) => {
    switch(cat) {
      case 'typo': return 'bg-red-100 text-red-700';
      case 'grammar': return 'bg-orange-100 text-orange-700';
      case 'logic': return 'bg-purple-100 text-purple-700';
      case 'sensitivity': return 'bg-gray-800 text-white';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-center mb-4">
        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getCategoryColor(errorCase.category)}`}>
          {getCategoryLabel(errorCase.category)}
        </span>
        <span className="text-gray-400 text-sm italic">案例 #{errorCase.id.slice(-4)}</span>
      </div>
      
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">初稿原文</h4>
          <p className="text-gray-800 bg-red-50 p-3 rounded-lg border-l-4 border-red-500 line-through">
            {errorCase.original}
          </p>
        </div>
        
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">AI 优化后</h4>
          <p className="text-gray-900 bg-green-50 p-3 rounded-lg border-l-4 border-green-500 font-medium">
            {errorCase.corrected}
          </p>
        </div>
        
        <div className="pt-2">
          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg italic">
            <span className="font-bold text-indigo-600">为什么改：</span>{errorCase.reason}
          </p>
        </div>
      </div>
    </div>
  );
};
