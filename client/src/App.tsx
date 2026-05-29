import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import Forageables from './pages/Forageables';
import Critters from './pages/Critters';
import Quests from './pages/Quests';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-[#b88968] to-white text-slate-900">
        <Header />
        <main className="mx-auto max-w-6xl px-8 py-10">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/events" element={<Events />} />
            <Route path="/forageables" element={<Forageables />} />
            <Route path="/critters" element={<Critters />} />
            <Route path="/quests" element={<Quests />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
