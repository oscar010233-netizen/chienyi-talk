'use client'

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 mb-3 border-b border-border pb-2 text-lg font-semibold text-foreground">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed text-foreground/80">{children}</p>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-gold/50 pl-4 text-sm text-muted-foreground dark:border-[#ff4d4f]/50">{children}</blockquote>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 ml-5 list-disc space-y-1 text-foreground/80">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1 text-foreground/80">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs text-foreground/80">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-gold dark:text-[#ff4d4f]">
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre className="my-3">{children}</pre>,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-separate border-spacing-0 text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="group">{children}</tr>,
  th: ({ children }) => (
    <th className="border-b border-border bg-muted/60 px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/50 px-4 py-2 text-sm text-foreground/80 group-last:border-0">
      {children}
    </td>
  ),
  hr: () => <hr className="my-8 border-border" />,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  details: ({ children }) => (
    <details className="my-3 rounded-lg border border-border open:bg-muted/20">{children}</details>
  ),
  summary: ({ children }) => (
    <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-foreground select-none hover:bg-muted/40">
      {children}
    </summary>
  ),
}

export function DocsRenderer({ content }: { content: string }) {
  return <ReactMarkdown components={components}>{content}</ReactMarkdown>
}
