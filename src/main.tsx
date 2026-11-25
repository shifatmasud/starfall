import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

const params = new URLSearchParams(location.search)
const requested = Number(params.get('scene') ?? '1')
const scene = Number.isFinite(requested) && requested >= 1 && requested <= 8 ? Math.round(requested) : 1

createRoot(container).render(
  <StrictMode>
    <App scene={scene} />
  </StrictMode>,
)
