import { readFileSync } from 'fs'
import { join } from 'path'
import { DocsRenderer } from './DocsRenderer'

export default function DocsPage() {
  const content = readFileSync(join(process.cwd(), 'docs', 'app-map.md'), 'utf-8')
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8 pb-nav-safe md:pb-8">
        <DocsRenderer content={content} />
      </div>
    </div>
  )
}
