// frontend/src/services/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";

// Helper: decode JWT safely
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");

  if (!token) {
    // No token, go to login
    return <Navigate to="/login" replace />;
  }

  const decoded = parseJwt(token);

  if (!decoded || decoded.exp * 1000 < Date.now()) {
    // Token is invalid or expired
    localStorage.removeItem("token");
    return <Navigate to="/login" replace />;
  }

  // Valid token
  return children;
};

export default ProtectedRoute;
