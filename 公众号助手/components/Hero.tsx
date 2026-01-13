
import React from 'react';

export const Hero: React.FC = () => {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 py-16 px-4 sm:px-6 lg:px-8 text-white rounded-b-[3rem] shadow-2xl mb-12">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4">
          别让<span className="text-yellow-400">“低级错误”</span>毁了你的公信力
        </h1>
        <p className="text-xl md:text-2xl text-blue-100 max-w-2xl mx-auto">
          AI校对王：像顶级编辑一样审视你的文字，一键生成抓眼球的深度推文。
        </p>
      </div>
    </div>
  );
};
