import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/manrope'
import './styles.css'
import './features/cart.css'

createRoot(document.getElementById('root')).render(<App />)
