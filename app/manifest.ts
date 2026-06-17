import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '簡誼 OS',
    short_name: '簡誼',
    description: '補習班管理系統',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#a40000',
    background_color: '#ffffff',
    icons: [
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
  }
}
