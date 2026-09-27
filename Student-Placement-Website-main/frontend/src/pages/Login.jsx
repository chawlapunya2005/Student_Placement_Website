import React, { useState } from "react";
import api from "../services/api";
import "../styles/Auth.css";

const Login = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // ✅ send login request
      const res = await api.post("/auth/login", form, { withCredentials: true });

      // ✅ store JWT locally
      localStorage.setItem("token", res.data.token);

      setMessage("Login successful!");
      window.location.href = "/dashboard";
    } catch (err) {
      setMessage(err.response?.data?.error || "Login failed");
    }
  };

  return (
    <div className="auth-container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
        />
        <button type="submit">Login</button>
      </form>
      <p>{message}</p>

      <div style={{ marginTop: "10px" }}>
        <a href="/signup">Don’t have an account? Sign up</a><br />
        <a href="/forgot-password">Forgot password?</a>
      </div>
    </div>
  );
};

export default Login;
