
import React, { useState, useCallback } from 'react';
import { Hero } from './components/Hero';
import { CaseCard } from './components/CaseCard';
import { generateErrorCases, generateWechatArticle } from './services/geminiService';
import { ErrorCase, GeneratedArticle, AppState } from './types';

const App: React.FC = () => {
  const [topic, setTopic] = useState('职场汇报中的致命低级错误');
  const [status, setStatus] = useState<AppState>(AppState.IDLE);
  const [cases, setCases] = useState<ErrorCase[]>([]);
  const [article, setArticle] = useState<GeneratedArticle | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    
    try {
      setStatus(AppState.PRODUCING_CASES);
      const generatedCases = await generateErrorCases(topic);
      setCases(generatedCases);
      
      setStatus(AppState.GENERATING_ARTICLE);
      const generatedArticle = await generateWechatArticle(topic, generatedCases);
      setArticle(generatedArticle);
      
      setStatus(AppState.COMPLETED);
    } catch (error) {
      console.error(error);
      alert("抱歉，生成过程中遇到问题。");
      setStatus(AppState.IDLE);
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <Hero />
      
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10">
        {/* Input Section */}
        <section className="bg-white rounded-3xl shadow-xl p-8 mb-12">
          <div className="max-w-3xl mx-auto">
            <label className="block text-lg font-bold text-gray-800 mb-4">
              你想讨论什么领域的“翻车”现场？
            </label>
            <div className="flex flex-col sm:flex-row gap-4">
              <input 
                type="text" 
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例如：自媒体文案、求职信、商务邮件..."
                className="flex-grow border-2 border-gray-200 rounded-2xl px-6 py-4 text-lg focus:border-indigo-500 focus:outline-none transition-colors"
              />
              <button 
                onClick={handleGenerate}
                disabled={status !== AppState.IDLE && status !== AppState.COMPLETED}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold px-8 py-4 rounded-2xl transition-all shadow-lg hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
              >
                {status === AppState.IDLE || status === AppState.COMPLETED ? (
                  <>✨ 立即生成爆文素材</>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{status === AppState.PRODUCING_CASES ? '捕捉典型错误中...' : '大牛主编创作中...'}</span>
                  </div>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Results Section */}
        {cases.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Case List */}
            <div className="lg:col-span-5 space-y-6">
              <h3 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                <span className="bg-red-500 text-white p-1 rounded">Bug</span> 典型“翻车”案例
              </h3>
              {cases.map((c) => (
                <CaseCard key={c.id} errorCase={c} />
              ))}
            </div>

            {/* Article Preview */}
            <div className="lg:col-span-7">
              <div className="bg-white rounded-3xl shadow-2xl p-8 border-t-8 border-indigo-600 sticky top-10">
                <div className="flex items-center justify-between mb-8 border-b pb-4">
                  <h3 className="text-2xl font-black text-gray-900">
                    公众号文章预览
                  </h3>
                  <button 
                    onClick={() => {
                      if (article) navigator.clipboard.writeText(`${article.title}\n\n${article.content}`);
                      alert("内容已复制到剪贴板");
                    }}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-bold flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    一键复制
                  </button>
                </div>

                {article ? (
                  <article className="article-preview prose prose-indigo max-w-none">
                    <h1 className="text-3xl leading-tight mb-6">{article.title}</h1>
                    <div className="bg-indigo-50 p-4 rounded-xl mb-6 text-sm text-indigo-800 italic">
                      <strong>导读：</strong> {article.summary}
                    </div>
                    {/* Render Markdown-like content manually for simplicity */}
                    <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                      {article.content.split('\n').map((line, i) => {
                        if (line.startsWith('###')) return <h3 key={i} className="text-xl font-bold mt-6 mb-3 text-gray-900">{line.replace('###', '')}</h3>;
                        if (line.startsWith('**')) return <p key={i} className="font-bold my-2">{line.replaceAll('**', '')}</p>;
                        return <p key={i} className="mb-4">{line}</p>;
                      })}
                    </div>
                  </article>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <svg className="w-16 h-16 mb-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <p>正在为您编撰高分推文内容...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Features list when idle */}
        {status === AppState.IDLE && !cases.length && (
          <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">🔍</div>
              <h4 className="text-xl font-bold mb-2">全维扫描</h4>
              <p className="text-gray-600">从错别字到意识流逻辑，从违禁词到行业黑话，全方位死角捕捉。</p>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">💡</div>
              <h4 className="text-xl font-bold mb-2">深度润色</h4>
              <p className="text-gray-600">不仅是改错，更是升级。提供更地道、更专业的表达建议。</p>
            </div>
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">🚀</div>
              <h4 className="text-xl font-bold mb-2">一键爆文</h4>
              <p className="text-gray-600">基于校对结果自动生成富有洞察力的科普推文，省去排版构思烦恼。</p>
            </div>
          </div>
        )}
      </main>

      {/* Footer sticky bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t py-4 text-center z-50">
        <p className="text-gray-500 text-sm">
          Powered by <span className="text-indigo-600 font-bold">AI校对王 & Gemini 3.0</span> • 专业写作，从零瑕疵开始
        </p>
      </footer>
    </div>
  );
};

export default App;
