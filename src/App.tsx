import { Navigate, Route, Routes } from 'react-router-dom'

import { MarketTerminalPage } from '@/features/market-terminal/market-terminal-page'
import { PatternReviewPage } from '@/features/pattern-review/pattern-review-page'
import { RazvorotkaPage } from '@/features/razvorotka/razvorotka-page'

export default function App() {
  return (
    <Routes>
      <Route path="/market" element={<MarketTerminalPage />} />
      <Route path="/mocks/pattern-review" element={<PatternReviewPage />} />
      <Route path="/mocks/razvorotka" element={<RazvorotkaPage />} />
      <Route path="*" element={<Navigate to="/market" replace />} />
    </Routes>
  )
}
