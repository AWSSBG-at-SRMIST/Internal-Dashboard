'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-[#f0f0f0] mt-4 mb-2 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-bold text-[#f0f0f0] mt-3 mb-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-bold text-[#e0e0e0] mt-2 mb-1 first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0 text-[#d0d0d0] leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 text-[#d0d0d0]">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 text-[#d0d0d0]">{children}</ol>,
  li: ({ children }) => <li className="text-[#d0d0d0]">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-[#f0f0f0]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[#ccc]">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#FF9900] hover:underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[#FF9900]/50 pl-3 my-2 text-[#888] italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-[#2d2d2d] my-3" />,
  code: ({ className, children }) => {
    const isBlock = Boolean(className);
    return isBlock ? (
      <code className="block bg-[#111] border border-[#2d2d2d] p-3 mb-2 overflow-x-auto text-xs font-mono text-[#e0e0e0] rounded-sm whitespace-pre">
        {children}
      </code>
    ) : (
      <code className="px-1.5 py-0.5 bg-[#1a1a1a] border border-[#333] text-[#FF9900] text-xs font-mono rounded-sm">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[#2d2d2d] px-3 py-1.5 bg-[#1a1a1a] text-left font-bold text-[#aaa] text-xs uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-[#2d2d2d] px-3 py-1.5 text-[#ccc]">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
