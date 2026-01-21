import React from 'react';
import { ThemeProvider } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import theme from './theme';
// Auth commented out for personal use
// import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './pages/app/Dashboard';
// import Landing from './pages/static/Landing';

// Auth protection removed for personal use
// function ProtectedRoute({ children }) {
//   const { user, hasLicense } = useAuth();
//   if (!user || !hasLicense) {
//     return <Navigate to="/" />;
//   }
//   return children;
// }

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          {/* Go directly to Dashboard - no auth needed */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/app" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
