import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import { applyTheme } from './theme.js'
import { initAnalytics } from './lib/analytics.js'
import App from './App.jsx'

applyTheme()
initAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
