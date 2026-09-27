import jwt from "jsonwebtoken";

export default function authMiddleware(req, res, next) {
  const token = req.cookies?.token || (req.header("Authorization")?.split(" ")[1]);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
