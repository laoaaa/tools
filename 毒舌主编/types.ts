
export interface ErrorCase {
  id: string;
  original: string;
  corrected: string;
  reason: string;
  category: 'typo' | 'grammar' | 'logic' | 'sensitivity';
}

export interface GeneratedArticle {
  title: string;
  content: string;
  summary: string;
}

export enum AppState {
  IDLE = 'IDLE',
  PRODUCING_CASES = 'PRODUCING_CASES',
  GENERATING_ARTICLE = 'GENERATING_ARTICLE',
  COMPLETED = 'COMPLETED'
}
