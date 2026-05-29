import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DateProvider } from './context/DateContext';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import Forageables from './pages/Forageables';
import Critters from './pages/Critters';
import Quests from './pages/Quests';
import Login from './pages/Login';
import SignUp from './pages/SignUp';

export default function App() {
  return (
    <BrowserRouter>
      <DateProvider>
        <AuthProvider>
          <div className="min-h-screen bg-gradient-to-br from-[#b88968] to-white text-slate-900">
            <Header />
            <main className="mx-auto max-w-6xl px-8 py-10">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<SignUp />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Navigate to="/dashboard" replace />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/events"
                  element={
                    <ProtectedRoute>
                      <Events />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/forageables"
                  element={
                    <ProtectedRoute>
                      <Forageables />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/critters"
                  element={
                    <ProtectedRoute>
                      <Critters />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/quests"
                  element={
                    <ProtectedRoute>
                      <Quests />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </main>
          </div>
        </AuthProvider>
      </DateProvider>
    </BrowserRouter >
  );
}
