import { readFileSync } from 'fs'
import { join } from 'path'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

export default function DocsPage() {
  const md = readFileSync(join(process.cwd(), 'docs', 'app-map.md'), 'utf-8')
  const html = marked(md) as string

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="docs-content mx-auto max-w-4xl px-6 py-8 pb-nav-safe md:pb-8"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
