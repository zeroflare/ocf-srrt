import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.tsx'
import './index.css'
import './i18n'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <Suspense fallback={
                <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center font-mono">
                    <div className="animate-pulse flex flex-col items-center">
                        <div className="h-4 w-4 bg-blue-500 rounded-full mb-4 animate-bounce"></div>
                        Loading Configuration...
                    </div>
                </div>
            }>
                <App />
            </Suspense>
        </BrowserRouter>
    </React.StrictMode>,
)