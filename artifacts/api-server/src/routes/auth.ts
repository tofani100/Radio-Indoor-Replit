import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Bad Request", message: "Email and password required" });
    return;
  }
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.email, email)).limit(1);
  if (!admin) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }
  req.session.adminId = admin.id;
  res.json({ id: admin.id, email: admin.email, name: admin.name, role: "admin" });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logged out" });
  });
});

router.get("/auth/me", requireAdmin, async (req, res) => {
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.id, req.session.adminId!)).limit(1);
  if (!admin) {
    res.status(401).json({ error: "Unauthorized", message: "Session invalid" });
    return;
  }
  res.json({ id: admin.id, email: admin.email, name: admin.name, role: "admin" });
});

export default router;
