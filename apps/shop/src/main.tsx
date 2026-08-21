import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CustomerApp from './CustomerApp'
import './base.css'
import './customer.css'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerApp />
  </StrictMode>,
)
